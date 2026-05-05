<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue';
import { createLogger } from '../lib/logger';

const log = createLogger('player');
import { Loader2 } from '@lucide/vue';
import { usePlayerStore } from '../stores/player';
import JASSUB from 'jassub';
import jassubWorkerUrl from 'jassub/dist/worker/worker.js?worker&url';
import jassubWasmUrl from 'jassub/dist/wasm/jassub-worker.wasm?url';
import jassubModernWasmUrl from 'jassub/dist/wasm/jassub-worker-modern.wasm?url';
import '@videojs/html/video/player';
import '@videojs/html/video/minimal-skin';

const player = usePlayerStore();
const playbackSrc = computed(() => (player.subtitlesReady ? player.streamUrl : null));

let videoEl: HTMLVideoElement | null = null;
let assRenderer: JASSUB | null = null;

const EMPTY_ASS = `[Script Info]
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,54,&H00FFFFFF,&H000000FF,&H00000000,&H78000000,0,0,0,0,100,100,0,0,1,2,1,2,40,40,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

function getVideo(): HTMLVideoElement | null {
    return videoEl ?? (videoEl = document.querySelector('video-player video'));
}

async function destroyAssRenderer() {
    if (!assRenderer) return;
    log.debug('Destroying JASSUB renderer');
    const renderer = assRenderer;
    assRenderer = null;
    await renderer.destroy().catch(() => {});
}

async function ensureAssRenderer() {
    const video = getVideo();
    if (!video || assRenderer) return assRenderer;

    log.debug('Booting JASSUB runtime');
    assRenderer = new JASSUB({
        video,
        subContent: EMPTY_ASS,
        workerUrl: jassubWorkerUrl,
        wasmUrl: jassubWasmUrl,
        modernWasmUrl: jassubModernWasmUrl,
        debug: true,
    });

    await assRenderer.ready
        .then(() => {
            log.debug('JASSUB runtime ready');
        })
        .catch((error) => {
            log.debug('JASSUB runtime failed to initialize', error);
        });

    return assRenderer;
}

function syncSubtitleMode() {
    const v = getVideo();
    if (!v) return;

    for (const track of Array.from(v.textTracks)) {
        const isActive = track.language === player.activeSubtitle;
        track.mode = isActive ? 'showing' : 'disabled';
    }
}

function handleKeydown(e: KeyboardEvent) {
    const v = getVideo();
    if (!v) return;
    if (e.code === 'Space') {
        e.preventDefault();
        v.paused ? v.play() : v.pause();
    } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        v.currentTime = Math.min(v.currentTime + 10, v.duration);
    } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        v.currentTime = Math.max(v.currentTime - 10, 0);
    } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        v.volume = Math.min(v.volume + 0.1, 1);
    } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        v.volume = Math.max(v.volume - 0.1, 0);
    }
}

function handleClick(e: MouseEvent) {
    const path = e.composedPath();
    const isControl = path.some(
        (el) =>
            el instanceof HTMLElement &&
            (el.tagName === 'BUTTON' ||
                el.tagName === 'INPUT' ||
                el.tagName === 'SELECT' ||
                el.getAttribute('role') === 'button' ||
                el.getAttribute('role') === 'slider')
    );
    if (isControl) return;

    const clickedVideoSurface = path.some((el) => el instanceof HTMLVideoElement);
    if (!clickedVideoSurface) return;

    const v = getVideo();
    if (!v) return;
    v.paused ? v.play() : v.pause();
}

onMounted(() => {
    const v = getVideo();
    if (v) {
        v.addEventListener('play', () => {
            player.isPlaying = true;
        });
        v.addEventListener('pause', () => {
            player.isPlaying = false;
        });
        v.addEventListener('timeupdate', () => {
            player.currentTime = v.currentTime;
        });
        v.addEventListener('durationchange', () => {
            player.duration = v.duration;
        });
    }
    void ensureAssRenderer();
    if (player.pendingMagnet && !player.torrentId && !player.streamUrl) {
        void player.startStream(player.pendingMagnet);
    }
    document.addEventListener('keydown', handleKeydown);
});

watch(
    [() => player.streamUrl, () => player.subtitlesReady],
    ([url, subtitlesReady]) => {
        const v = getVideo();
        if (!v) return;
        log.debug('Playback gate changed', { hasUrl: Boolean(url), subtitlesReady });
        if (url && subtitlesReady) v.play().catch(() => {});
        else v.pause();
    },
    { flush: 'post' }
);

// Subtitles arrive as blob URLs - attach directly, no fetch needed
watch(
    [() => player.subtitles, () => player.activeSubtitle],
    ([tracks]) => {
        const v = getVideo();
        if (!v) return;

        const activeTrack =
            tracks.find((track) => track.lang === player.activeSubtitle) ??
            tracks.find((track) => track.format === 'ass') ??
            null;

        log.debug(
            'Subtitle state changed',
            tracks.map((track) => ({
                lang: track.lang,
                label: track.label,
                format: track.format,
                size: track.content.length,
                fonts: track.fonts?.length ?? 0,
            })),
            'active=',
            activeTrack ? `${activeTrack.label}(${activeTrack.format})` : 'none'
        );

        if (activeTrack?.format === 'ass') {
            v.querySelectorAll('track').forEach((t) => t.remove());

            queueMicrotask(async () => {
                const video = getVideo();
                if (!video || !activeTrack || activeTrack.format !== 'ass') return;
                const renderer = await ensureAssRenderer();
                if (!renderer) return;

                log.debug('Updating JASSUB track', {
                    label: activeTrack.label,
                    contentLength: activeTrack.content.length,
                    fonts: activeTrack.fonts?.length ?? 0,
                    dialogueCount: (activeTrack.content.match(/^Dialogue:/gm) ?? []).length,
                });
                await renderer.setVideo(video).catch(() => {});
                if (activeTrack.fonts && activeTrack.fonts.length > 0) {
                    await renderer.renderer.addFonts([...activeTrack.fonts]).catch((error) => {
                        log.debug('JASSUB addFonts failed', error);
                    });
                }
                await renderer.renderer.setTrack(activeTrack.content).catch((error) => {
                    log.debug('JASSUB setTrack failed', error);
                });
            });

            return;
        }

        v.querySelectorAll('track').forEach((t) => t.remove());
        for (const t of tracks) {
            if (t.format !== 'vtt' || !t.blobUrl) continue;
            const track = document.createElement('track');
            track.kind = 'subtitles';
            track.src = t.blobUrl;
            track.srclang = t.lang;
            track.label = t.label;
            track.default = player.activeSubtitle === t.lang;
            track.addEventListener('load', syncSubtitleMode, { once: true });
            v.appendChild(track);
        }

        queueMicrotask(syncSubtitleMode);
    },
    { flush: 'post' }
);

onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown);
    void destroyAssRenderer();
    player.stopStream();
});
</script>

<template>
    <div class="relative w-full h-full overflow-hidden" @click="handleClick">
        <div
            v-if="!player.streamUrl || !player.subtitlesReady"
            class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-neutral-950 text-white/60 text-sm pointer-events-none"
        >
            <Loader2 :size="22" class="animate-spin" />
            <div class="text-center space-y-1">
                <p class="font-medium text-white/80">
                    {{ player.loadingMessage ?? 'Loading player…' }}
                </p>
                <p class="text-xs text-white/35">Playback will start when subtitles are ready.</p>
            </div>
        </div>

        <video-player v-show="player.streamUrl" class="vjs-player">
            <video-minimal-skin>
                <video playsinline :src="playbackSrc ?? undefined" />
            </video-minimal-skin>
        </video-player>
    </div>
</template>

<style>
.vjs-player,
.vjs-player video-minimal-skin,
.vjs-player video {
    display: block;
    width: 100%;
    height: 100%;
}

.vjs-player video {
    object-fit: contain;
}

.vjs-player {
    --media-border-radius: 0;
    --media-video-border-radius: 0;
    --media-border-color: transparent;
    --media-surface-inner-border-color: transparent;
    --media-surface-outer-border-color: transparent;
    --media-surface-shadow-color: transparent;
}

.media-minimal-skin--video::after {
    display: none;
}
</style>
