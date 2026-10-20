<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from '@lucide/vue';
import { dismissToast, MAX_VISIBLE_TOASTS, toasts, type Toast } from '../lib/toast';

const ICONS = { success: CircleCheck, error: CircleAlert, info: Info, warn: TriangleAlert };
const TINTS = {
    success: 'text-emerald-400',
    error: 'text-red-400',
    info: 'text-accent',
    warn: 'text-amber-400',
};

const route = useRoute();
const STACK_DEPTH = 2;
const STACK_OFFSET_PX = 10;
const STACK_SCALE = 0.05;

// Toasts past the newest few fold into a stack peeking out above them
const layers = computed(() => {
    const firstVisible = toasts.length - MAX_VISIBLE_TOASTS;
    return toasts
        .map((toast, index) => ({ toast, depth: Math.max(0, firstVisible - index) }))
        .filter(({ depth }) => depth <= STACK_DEPTH);
});

// Only the fullscreen element renders while fullscreen, so the stack moves into it
const fullscreenElement = ref<Element | null>(document.fullscreenElement);
const onFullscreenChange = () => (fullscreenElement.value = document.fullscreenElement);
onMounted(() => document.addEventListener('fullscreenchange', onFullscreenChange));
onUnmounted(() => document.removeEventListener('fullscreenchange', onFullscreenChange));

// Clear of the player controls, which sit along the bottom edge
const overPlayer = computed(() => route.path === '/player' || fullscreenElement.value !== null);

// Hovering the stack holds every toast so it can be read and clicked
type Timer = { remaining: number; startedAt: number; handle?: ReturnType<typeof setTimeout> };
const timers = new Map<number, Timer>();
let held = false;

function run(id: number, timer: Timer) {
    timer.startedAt = Date.now();
    timer.handle = setTimeout(() => dismissToast(id), timer.remaining);
}

watch(
    () => [...toasts],
    (current) => {
        for (const t of current) {
            if (timers.has(t.id) || t.duration === false || t.duration === undefined) continue;
            const timer: Timer = { remaining: t.duration, startedAt: 0 };
            timers.set(t.id, timer);
            if (!held) run(t.id, timer);
        }
        for (const [id, timer] of timers) {
            if (current.some((t) => t.id === id)) continue;
            clearTimeout(timer.handle);
            timers.delete(id);
        }
    },
    { immediate: true }
);

function hold() {
    held = true;
    for (const timer of timers.values()) {
        clearTimeout(timer.handle);
        timer.remaining -= Date.now() - timer.startedAt;
    }
}

function release() {
    held = false;
    for (const [id, timer] of timers) run(id, timer);
}

// The closing toast folds its height away as it fades, so the ones above slide down into the gap
const LEAVE_MS = 200;

function collapse(el: Element, done: () => void) {
    const style = (el as HTMLElement).style;
    style.height = `${(el as HTMLElement).offsetHeight}px`;
    style.minHeight = '0';
    style.overflow = 'hidden';
    void (el as HTMLElement).offsetHeight;
    style.transition = `height ${LEAVE_MS}ms ease, margin ${LEAVE_MS}ms ease, padding ${LEAVE_MS}ms ease, opacity ${LEAVE_MS * 0.6}ms ease, scale ${LEAVE_MS}ms ease`;
    Object.assign(style, {
        height: '0',
        marginTop: '-0.5rem',
        paddingBlock: '0',
        opacity: '0',
        scale: '0.95',
    });
    setTimeout(done, LEAVE_MS);
}

function onAction(t: Toast) {
    t.action?.onClick();
    dismissToast(t.id);
}
</script>

<template>
    <Teleport :to="fullscreenElement ?? 'body'">
        <TransitionGroup
            tag="ol"
            :class="[
                'pointer-events-none fixed left-1/2 z-[100] flex w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 flex-col items-stretch gap-2 transition-[bottom] duration-200',
                overPlayer ? 'bottom-28' : 'bottom-6',
            ]"
            enter-from-class="translate-y-2 scale-[0.97] opacity-0"
            enter-active-class="transition duration-200 ease-out"
            move-class="transition-transform duration-200"
            @leave="collapse"
            @mouseenter="hold"
            @mouseleave="release"
        >
            <li
                v-for="{ toast: t, depth } in layers"
                :key="t.id"
                :role="depth ? undefined : 'status'"
                :aria-hidden="depth ? 'true' : undefined"
                :class="[
                    'rounded-xl shadow-2xl ring-1 shadow-black/60 ring-white/10',
                    depth
                        ? [
                              'absolute inset-x-0 top-0 h-14 ring-white/15 transition-[translate,scale,opacity] duration-200',
                              depth === 1 ? 'bg-raised' : 'bg-surface',
                          ]
                        : 'pointer-events-auto flex min-h-14 items-center gap-3 bg-overlay/95 py-2.5 pr-2.5 pl-4 text-sm text-white/90 backdrop-blur-md',
                ]"
                :style="
                    depth
                        ? {
                              translate: `0 -${depth * STACK_OFFSET_PX}px`,
                              scale: 1 - depth * STACK_SCALE,
                              zIndex: -depth,
                          }
                        : undefined
                "
            >
                <template v-if="!depth">
                    <component
                        :is="ICONS[t.kind]"
                        :size="18"
                        :class="['shrink-0', TINTS[t.kind]]"
                    />
                    <p class="min-w-0 flex-1 leading-snug">{{ t.message }}</p>
                    <button
                        v-if="t.action"
                        class="h-8 shrink-0 cursor-pointer rounded-lg bg-white/10 px-3 text-[13px] font-semibold text-white transition-colors hover:bg-white/20"
                        @click="onAction(t)"
                    >
                        {{ t.action.label }}
                    </button>
                    <button
                        class="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white"
                        aria-label="Dismiss"
                        @click="dismissToast(t.id)"
                    >
                        <X :size="15" />
                    </button>
                </template>
            </li>
        </TransitionGroup>
    </Teleport>
</template>
