<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDraggable, useDragDropMonitor } from '@dnd-kit/vue';
import '@videojs/html/video/ui';
import '@videojs/html/base.css';
import { usePlayerStore } from '../stores/player';
import { useSubtitleRenderer } from '../lib/subtitles';
import PlayerControls from './player/PlayerControls.vue';
import PlayerStatus from './player/PlayerStatus.vue';
import MiniPlayerOverlay from './player/MiniPlayerOverlay.vue';

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const MINI_W = 320;
const MINI_H = 180;
const HEADER_H = 56;
const MARGIN = 20;
const CLICK_DELAY_MS = 250;
const SURFACE_TAGS = new Set(['VIDEO', 'CANVAS', 'MEDIA-CONTROLS']);

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

const videoRef = ref<HTMLVideoElement | null>(null);
const containerRef = ref<HTMLElement | null>(null);
const mediaContainerRef = ref<HTMLElement | null>(null);
const isFullscreen = ref(false);
const viewport = ref({ width: window.innerWidth, height: window.innerHeight });

const getVideo = () => videoRef.value;
const isPlayerRoute = computed(() => route.path === '/player');
const isVisible = computed(() => isPlayerRoute.value || Boolean(player.streamUrl));

useSubtitleRenderer(getVideo);

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
let clickTimer: ReturnType<typeof setTimeout> | null = null;

function togglePaused() {
    const v = getVideo();
    if (v) v.paused ? void v.play() : v.pause();
}

function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void mediaContainerRef.value?.requestFullscreen();
}

function onSurfaceClick(event: MouseEvent) {
    if (!isPlayerRoute.value || !SURFACE_TAGS.has((event.target as Element).tagName)) return;
    if (event.detail === 2) {
        if (clickTimer) clearTimeout(clickTimer);
        else togglePaused();
        clickTimer = null;
        toggleFullscreen();
        return;
    }
    if (event.detail !== 1) return;
    clickTimer = setTimeout(() => {
        clickTimer = null;
        togglePaused();
    }, CLICK_DELAY_MS);
}

// ─── window and keyboard ──────────────────────────────────────────────────────
function onResize() {
    viewport.value = { width: window.innerWidth, height: window.innerHeight };
}

function onFullscreenChange() {
    isFullscreen.value = Boolean(document.fullscreenElement);
}

function onKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (!isPlayerRoute.value || target?.closest('input, textarea, [contenteditable]')) return;
    if (event.key.toLowerCase() === 'c' && !event.ctrlKey && !event.metaKey) {
        player.toggleSubtitles();
    }
}

onMounted(() => {
    const v = getVideo();
    if (v) {
        v.addEventListener('play', () => (player.isPlaying = true));
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
    if (!onPlayer && document.fullscreenElement) void document.exitFullscreen();
});

watch(
    () => player.streamUrl,
    (url) => {
        const v = getVideo();
        if (!v) return;
        if (url) {
            v.src = url;
            v.play().catch(() => undefined);
        } else {
            v.removeAttribute('src');
            v.load();
        }
    },
    { flush: 'post' }
);
</script>

<template>
    <div
        v-show="isVisible"
        ref="containerRef"
        :class="
            isPlayerRoute
                ? 'fixed inset-0 z-40 bg-black'
                : [
                      'player-mini group/mini fixed z-50 overflow-hidden rounded-xl bg-black shadow-2xl ring-1 shadow-black/80 ring-white/10',
                      isDragging ? 'cursor-grabbing' : 'cursor-pointer',
                      { 'is-dragging': isDragging },
                  ]
        "
        :style="isPlayerRoute ? undefined : miniStyle"
        @click="onMiniClick"
    >
        <video-player>
            <media-container
                ref="mediaContainerRef"
                :class="[
                    'relative block size-full bg-black outline-none',
                    isPlayerRoute && '[&:not(:has(media-controls[data-visible]))]:cursor-none',
                ]"
                @click="onSurfaceClick"
            >
                <video ref="videoRef" class="object-contain" playsinline crossorigin="anonymous" />
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
                </template>
                <MiniPlayerOverlay v-else />
                <PlayerStatus v-if="isPlayerRoute" />
            </media-container>
        </video-player>
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

media-container canvas {
    transition: translate 0.3s ease;
}

media-container:has(media-controls[data-visible]) canvas {
    translate: 0 -64px;
}
</style>
