<script setup lang="ts">
import { onUnmounted, ref, shallowRef, watch, type Component } from 'vue';
import {
    Captions,
    CaptionsOff,
    ChevronsLeft,
    ChevronsRight,
    Pause,
    Play,
    Volume1,
    Volume2,
    VolumeX,
} from '@lucide/vue';
import { usePlayerStore } from '../../stores/player';
import { formatTimestamp } from '../../lib/watching';

const props = defineProps<{ video: HTMLVideoElement | null }>();
const player = usePlayerStore();

// Only changes a key press caused get feedback, so autoplay, resuming and clicks stay quiet
const KEY_WINDOW_MS = 400;
const PILL_MS = 900;
const SEEK_MS = 700;

const toggle = shallowRef<{ icon: Component; id: number } | null>(null);
const pill = shallowRef<{ icon: Component; label: string; level?: number } | null>(null);
const seek = ref<{ seconds: number } | null>(null);
let pillTimer: ReturnType<typeof setTimeout> | undefined;
let seekTimer: ReturnType<typeof setTimeout> | undefined;
let keyedAt = -Infinity;
let numberKey = false;
let timeBefore = 0;

const fromKey = () => performance.now() - keyedAt < KEY_WINDOW_MS;

function showPill(next: NonNullable<typeof pill.value>) {
    clearTimeout(pillTimer);
    pill.value = next;
    pillTimer = setTimeout(() => (pill.value = null), PILL_MS);
}

function onKeydown(event: KeyboardEvent) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    keyedAt = performance.now();
    numberKey = /^\d$/.test(event.key);
    timeBefore = props.video?.currentTime ?? 0;
}

function onPlayPause() {
    if (!fromKey() || !props.video) return;
    toggle.value = { icon: props.video.paused ? Pause : Play, id: (toggle.value?.id ?? 0) + 1 };
}

function onVolume() {
    const v = props.video;
    if (!fromKey() || !v) return;
    const muted = v.muted || v.volume === 0;
    showPill({
        icon: muted ? VolumeX : v.volume < 0.5 ? Volume1 : Volume2,
        label: muted ? 'Muted' : `${Math.round(v.volume * 100)}%`,
        level: muted ? 0 : v.volume,
    });
}

// Repeated presses in the same direction add up, like +5s, +10s, +15s
function onSeeking() {
    const v = props.video;
    if (!fromKey() || !v) return;
    if (numberKey) return showPill({ icon: ChevronsRight, label: formatTimestamp(v.currentTime) });
    const delta = Math.round(v.currentTime - timeBefore);
    if (!delta) return;
    const previous = seek.value?.seconds ?? 0;
    clearTimeout(seekTimer);
    seek.value = { seconds: Math.sign(previous) === Math.sign(delta) ? previous + delta : delta };
    seekTimer = setTimeout(() => (seek.value = null), SEEK_MS);
}

watch(
    () => player.activeTrackId,
    (id) => {
        if (!fromKey()) return;
        showPill(
            id
                ? { icon: Captions, label: player.activeTrack?.label ?? 'Subtitles on' }
                : { icon: CaptionsOff, label: 'Subtitles off' }
        );
    }
);

const EVENTS = [
    ['play', onPlayPause],
    ['pause', onPlayPause],
    ['volumechange', onVolume],
    ['seeking', onSeeking],
] as const;

watch(
    () => props.video,
    (video, previous) => {
        for (const [name, handler] of EVENTS) {
            previous?.removeEventListener(name, handler);
            video?.addEventListener(name, handler);
        }
    },
    { immediate: true }
);

// Capture runs before the hotkeys act, so the position before a seek can be read
window.addEventListener('keydown', onKeydown, true);

onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown, true);
    for (const [name, handler] of EVENTS) props.video?.removeEventListener(name, handler);
    clearTimeout(pillTimer);
    clearTimeout(seekTimer);
});
</script>

<template>
    <div class="pointer-events-none absolute inset-0 z-25 overflow-hidden">
        <div
            v-if="toggle"
            :key="toggle.id"
            class="toggle-pop absolute top-1/2 left-1/2 grid size-18 place-items-center rounded-full bg-black/50 backdrop-blur-sm"
        >
            <component :is="toggle.icon" :size="30" fill="currentColor" />
        </div>

        <Transition
            enter-from-class="opacity-0 -translate-y-1"
            leave-to-class="opacity-0"
            enter-active-class="transition duration-150"
            leave-active-class="transition duration-300"
        >
            <div
                v-if="pill"
                class="absolute top-16 left-1/2 flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-black/60 px-4 py-2 text-sm font-medium tabular-nums backdrop-blur-sm"
            >
                <component :is="pill.icon" :size="16" />
                <span
                    v-if="pill.level !== undefined"
                    class="h-1 w-20 overflow-hidden rounded-full bg-white/20"
                >
                    <span
                        class="block h-full rounded-full bg-white transition-[width] duration-100"
                        :style="{ width: `${pill.level * 100}%` }"
                    />
                </span>
                <span class="min-w-9 text-right">{{ pill.label }}</span>
            </div>
        </Transition>

        <Transition leave-to-class="opacity-0" leave-active-class="transition duration-300">
            <div
                v-if="seek"
                :class="[
                    'absolute top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-full bg-black/50 px-4 py-2 text-sm font-semibold tabular-nums backdrop-blur-sm',
                    seek.seconds < 0 ? 'left-[12%]' : 'right-[12%]',
                ]"
            >
                <ChevronsLeft v-if="seek.seconds < 0" :size="18" />
                {{ seek.seconds > 0 ? '+' : '−' }}{{ Math.abs(seek.seconds) }}s
                <ChevronsRight v-if="seek.seconds > 0" :size="18" />
            </div>
        </Transition>
    </div>
</template>

<style scoped>
.toggle-pop {
    animation: toggle-pop 550ms ease-out forwards;
}

@keyframes toggle-pop {
    from {
        opacity: 1;
        transform: translate(-50%, -50%) scale(0.85);
    }
    to {
        opacity: 0;
        transform: translate(-50%, -50%) scale(1.25);
    }
}
</style>
