<script setup lang="ts">
import { ref, computed, inject, watch } from 'vue';
import { Play, Heart, Plus, Calendar, Tv } from '@lucide/vue';
import type { Media } from '@shared/graphql/queries';
import { useMediaStore } from '../stores/media';

const isScrolling = inject<ReturnType<typeof ref<boolean>>>('rowScrolling', ref(false));

const props = defineProps<{ item: Media; actionLabel?: string }>();
const mediaStore = useMediaStore();

const title = computed(() => props.item.title?.userPreferred ?? '');
const coverImage = computed(() => props.item.coverImage?.large ?? null);
const synopsis = computed(() => props.item.description?.replace(/<[^>]*>/g, '') ?? '');
const meta = computed(() => {
    const parts: string[] = [];
    if (props.item.format) parts.push(props.item.format);
    if (props.item.episodes) parts.push(`${props.item.episodes} EP`);
    if (props.item.startDate?.year) parts.push(String(props.item.startDate.year));
    if (props.item.averageScore) parts.push(`${props.item.averageScore}%`);
    return parts.join(' · ');
});

const hovered = ref(false);
const pressing = ref(false);
let hoverTimer: ReturnType<typeof setTimeout> | null = null;

const triggerRef = ref<HTMLElement | null>(null);
const floatingStyle = ref<Record<string, string>>({});

function updatePosition() {
    if (!triggerRef.value) return;

    const rect = triggerRef.value.getBoundingClientRect();
    const width = 320;

    let left = rect.left + rect.width / 2 - width / 2;
    const padding = 12;

    if (left < padding) left = padding;
    if (left + width > window.innerWidth - padding) {
        left = window.innerWidth - width - padding;
    }

    const verticalOffset = 20;

    floatingStyle.value = {
        left: `${left}px`,
        top: `${rect.top - verticalOffset}px`,
    };
}

watch(isScrolling, (scrolling) => {
    if (scrolling) onLeave();
});

function onEnter() {
    void mediaStore.preloadMedia(props.item.id).catch(() => undefined);
    hoverTimer = setTimeout(() => {
        if (isScrolling.value) return;
        hovered.value = true;
        requestAnimationFrame(updatePosition);
    }, 200);
}

function onLeave() {
    if (hoverTimer) clearTimeout(hoverTimer);
    hovered.value = false;
}

function forwardWheel(e: WheelEvent) {
    onLeave();
    const scrollEl = triggerRef.value?.closest('main');
    if (!scrollEl) return;
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 20;
    else if (e.deltaMode === 2) dy *= (scrollEl as HTMLElement).clientHeight;
    (scrollEl as HTMLElement).scrollBy({ top: dy });
}

function navigate() {
    pressing.value = true;
    setTimeout(() => {
        pressing.value = false;
        mediaStore.viewMedia(props.item);
    }, 120);
}
</script>

<template>
    <div ref="triggerRef" class="relative" @mouseenter="onEnter" @mouseleave="onLeave">
        <Transition name="card-expand">
            <div
                v-if="hovered"
                :style="floatingStyle"
                :class="[
                    'fixed w-80 z-100 bg-[#0f0f0f] rounded-xl overflow-hidden will-change-transform border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,1)] bg-linear-to-b from-[#141414] to-[#0f0f0f] cursor-pointer transition-transform duration-100',
                    pressing ? 'scale-[0.97]' : 'scale-100',
                ]"
                @click="navigate()"
                @wheel.prevent="forwardWheel"
            >
                <div class="h-32 relative">
                    <div class="absolute inset-0 bg-neutral-900">
                        <img
                            v-if="item.bannerImage"
                            :src="item.bannerImage"
                            class="w-full h-full object-cover opacity-45"
                        />
                    </div>
                </div>

                <div class="px-4 py-3.5">
                    <p class="text-[15px] font-bold leading-tight mb-2">{{ title }}</p>

                    <p class="text-[10px] tracking-[0.08em] text-white/40 mb-1.5">
                        {{ meta }}
                    </p>

                    <p class="text-[12px] leading-relaxed text-white/60 line-clamp-3">
                        {{ synopsis }}
                    </p>

                    <div class="flex gap-2 items-center my-2">
                        <button
                            class="bg-white text-black px-3.5 py-1.5 text-[12px] font-semibold inline-flex items-center gap-1.5 rounded-full hover:bg-white/85 transition-opacity cursor-pointer"
                            @click.stop="navigate()"
                        >
                            <Play :size="12" fill="black" />
                            {{ actionLabel ?? 'Watch now' }}
                        </button>
                    </div>
                </div>
            </div>
        </Transition>

        <div :class="['transition-opacity duration-200', hovered ? 'opacity-30' : 'opacity-100']">
            <div
                :class="[
                    'aspect-2/3 rounded-lg relative overflow-hidden bg-neutral-800 cursor-pointer transition-transform duration-100',
                    pressing ? 'scale-[0.96]' : 'scale-100',
                ]"
                @click="navigate()"
            >
                <img
                    v-if="coverImage"
                    :src="coverImage"
                    class="absolute inset-0 w-full h-full object-cover"
                />
                <div v-else class="absolute inset-0 bg-neutral-700" />
            </div>

            <div class="mt-2">
                <p class="text-xs font-medium leading-snug truncate">{{ title }}</p>

                <div class="text-[10px] text-white/35 mt-0.5 flex justify-between">
                    <span class="flex items-center gap-1">
                        <Calendar :size="10" />
                        {{ item.startDate?.year }}
                    </span>

                    <span class="flex items-center gap-1">
                        {{ item.format }}
                        <Tv :size="10" />
                    </span>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.card-expand-enter-active {
    transition:
        opacity 0.2s cubic-bezier(0.2, 0.8, 0.2, 1),
        transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.card-expand-leave-active {
    transition:
        opacity 0.14s ease,
        transform 0.14s ease;
}

.card-expand-enter-from,
.card-expand-leave-to {
    opacity: 0;
    transform: translateY(16px) scale(0.94);
}
</style>
