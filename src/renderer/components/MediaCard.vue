<script setup lang="ts">
import { ref, computed, inject, watch } from 'vue';
import { Play, Star } from '@lucide/vue';
import type { Media } from '@shared/graphql/queries';
import { useMediaStore } from '../stores/media';
import { useListStore } from '../stores/list';
import { useAccountsStore } from '../stores/accounts';
import { accentStyle } from '../lib/accent';
import { listLabel, mediaMeta, stripHtml } from '../lib/media-labels';
import type { ContinueItem } from '../stores/progress';

const isScrolling = inject<ReturnType<typeof ref<boolean>>>('rowScrolling', ref(false));

const props = defineProps<{ item: Media; actionLabel?: string; continueItem?: ContinueItem }>();
const emit = defineEmits<{ play: [] }>();
const mediaStore = useMediaStore();
const list = useListStore();
const accounts = useAccountsStore();
const listEntry = computed(() => list.entryFor(props.item.id));

const title = computed(() => accounts.titleOf(props.item));
const coverImage = computed(() => props.item.coverImage?.large ?? null);
const synopsis = computed(() => stripHtml(props.item.description));
const meta = computed(() => mediaMeta(props.item));
const accent = computed(() => accentStyle(props.item.coverImage?.color));

const single = computed(() => props.item.format === 'MOVIE' || props.item.episodes === 1);
const watched = computed(() => {
    const record = props.continueItem?.record;
    return record ? Math.min(1, record.position / record.duration) : null;
});
const continueLabel = computed(() => {
    const item = props.continueItem;
    if (!item) return null;
    const left = item.record && Math.ceil((item.record.duration - item.record.position) / 60);
    const episode = single.value ? null : `EP ${item.episode}`;
    return [episode, left && `${left}m left`].filter(Boolean).join(' · ') || null;
});
const playLabel = computed(() => {
    const item = props.continueItem;
    if (!item) return props.actionLabel ?? 'Watch now';
    const verb = item.record ? 'Resume' : 'Watch';
    return single.value ? verb : `${verb} episode ${item.episode}`;
});

function play() {
    if (!props.continueItem) return navigate();
    onLeave();
    emit('play');
}

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
    <div
        ref="triggerRef"
        class="relative"
        :style="accent"
        @mouseenter="onEnter"
        @mouseleave="onLeave"
    >
        <Transition name="card-expand">
            <div
                v-if="hovered"
                :style="floatingStyle"
                :class="[
                    'fixed z-100 w-80 cursor-pointer overflow-hidden rounded-2xl bg-raised shadow-[0_24px_70px_rgba(0,0,0,0.9)] ring-1 ring-white/10 transition-transform duration-100 will-change-transform',
                    pressing ? 'scale-[0.97]' : 'scale-100',
                ]"
                @click="navigate()"
                @wheel.prevent="forwardWheel"
            >
                <div class="relative h-36">
                    <img
                        v-if="item.bannerImage ?? coverImage"
                        :src="item.bannerImage ?? coverImage ?? undefined"
                        class="absolute inset-0 size-full object-cover"
                    />
                    <div
                        class="absolute inset-0 bg-linear-to-t from-raised via-raised/30 to-transparent"
                    />
                </div>

                <div class="-mt-6 relative px-4 pb-4">
                    <p class="font-display text-lg leading-tight font-semibold">{{ title }}</p>

                    <div class="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-white/50">
                        <span
                            v-if="item.averageScore"
                            class="flex items-center gap-1 font-semibold text-white/90"
                        >
                            <Star :size="11" class="fill-accent text-accent" />
                            {{ item.averageScore }}%
                        </span>
                        <template v-for="part in meta" :key="part">
                            <span class="text-white/20">•</span>
                            <span>{{ part }}</span>
                        </template>
                    </div>

                    <p class="mt-2.5 line-clamp-3 text-xs leading-relaxed text-white/60">
                        {{ synopsis }}
                    </p>

                    <div class="mt-3 flex items-center gap-2">
                        <button
                            class="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-white/85"
                            @click.stop="play()"
                        >
                            <Play :size="12" fill="currentColor" />
                            {{ playLabel }}
                        </button>
                        <span
                            v-for="genre in (item.genres ?? []).filter(Boolean).slice(0, 2)"
                            :key="genre!"
                            class="rounded-full bg-white/6 px-2.5 py-1 text-[11px] text-white/50"
                        >
                            {{ genre }}
                        </span>
                    </div>
                </div>
            </div>
        </Transition>

        <div :class="['transition-opacity duration-200', hovered ? 'opacity-40' : 'opacity-100']">
            <div
                :class="[
                    'relative aspect-2/3 cursor-pointer overflow-hidden rounded-xl bg-raised ring-1 ring-white/5 transition duration-200 hover:-translate-y-1 hover:ring-accent/60',
                    pressing ? 'scale-[0.96]' : 'scale-100',
                ]"
                @click="navigate()"
            >
                <img
                    v-if="coverImage"
                    :src="coverImage"
                    class="absolute inset-0 size-full object-cover"
                />
                <span
                    v-if="item.averageScore"
                    class="absolute top-2 left-2 flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-semibold backdrop-blur-sm"
                >
                    <Star :size="10" class="fill-accent text-accent" />
                    {{ item.averageScore }}
                </span>
                <span
                    v-if="continueLabel ?? listEntry"
                    :class="[
                        'absolute left-2 max-w-[calc(100%-1rem)] truncate rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-medium backdrop-blur-sm',
                        watched === null ? 'bottom-2' : 'bottom-3.5',
                    ]"
                >
                    {{ continueLabel ?? listLabel(listEntry!) }}
                </span>
                <div v-if="watched !== null" class="absolute inset-x-0 bottom-0 h-1 bg-white/20">
                    <div class="h-full bg-accent" :style="{ width: `${watched * 100}%` }" />
                </div>
            </div>

            <div class="mt-2.5 px-0.5">
                <p class="truncate text-[13px] font-medium leading-snug">{{ title }}</p>
                <p class="mt-0.5 truncate text-[11px] text-white/40">
                    {{ meta.slice(0, 2).join(' · ') }}
                </p>
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
