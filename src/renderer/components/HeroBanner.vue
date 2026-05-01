<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { Play } from '@lucide/vue';
import type { Media } from '@shared/graphql/queries';
import { useAnilistStore } from '../stores/anilist';

const props = defineProps<{ items: Media[] }>();
const anilist = useAnilistStore();

const heroIndex = ref(0);
const transitioning = ref(false);
let autoTimer: ReturnType<typeof setInterval> | null = null;

const current = computed(() => props.items[heroIndex.value]);

function go(idx: number) {
    if (idx === heroIndex.value || transitioning.value) return;
    transitioning.value = true;
    setTimeout(() => {
        heroIndex.value = idx;
        transitioning.value = false;
    }, 200);
}

function next() {
    if (!props.items.length) return;
    go((heroIndex.value + 1) % props.items.length);
}

function startAuto() {
    autoTimer = setInterval(next, 6000);
}
function stopAuto() {
    if (autoTimer) clearInterval(autoTimer);
}

onMounted(() => startAuto());
onUnmounted(() => stopAuto());

function stripHtml(s?: string | null) {
    return s?.replace(/<[^>]*>/g, '') ?? '';
}
</script>

<template>
    <div
        class="mx-4 mt-4 rounded-lg overflow-hidden relative h-[560px]"
        @mouseenter="stopAuto"
        @mouseleave="startAuto"
    >
        <!-- background -->
        <Transition name="hero-fade" mode="out-in">
            <div v-if="current" :key="heroIndex" class="absolute inset-0">
                <img
                    v-if="current.bannerImage"
                    :src="current.bannerImage"
                    class="absolute inset-0 w-full h-full object-cover"
                />
                <div v-else class="absolute inset-0 bg-neutral-800" />
                <div
                    class="absolute inset-0 bg-linear-to-r from-neutral-950 via-neutral-950/70 to-neutral-950/10"
                />
            </div>
        </Transition>

        <!-- content -->
        <Transition name="hero-fade" mode="out-in">
            <div
                v-if="current"
                :key="`copy-${heroIndex}`"
                class="relative z-10 h-full flex flex-col justify-between px-10 py-9"
            >
                <div class="flex flex-col gap-4 max-w-2xl">
                    <p class="text-[10px] text-white/50 uppercase tracking-[0.16em]">
                        Featured · Trending Now
                    </p>

                    <!-- clamped title -->
                    <h2 class="text-5xl font-bold leading-[1.1] line-clamp-2">
                        {{ current.title?.userPreferred }}
                    </h2>

                    <!-- pills -->
                    <div class="flex gap-2 flex-wrap">
                        <span
                            v-if="current.episodes"
                            class="bg-white/10 px-3 py-1 text-xs rounded-full text-white/70"
                        >
                            {{ current.episodes }} EP
                        </span>
                        <span
                            v-if="current.format"
                            class="bg-white/10 px-3 py-1 text-xs rounded-full text-white/70"
                        >
                            {{ current.format }}
                        </span>
                        <span
                            v-if="current.status"
                            class="bg-white/10 px-3 py-1 text-xs rounded-full text-white/70"
                        >
                            {{ current.status }}
                        </span>
                        <span
                            v-if="current.season && current.seasonYear"
                            class="bg-white/10 px-3 py-1 text-xs rounded-full text-white/70"
                        >
                            {{ current.season }} {{ current.seasonYear }}
                        </span>
                        <span
                            v-if="current.averageScore"
                            class="bg-white/10 px-3 py-1 text-xs rounded-full text-white/70"
                        >
                            {{ current.averageScore }}%
                        </span>
                    </div>

                    <p class="text-sm text-white/65 leading-relaxed line-clamp-4 max-w-xl">
                        {{ stripHtml(current.description) }}
                    </p>

                    <div v-if="current.genres?.length" class="flex gap-1.5 flex-wrap">
                        <span
                            v-for="genre in (current.genres ?? []).filter(Boolean).slice(0, 5)"
                            :key="genre!"
                            class="text-[11px] border border-white/15 text-white/40 px-2.5 py-0.5 rounded-md"
                        >
                            {{ genre }}
                        </span>
                    </div>
                </div>

                <!-- actions -->
                <div class="flex gap-3 items-center">
                    <button
                        class="bg-white text-black px-5 py-2.5 text-sm font-semibold inline-flex items-center gap-2 rounded-full hover:opacity-85 transition-opacity cursor-pointer"
                        @click="current && anilist.viewMedia(current)"
                    >
                        <Play :size="14" fill="black" />
                        Watch now
                    </button>
                </div>
            </div>
        </Transition>

        <!-- indicators -->
        <div class="absolute bottom-6 right-8 flex gap-2 z-10">
            <button
                v-for="(_, i) in items"
                :key="i"
                :class="[
                    'h-[3px] border-none p-0 cursor-pointer transition-all duration-300',
                    i === heroIndex ? 'bg-white w-10' : 'bg-white/30 w-6',
                ]"
                @click="go(i)"
            />
        </div>
    </div>
</template>

<style scoped>
.hero-fade-enter-active,
.hero-fade-leave-active {
    transition: opacity 0.25s ease;
}
.hero-fade-enter-from,
.hero-fade-leave-to {
    opacity: 0;
}
</style>
