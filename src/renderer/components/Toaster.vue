<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from '@lucide/vue';
import { dismissToast, MAX_VISIBLE_TOASTS, toasts, type Toast } from '../lib/toast';
import { useFullscreenElement } from '../lib/fullscreen';

const ICONS = { success: CircleCheck, error: CircleAlert, info: Info, warn: TriangleAlert };
const TINTS = {
    success: 'text-emerald-400',
    error: 'text-red-400',
    info: 'text-accent',
    warn: 'text-amber-400',
};

const STACK_DEPTH = 2;
const STACK_OFFSET_PX = 10;
const STACK_SCALE = 0.05;

// Newest first; toasts past the newest few fold into a stack peeking out below them
const layers = computed(() =>
    [...toasts]
        .reverse()
        .map((toast, index) => ({ toast, depth: Math.max(0, index - MAX_VISIBLE_TOASTS + 1) }))
        .filter(({ depth }) => depth <= STACK_DEPTH)
);

const fullscreenElement = useFullscreenElement();

// Only toasts in full view count down: ones folded into the stack wait their turn, and hovering
// the stack holds everything so it can be read and clicked
type Timer = { remaining: number; startedAt: number; handle?: ReturnType<typeof setTimeout> };
const timers = new Map<number, Timer>();
const held = ref(false);
// A toast that comes back into view, or is let go after hovering, gets long enough to be read
const MIN_REMAINING_MS = 2000;

const shownIds = computed(
    () => new Set(layers.value.filter(({ depth }) => !depth).map(({ toast }) => toast.id))
);

function run(id: number, timer: Timer) {
    if (timer.handle) return;
    timer.remaining = Math.max(timer.remaining, MIN_REMAINING_MS);
    timer.startedAt = Date.now();
    timer.handle = setTimeout(() => dismissToast(id), timer.remaining);
}

function pause(timer: Timer) {
    if (!timer.handle) return;
    clearTimeout(timer.handle);
    timer.handle = undefined;
    timer.remaining -= Date.now() - timer.startedAt;
}

watch(
    [() => [...toasts], shownIds, held],
    ([current]) => {
        for (const t of current) {
            if (timers.has(t.id) || t.duration === false || t.duration === undefined) continue;
            timers.set(t.id, { remaining: t.duration, startedAt: 0 });
        }
        for (const [id, timer] of timers) {
            if (!current.some((t) => t.id === id)) {
                clearTimeout(timer.handle);
                timers.delete(id);
            } else if (!held.value && shownIds.value.has(id)) run(id, timer);
            else pause(timer);
        }
    },
    { immediate: true }
);

// The closing toast folds its height away as it fades, so the ones below slide up into the gap
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
            data-toasts
            class="pointer-events-none fixed top-18 right-5 z-50 flex w-[min(24rem,calc(100vw-2.5rem))] flex-col items-stretch gap-2"
            enter-from-class="-translate-y-2 scale-[0.97] opacity-0"
            enter-active-class="transition duration-200 ease-out"
            move-class="transition-transform duration-200"
            @leave="collapse"
            @mouseenter="held = true"
            @mouseleave="held = false"
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
                              'absolute inset-x-0 bottom-0 h-14 origin-bottom ring-white/15 transition-[translate,scale,opacity] duration-200',
                              depth === 1 ? 'bg-raised' : 'bg-surface',
                          ]
                        : 'pointer-events-auto flex min-h-14 items-center gap-3 bg-overlay/95 py-2.5 pr-2.5 pl-4 text-sm text-white/90 backdrop-blur-md',
                ]"
                :style="
                    depth
                        ? {
                              translate: `0 ${depth * STACK_OFFSET_PX}px`,
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
