<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Loader2, Maximize2, X } from '@lucide/vue';
import { useDraggable, useDragDropMonitor } from '@dnd-kit/vue';
import { usePlayerStore } from '../stores/player';
import { createLogger } from '../lib/logger';
import { EMPTY_ASS } from '../lib/subtitles';
import JASSUB from 'jassub';
import jassubWorkerUrl from 'jassub/dist/worker/worker.js?worker&url';
import jassubWasmUrl from 'jassub/dist/wasm/jassub-worker.wasm?url';
import jassubModernWasmUrl from 'jassub/dist/wasm/jassub-worker-modern.wasm?url';
import '@videojs/html/video/player';
import '@videojs/html/video/minimal-skin';

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const MINI_W = 288;
const MINI_H = 162;
const HEADER_H = 56;
const BAR_H = 74;
const MARGIN = 20;

const log = createLogger('player');
const route = useRoute();
const router = useRouter();
const player = usePlayerStore();

const videoRef = ref<HTMLVideoElement | null>(null);
const containerRef = ref<HTMLElement | null>(null);

function getVideo(): HTMLVideoElement | null {
    return videoRef.value ?? document.querySelector<HTMLVideoElement>('video-player video');
}
const isPlayerRoute = computed(() => route.path === '/player');
const isVisible = computed(() => isPlayerRoute.value || Boolean(player.streamUrl));
const playbackSrc = computed(() => (player.subtitlesReady ? player.streamUrl : null));

// ─── corner-snap positioning ──────────────────────────────────────────────────
const corner = ref<Corner>('bottom-right');

function cornerPosition(c: Corner): { top: number; left: number } {
    const bottomEdge = window.innerHeight - BAR_H - MINI_H - MARGIN;
    return {
        'top-left': { top: HEADER_H + MARGIN, left: MARGIN },
        'top-right': { top: HEADER_H + MARGIN, left: window.innerWidth - MINI_W - MARGIN },
        'bottom-left': { top: bottomEdge, left: MARGIN },
        'bottom-right': { top: bottomEdge, left: window.innerWidth - MINI_W - MARGIN },
    }[c];
}

function nearestCorner(top: number, left: number): Corner {
    const cx = left + MINI_W / 2;
    const cy = top + MINI_H / 2;
    const isLeft = cx < window.innerWidth / 2;
    const isTop = cy < (window.innerHeight + HEADER_H) / 2;
    return `${isTop ? 'top' : 'bottom'}-${isLeft ? 'left' : 'right'}` as Corner;
}

const miniStyle = computed(() => {
    const pos = cornerPosition(corner.value);
    return { top: `${pos.top}px`, left: `${pos.left}px` };
});

// ─── dnd-kit drag ─────────────────────────────────────────────────────────────
const { isDragging } = useDraggable({
    id: 'mini-player',
    element: containerRef,
    disabled: () => isPlayerRoute.value,
});

useDragDropMonitor({
    onDragEnd(event) {
        if (event.canceled || event.operation.source?.id !== 'mini-player') return;
        const pos = cornerPosition(corner.value);
        corner.value = nearestCorner(
            pos.top + event.operation.transform.y,
            pos.left + event.operation.transform.x
        );
    },
});

// ─── JASSUB ──────────────────────────────────────────────────────────────────
let assRenderer: JASSUB | null = null;
let fontsLoaded = false;

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
        .then(() => log.debug('JASSUB runtime ready'))
        .catch((error) => log.debug('JASSUB runtime failed to initialize', error));
    return assRenderer;
}

// ─── subtitle sync ───────────────────────────────────────────────────────────
function syncSubtitleMode() {
    const v = getVideo();
    if (!v) return;
    for (const track of Array.from(v.textTracks)) {
        track.mode = track.language === player.activeSubtitle ? 'showing' : 'disabled';
    }
}

// ─── fullscreen click-to-play ─────────────────────────────────────────────────
function handleFullscreenClick(e: MouseEvent) {
    if (!isPlayerRoute.value) return;
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
    if (!path.some((el) => el instanceof HTMLVideoElement)) return;
    const v = getVideo();
    if (v) v.paused ? v.play() : v.pause();
}

// ─── keyboard handler ─────────────────────────────────────────────────────────
function handleKeydown(e: KeyboardEvent) {
    if (!isPlayerRoute.value) return;
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

// ─── lifecycle ────────────────────────────────────────────────────────────────
onMounted(async () => {
    await nextTick();
    const v = getVideo();
    if (v) {
        player.setVideoElement(v);
        v.addEventListener('play', () => (player.isPlaying = true));
        v.addEventListener('pause', () => (player.isPlaying = false));
        v.addEventListener('timeupdate', () => (player.currentTime = v.currentTime));
        v.addEventListener('durationchange', () => (player.duration = v.duration));
        v.addEventListener('seeking', () => player.resetSubtitleCues());
        v.addEventListener('volumechange', () => {
            player.isMuted = v.muted;
            player.volume = v.volume;
        });
    }

    const skinEl = document.querySelector('video-minimal-skin');
    if (skinEl?.shadowRoot) {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync('.media-minimal-skin--video::after { display: none; }');
        skinEl.shadowRoot.adoptedStyleSheets = [...skinEl.shadowRoot.adoptedStyleSheets, sheet];
    }

    void ensureAssRenderer();
    document.addEventListener('keydown', handleKeydown);

    if (
        route.path === '/player' &&
        player.pendingMagnet &&
        !player.torrentId &&
        !player.streamUrl
    ) {
        void player.startStream(player.pendingMagnet);
    }
});

onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown);
    void destroyAssRenderer();
});

watch(
    () => route.path,
    (path) => {
        if (path === '/player' && player.pendingMagnet && !player.torrentId && !player.streamUrl) {
            void player.startStream(player.pendingMagnet);
        }
    }
);

watch(
    () => player.torrentId,
    (id) => {
        if (!id) void destroyAssRenderer();
    }
);

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

watch(
    () => player.trackMeta,
    (tracks) => {
        if (!tracks.length) fontsLoaded = false;
        if (!tracks.some((track) => track.format === 'ass')) void destroyAssRenderer();
    }
);

watch(
    [() => player.subtitles, () => player.activeSubtitle],
    ([tracks]) => {
        const v = getVideo();
        if (!v) return;

        const activeTrack =
            tracks.find((t) => t.lang === player.activeSubtitle) ??
            tracks.find((t) => t.format === 'ass') ??
            null;

        if (activeTrack?.format === 'ass') {
            v.querySelectorAll('track').forEach((t) => t.remove());
            queueMicrotask(async () => {
                const video = getVideo();
                if (!video || !activeTrack || activeTrack.format !== 'ass') return;
                const renderer = await ensureAssRenderer();
                if (!renderer) return;
                await renderer.setVideo(video).catch(() => {});
                if (!fontsLoaded && activeTrack.fonts && activeTrack.fonts.length > 0) {
                    fontsLoaded = true;
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

        void destroyAssRenderer();
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
</script>

<template>
    <div
        v-show="isVisible"
        ref="containerRef"
        :class="[
            isPlayerRoute ? 'player-fullscreen' : 'player-mini',
            { 'is-dragging': isDragging },
        ]"
        :style="[
            !isPlayerRoute ? miniStyle : {},
            isPlayerRoute && player.streamUrl ? { bottom: '74px' } : {},
        ]"
        @click="handleFullscreenClick"
    >
        <!-- Loading state (fullscreen only) -->
        <div
            v-if="isPlayerRoute && (!player.streamUrl || !player.subtitlesReady)"
            class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-neutral-950 text-white/60 text-sm pointer-events-none"
        >
            <Loader2 :size="22" class="animate-spin" />
            <div class="text-center space-y-1">
                <p class="font-medium text-white/80">
                    {{ player.loadingMessage ?? 'Loading player…' }}
                </p>
                <p class="text-xs text-white/35">Playback will start when the stream is ready.</p>
            </div>
        </div>

        <!-- Video -->
        <div class="relative h-full">
            <video-player v-show="player.streamUrl || isPlayerRoute" class="vjs-player">
                <video-minimal-skin>
                    <video ref="videoRef" playsinline :src="playbackSrc ?? undefined" />
                </video-minimal-skin>
            </video-player>

            <!-- Mini hover overlay: stop + expand only -->
            <div
                v-if="!isPlayerRoute"
                class="mini-overlay absolute inset-0 flex items-center justify-center gap-3"
            >
                <button
                    class="p-1.5 rounded-full bg-white/10 hover:bg-white/25 text-white/70 hover:text-white transition-colors"
                    title="Stop"
                    @mousedown.stop
                    @click.stop="player.stopStream()"
                >
                    <X :size="14" />
                </button>
                <button
                    class="p-1.5 rounded-full bg-white/10 hover:bg-white/25 text-white/70 hover:text-white transition-colors"
                    title="Expand to player"
                    @mousedown.stop
                    @click.stop="router.push('/player')"
                >
                    <Maximize2 :size="14" />
                </button>
            </div>
        </div>
    </div>
</template>

<style>
.player-fullscreen {
    position: fixed;
    top: 56px;
    left: 8px;
    right: 8px;
    bottom: 8px;
    z-index: 10;
    border-radius: 6px;
    overflow: hidden;
    background: black;
}

.player-mini {
    position: fixed;
    z-index: 50;
    width: 288px;
    height: 162px;
    border-radius: 10px;
    overflow: hidden;
    background: #0a0a0a;
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);
    cursor: grab;
    transition:
        top 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94),
        left 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.player-mini.is-dragging {
    cursor: grabbing;
    transition: none;
    box-shadow: 0 28px 80px rgba(0, 0, 0, 0.85);
}

.mini-overlay {
    opacity: 0;
    background: rgba(0, 0, 0, 0);
    transition:
        opacity 0.15s ease,
        background 0.15s ease;
}

.player-mini:hover .mini-overlay {
    opacity: 1;
    background: rgba(0, 0, 0, 0.45);
}

.vjs-player {
    display: block;
    position: relative;
    width: 100%;
    height: 100%;
}

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
</style>
