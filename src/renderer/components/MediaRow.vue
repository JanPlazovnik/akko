<script setup lang="ts">
import { ref, provide, onMounted, onUnmounted } from 'vue';
import { vAutoAnimate } from '@formkit/auto-animate/vue';
import { ChevronLeft, ChevronRight } from '@lucide/vue';
import MediaCard from './MediaCard.vue';
import type { Media } from '@shared/graphql/queries';
import type { ContinueItem } from '../stores/progress';

const { gutter = 'px-8' } = defineProps<{
    title: string;
    items: Media[];
    continueItems?: Map<number, ContinueItem>;
    labels?: Map<number, string>;
    gutter?: string;
}>();
const emit = defineEmits<{ play: [item: ContinueItem] }>();

const isScrolling = ref(false);
provide('rowScrolling', isScrolling);

const rowEl = ref<HTMLElement | null>(null);
const canScrollLeft = ref(false);
const canScrollRight = ref(false);

function updateScrollState() {
    const el = rowEl.value;
    if (!el) return;
    canScrollLeft.value = el.scrollLeft > 4;
    canScrollRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
}

function scrollPage(direction: 1 | -1) {
    const el = rowEl.value;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
}

const resizeObserver = new ResizeObserver(updateScrollState);
onMounted(() => rowEl.value && resizeObserver.observe(rowEl.value));
onUnmounted(() => resizeObserver.disconnect());
let dragging = false;
let startX = 0;
let lastX = 0;
let moved = false;
let scrollEndTimer: ReturnType<typeof setTimeout> | null = null;

function onWindowMouseMove(e: MouseEvent) {
    if (!dragging || !rowEl.value) return;
    if (Math.abs(e.pageX - startX) > 4) {
        moved = true;
        isScrolling.value = true;
        if (scrollEndTimer) clearTimeout(scrollEndTimer);
    }
    if (moved) {
        rowEl.value.scrollLeft += lastX - e.pageX;
        lastX = e.pageX;
    }
}

function onWindowMouseUp() {
    dragging = false;
    window.removeEventListener('mousemove', onWindowMouseMove);
    window.removeEventListener('mouseup', onWindowMouseUp);
    scrollEndTimer = setTimeout(() => {
        isScrolling.value = false;
    }, 300);
}

function onMouseDown(e: MouseEvent) {
    if (!rowEl.value) return;
    dragging = true;
    moved = false;
    startX = e.pageX;
    lastX = e.pageX;
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
}

function onClickCapture(e: MouseEvent) {
    if (moved) e.stopPropagation();
}
</script>

<template>
    <section v-if="items.length" class="pt-8">
        <div :class="['mb-3 flex items-center justify-between', gutter]">
            <h3 class="font-display text-xl font-semibold tracking-tight">{{ title }}</h3>
            <div class="flex gap-1">
                <button
                    v-for="dir in [-1, 1] as const"
                    :key="dir"
                    class="grid size-8 cursor-pointer place-items-center rounded-full bg-white/5 text-white/70 transition-colors hover:bg-white/12 hover:text-white disabled:cursor-default disabled:opacity-30 disabled:hover:bg-white/5"
                    :disabled="dir === -1 ? !canScrollLeft : !canScrollRight"
                    @click="scrollPage(dir)"
                >
                    <ChevronLeft v-if="dir === -1" :size="16" />
                    <ChevronRight v-else :size="16" />
                </button>
            </div>
        </div>
        <div
            ref="rowEl"
            :class="[
                'overflow-x-auto select-none',
                dragging && moved ? 'cursor-grabbing' : 'cursor-grab',
            ]"
            style="scrollbar-width: none"
            @scroll.passive="updateScrollState"
            @mousedown="onMouseDown"
            @dragstart.prevent
            @click.capture="onClickCapture"
        >
            <div
                v-auto-animate
                :class="['grid w-max grid-flow-col auto-cols-[168px] gap-4 pt-2 pb-2', gutter]"
            >
                <MediaCard
                    v-for="item in items"
                    :key="item.id"
                    :item="item"
                    :continue-item="continueItems?.get(item.id)"
                    :label="labels?.get(item.id)"
                    @play="emit('play', continueItems!.get(item.id)!)"
                />
            </div>
        </div>
    </section>
</template>
