<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Loader2, Maximize2, X } from '@lucide/vue';
import { useDraggable, useDragDropMonitor } from '@dnd-kit/vue';
import { usePlayerStore } from '../stores/player';
import { useSubtitleRenderer } from '../lib/subtitles';
import SelectMenu from './ui/SelectMenu.vue';
import '@videojs/html/video/player';
import '@videojs/html/video/minimal-skin';

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const MINI_W = 288;
const MINI_H = 162;
const HEADER_H = 56;
const MARGIN = 20;

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
const trackOptions = computed(() => player.tracks.map((t) => ({ value: t.id, label: t.label })));
const statusMessage = computed(
    () =>
        player.error ??
        (player.loading ? 'Waiting for torrent metadata…' : 'Nothing is playing right now.')
);

// ─── corner-snap positioning ──────────────────────────────────────────────────
const corner = ref<Corner>('bottom-right');

function cornerPosition(c: Corner): { top: number; left: number } {
    const bottomEdge = window.innerHeight - MINI_H - MARGIN;
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

useSubtitleRenderer(getVideo);

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
        v.addEventListener('play', () => (player.isPlaying = true));
        v.addEventListener('pause', () => (player.isPlaying = false));
        v.addEventListener('timeupdate', () => (player.currentTime = v.currentTime));
        v.addEventListener('durationchange', () => (player.duration = v.duration));
    }

    const skinEl = document.querySelector('video-minimal-skin');
    if (skinEl?.shadowRoot) {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync('.media-minimal-skin--video::after { display: none; }');
        skinEl.shadowRoot.adoptedStyleSheets = [...skinEl.shadowRoot.adoptedStyleSheets, sheet];
    }

    document.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown);
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
        :class="[
            isPlayerRoute ? 'player-fullscreen' : 'player-mini',
            { 'is-dragging': isDragging },
        ]"
        :style="!isPlayerRoute ? miniStyle : {}"
        @click="handleFullscreenClick"
    >
        <!-- Loading state (fullscreen only) -->
        <div
            v-if="isPlayerRoute && !player.streamUrl"
            class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-neutral-950 text-white/60 text-sm pointer-events-none"
        >
            <Loader2 v-if="player.loading" :size="22" class="animate-spin" />
            <p :class="player.error ? 'text-red-400' : 'font-medium text-white/80'">
                {{ statusMessage }}
            </p>
        </div>

        <div
            v-if="isPlayerRoute && trackOptions.length > 0"
            class="subtitle-picker absolute top-3 right-3 z-20"
        >
            <SelectMenu
                v-model="player.activeTrackId"
                :options="trackOptions"
                placeholder="Subtitles off"
            />
        </div>

        <!-- Video -->
        <div class="relative h-full">
            <video-player v-show="player.streamUrl || isPlayerRoute" class="vjs-player">
                <video-minimal-skin>
                    <video ref="videoRef" playsinline crossorigin="anonymous" />
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

.subtitle-picker {
    opacity: 0;
    transition: opacity 0.15s ease;
}

.player-fullscreen:hover .subtitle-picker,
.subtitle-picker:focus-within {
    opacity: 1;
}

.mini-overlay {
    opacity: 0;
    background: rgba(0, 0, 0, 0);
    transition:
        opacity 0.15s ease,
        background 0.15s ease;
}

.player-mini:hover .subtitle-picker {
    opacity: 0;
    transition: opacity 0.15s ease;
}

.player-fullscreen:hover .subtitle-picker,
.subtitle-picker:focus-within {
    opacity: 1;
}

.mini-overlay {
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
