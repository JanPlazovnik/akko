<script setup lang="ts">
import { ref, provide } from 'vue';
import { vAutoAnimate } from '@formkit/auto-animate/vue';
import MediaCard from './MediaCard.vue';
import type { Media } from '@shared/graphql/queries';

defineProps<{ title: string; items: Media[] }>();

const isScrolling = ref(false);
provide('rowScrolling', isScrolling);

const rowEl = ref<HTMLElement | null>(null);
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
    <div v-if="items.length" class="px-6 pt-6">
        <div class="flex items-baseline justify-between mb-3">
            <h3 class="text-sm font-semibold">{{ title }}</h3>
        </div>
        <div
            ref="rowEl"
            :class="[
                'overflow-x-auto select-none',
                dragging && moved ? 'cursor-grabbing' : 'cursor-grab',
            ]"
            style="scrollbar-width: none"
            @mousedown="onMouseDown"
            @dragstart.prevent
            @click.capture="onClickCapture"
        >
            <div v-auto-animate class="grid grid-flow-col auto-cols-[160px] gap-3.5 w-max pb-1">
                <MediaCard v-for="item in items" :key="item.id" :item="item" />
            </div>
        </div>
    </div>
</template>
