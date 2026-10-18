<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDraggable, useDragDropMonitor } from '@dnd-kit/vue';
import '@videojs/html/video/ui';
import '@videojs/html/base.css';
import { toast } from '../lib/toast';
import { usePlayerStore } from '../stores/player';
import { useProgressStore } from '../stores/progress';
import { useQueueStore } from '../stores/queue';
import { formatTimestamp } from '../lib/watching';
import { useSubtitleRenderer } from '../lib/subtitles';
import { useControlsHover } from '../lib/controls-hover';
import { AudioBridge } from '../lib/audio-bridge';
import { errorMessage } from '../lib/format';
import PlayerControls from './player/PlayerControls.vue';
import PlayerStatus from './player/PlayerStatus.vue';
import MiniPlayerOverlay from './player/MiniPlayerOverlay.vue';
import UpNext from './player/UpNext.vue';
import PlayerContextMenu from './player/PlayerContextMenu.vue';
import SkipChapter from './player/SkipChapter.vue';
import TorrentPickerDialog from './TorrentPickerDialog.vue';

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const MINI_W = 320;
const MINI_H = 180;
const HEADER_H = 56;
const MARGIN = 20;
const SURFACE_TAGS = new Set(['VIDEO', 'CANVAS', 'MEDIA-CONTROLS']);
const DOUBLE_CLICK_MS = 150;

const HOTKEYS = [
    { keys: 'Space', action: 'togglePaused' },
    { keys: 'k', action: 'togglePaused' },
    { keys: 'f', action: 'toggleFullscreen' },
    { keys: 'm', action: 'toggleMuted' },
    { keys: 'ArrowLeft', action: 'seekStep', value: -5 },
    { keys: 'ArrowRight', action: 'seekStep', value: 5 },
    { keys: 'j', action: 'seekStep', value: -10 },
    { keys: 'l', action: 'seekStep', value: 10 },
    { keys: 'ArrowUp', action: 'volumeStep', value: 0.05 },
    { keys: 'ArrowDown', action: 'volumeStep', value: -0.05 },
    { keys: '0-9', action: 'seekToPercent' },
];

const route = useRoute();
const router = useRouter();
const player = usePlayerStore();
const progress = useProgressStore();
const queue = useQueueStore();

const videoRef = ref<HTMLVideoElement | null>(null);
const containerRef = ref<HTMLElement | null>(null);
const mediaContainerRef = ref<HTMLElement | null>(null);
const isFullscreen = ref(false);
const viewport = ref({ width: window.innerWidth, height: window.innerHeight });

const getVideo = () => videoRef.value;
const isPlayerRoute = computed(() => route.path === '/player');
const isVisible = computed(() => isPlayerRoute.value || Boolean(player.streamUrl));

useSubtitleRenderer(getVideo);
useControlsHover(() => mediaContainerRef.value);

// ─── corner-snap positioning ──────────────────────────────────────────────────
const corner = ref<Corner>('bottom-right');

function cornerPosition(c: Corner): { top: number; left: number } {
    const { width, height } = viewport.value;
    const top = c.startsWith('top') ? HEADER_H + MARGIN : height - MINI_H - MARGIN;
    const left = c.endsWith('left') ? MARGIN : width - MINI_W - MARGIN;
    return { top, left };
}

function nearestCorner(top: number, left: number): Corner {
    const { width, height } = viewport.value;
    const isLeft = left + MINI_W / 2 < width / 2;
    const isTop = top + MINI_H / 2 < (height + HEADER_H) / 2;
    return `${isTop ? 'top' : 'bottom'}-${isLeft ? 'left' : 'right'}`;
}

const miniStyle = computed(() => {
    const pos = cornerPosition(corner.value);
    return { top: `${pos.top}px`, left: `${pos.left}px` };
});

// ─── dnd-kit drag ─────────────────────────────────────────────────────────────
let justDragged = false;

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
        justDragged = true;
        setTimeout(() => (justDragged = false));
    },
});

function onMiniClick() {
    if (!isPlayerRoute.value && !justDragged) void router.push('/player');
}

// ─── click to pause, double click for fullscreen ──────────────────────────────
function togglePaused() {
    const v = getVideo();
    if (v) v.paused ? void v.play() : v.pause();
}

// The frame at its own resolution, with the subtitles JASSUB draws over the video picture
async function copyScreenshot() {
    const v = getVideo();
    if (!v?.videoWidth) return;
    try {
        const canvas = document.createElement('canvas');
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('No canvas context');
        context.drawImage(v, 0, 0);
        const subtitles = player.activeTrackId
            ? mediaContainerRef.value?.querySelector('canvas')
            : null;
        if (subtitles?.width) context.drawImage(subtitles, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
        if (!blob) throw new Error('Could not encode the frame');
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        toast.success('Screenshot copied');
    } catch (err) {
        toast.error(`Couldn't copy the screenshot: ${errorMessage(err)}`);
    }
}

function seek(time: number) {
    const v = getVideo();
    if (v) v.currentTime = time;
}

function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void mediaContainerRef.value?.requestFullscreen();
}

// A single click waits briefly to see if it becomes a double click, so going fullscreen doesn't
// pause. A slower double click undoes the pause the first click already made.
let clickTimer: ReturnType<typeof setTimeout> | undefined;
let clickToggled = false;

function onSurfaceClick(event: MouseEvent) {
    if (!isPlayerRoute.value || !SURFACE_TAGS.has((event.target as Element).tagName)) return;
    clearTimeout(clickTimer);
    if (event.detail === 1) {
        clickToggled = false;
        clickTimer = setTimeout(() => {
            clickToggled = true;
            togglePaused();
        }, DOUBLE_CLICK_MS);
    } else if (event.detail === 2) {
        if (clickToggled) togglePaused();
        toggleFullscreen();
    }
}

// ─── window and keyboard ──────────────────────────────────────────────────────
function onResize() {
    viewport.value = { width: window.innerWidth, height: window.innerHeight };
}

type KeyboardLock = { lock(keys?: string[]): Promise<void>; unlock(): void };

// Electron leaves fullscreen on Esc before the page sees the key. Locking it hands Esc to
// onKeydown, so an open dialog or menu closes first; holding Esc still leaves fullscreen.
function onFullscreenChange() {
    isFullscreen.value = Boolean(document.fullscreenElement);
    const keyboard = (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;
    if (isFullscreen.value) void keyboard?.lock(['Escape']).catch(() => undefined);
    else keyboard?.unlock();
}

function onKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (event.key === 'Escape' && document.fullscreenElement) {
        // A dialog or menu over the video closes first; it's still in the DOM during this event
        const layer = document.fullscreenElement.querySelector('[role="dialog"], [role="menu"]');
        if (!layer) void document.exitFullscreen();
        return;
    }
    if (!isPlayerRoute.value || target?.closest('input, textarea, [contenteditable]')) return;
    if (event.ctrlKey || event.metaKey) return;
    if (event.key.toLowerCase() === 'c') player.toggleSubtitles();
    const episode = event.key === 'N' ? queue.next : event.key === 'P' ? queue.previous : null;
    if (episode) void queue.play(episode);
}

onMounted(() => {
    const v = getVideo();
    if (v) {
        v.addEventListener('play', () => {
            player.isPlaying = true;
            queue.dismissUpNext();
        });
        v.addEventListener('ended', () => queue.episodeEnded(isPlayerRoute.value));
        v.addEventListener('pause', () => (player.isPlaying = false));
        v.addEventListener('timeupdate', () => (player.currentTime = v.currentTime));
        v.addEventListener('durationchange', () => (player.duration = v.duration));
    }
    window.addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
    window.removeEventListener('resize', onResize);
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    document.removeEventListener('keydown', onKeydown);
});

watch(isPlayerRoute, (onPlayer) => {
    if (onPlayer) queue.startCountdown();
    else queue.stopCountdown();
    if (!onPlayer && document.fullscreenElement) void document.exitFullscreen();
});

watch(
    () => player.streamUrl,
    (url) => {
        const v = getVideo();
        if (!v) return;
        if (url) {
            v.src = url;
            // Set before the metadata loads, this becomes the position playback starts from
            const resumeAt = progress.resumePosition(player.selection);
            if (resumeAt) {
                v.currentTime = resumeAt;
                toast.info(`Resumed at ${formatTimestamp(resumeAt)}`, {
                    action: { label: 'Start over', onClick: () => (v.currentTime = 0) },
                });
            }
            v.play().catch(() => undefined);
        } else {
            v.removeAttribute('src');
            v.load();
        }
    },
    { flush: 'post' }
);

let audioBridge: AudioBridge | null = null;

watch(
    () => (player.audioSupport === 'decoded' ? player.streamUrl : null),
    (url) => {
        audioBridge?.dispose();
        const v = getVideo();
        audioBridge =
            url && v ? new AudioBridge(v, url, () => (player.audioBridgeFailed = true)) : null;
    },
    { flush: 'post' }
);

onUnmounted(() => audioBridge?.dispose());
</script>

<template>
    <div
        v-show="isVisible"
        ref="containerRef"
        :class="
            isPlayerRoute
                ? 'fixed inset-0 z-40 bg-black select-none'
                : [
                      'player-mini group/mini fixed z-50 rounded-xl bg-black shadow-2xl ring-1 shadow-black/80 ring-white/10',
                      isDragging ? 'cursor-grabbing' : 'cursor-pointer',
                      { 'is-dragging': isDragging },
                  ]
        "
        :style="isPlayerRoute ? undefined : miniStyle"
        @click="onMiniClick"
    >
        <video-player>
            <PlayerContextMenu
                :enabled="isPlayerRoute"
                :container="mediaContainerRef"
                :fullscreen="isFullscreen"
                @toggle-play="togglePaused"
                @screenshot="copyScreenshot"
                @toggle-fullscreen="toggleFullscreen"
            >
                <media-container
                    ref="mediaContainerRef"
                    :class="[
                        'relative block size-full bg-black outline-none',
                        !isPlayerRoute && 'rounded-xl',
                        isPlayerRoute && '[&:not(:has(media-controls[data-visible]))]:cursor-none',
                    ]"
                    @click="onSurfaceClick"
                >
                    <video
                        ref="videoRef"
                        :class="['object-contain', !isPlayerRoute && 'rounded-xl']"
                        playsinline
                        crossorigin="anonymous"
                    />
                    <template v-if="isPlayerRoute">
                        <media-hotkey
                            v-for="hotkey in HOTKEYS"
                            :key="hotkey.keys"
                            :keys="hotkey.keys"
                            :action="hotkey.action"
                            :value="hotkey.value"
                            target="document"
                        />
                        <PlayerControls :fullscreen="isFullscreen" />
                        <UpNext />
                        <SkipChapter @seek="seek" />
                    </template>
                    <MiniPlayerOverlay v-else />
                    <PlayerStatus v-if="isPlayerRoute" />
                </media-container>
            </PlayerContextMenu>
        </video-player>
        <TorrentPickerDialog
            v-if="player.pickerContext"
            v-model:open="player.pickerOpen"
            v-bind="player.pickerContext"
        />
    </div>
</template>

<style>
.player-mini {
    width: 320px;
    height: 180px;
    transition:
        top 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94),
        left 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.player-mini.is-dragging {
    transition: none;
}
</style>
