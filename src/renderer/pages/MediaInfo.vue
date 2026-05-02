<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { toast } from 'vue3-toastify';
import { Play } from '@lucide/vue';
import Badge from '../components/ui/Badge.vue';
import TorrentPickerDialog from '../components/TorrentPickerDialog.vue';
import { STATUS_LABELS, FORMAT_LABELS, SEASON_LABELS } from '../lib/media-labels';
import { useAnilistStore } from '../stores/anilist';
import { useLoadingStore } from '../stores/loading';
import { fetchEpisodes } from '../lib/anizip-client';
import type { AniZipEpisode } from '@shared/anizip/types';

const route = useRoute();
const anilist = useAnilistStore();
const loadingBar = useLoadingStore();

const media = computed(() => anilist.selectedMedia);
const episodes = ref<AniZipEpisode[]>([]);
const episodesLoading = ref(false);
const anidbAid = ref<number | null>(null);
const selectedEpisode = ref<AniZipEpisode | null>(null);
const dialogOpen = ref(false);

onMounted(async () => {
    const id = Number(route.params.id);
    loadingBar.start();
    episodesLoading.value = true;
    try {
        if (media.value?.id !== id) await anilist.fetchMedia(id);
        const notReleased = media.value?.status === 'NOT_YET_RELEASED';
        if (!notReleased) {
            const data = await fetchEpisodes(id);
            anidbAid.value = data.mappings.anidb_id;
            episodes.value = Object.entries(data.episodes)
                .filter(([key]) => /^\d+$/.test(key))
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([, ep]) => ep);
            episodesLoading.value = false;
        }
    } catch (err) {
        episodesLoading.value = false;
        toast.error(err instanceof Error ? err.message : 'Failed to load media');
    } finally {
        loadingBar.finish();
    }
    await nextTick();
    observeTitle();
});

const titleEl = ref<HTMLElement | null>(null);
const stickyVisible = ref(false);
let observer: IntersectionObserver | null = null;

onUnmounted(() => observer?.disconnect());

function observeTitle() {
    if (!titleEl.value) return;
    observer = new IntersectionObserver(
        ([entry]) => {
            stickyVisible.value = !entry.isIntersecting;
        },
        { threshold: 0 }
    );
    observer.observe(titleEl.value);
}

function openDialog(ep: AniZipEpisode) {
    selectedEpisode.value = ep;
    dialogOpen.value = true;
}

const stripHtml = (s?: string | null) => s?.replace(/<[^>]*>/g, '') ?? '';

const episodeTitle = (ep: AniZipEpisode, displayNum: number) => {
    const t = ep.title;
    return t['en'] || t['x-jat'] || t['ja'] || `Episode ${displayNum}`;
};

const formatRuntime = (mins: number | null) => (mins ? `${mins}m` : null);
</script>

<template>
    <div class="min-h-full bg-neutral-900 text-white">
        <div class="sticky top-0 z-50 h-0 overflow-visible">
            <Transition name="sticky-fade">
                <div
                    v-if="stickyVisible && media"
                    class="px-8 py-3 bg-neutral-900/90 backdrop-blur-sm border-b border-white/5 flex items-center gap-3"
                >
                    <img
                        v-if="media.coverImage?.large"
                        :src="media.coverImage.large"
                        class="w-7 h-10 rounded object-cover shrink-0"
                    />
                    <p class="text-sm font-semibold truncate">{{ media.title?.userPreferred }}</p>
                </div>
            </Transition>
        </div>
        <template v-if="media">
            <!-- Banner -->
            <div class="h-[220px] relative overflow-hidden">
                <img
                    v-if="media.bannerImage"
                    :src="media.bannerImage"
                    class="absolute inset-0 w-full h-full object-cover"
                />
                <div v-else class="absolute inset-0 bg-neutral-800" />
                <div class="absolute inset-0 bg-linear-to-b from-transparent to-neutral-900" />
            </div>

            <div class="-mt-16 px-8 relative">
                <!-- Poster + info -->
                <div class="flex gap-6 items-end mb-6">
                    <div
                        class="w-[140px] h-[210px] rounded-lg overflow-hidden bg-neutral-800 shrink-0 shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
                    >
                        <img
                            v-if="media.coverImage?.large"
                            :src="media.coverImage.large"
                            class="w-full h-full object-cover"
                        />
                    </div>

                    <div class="pb-1 flex-1">
                        <p class="text-[10px] text-white/40 uppercase tracking-widest mb-1">
                            {{ media.title?.romaji }}
                        </p>
                        <h1
                            ref="titleEl"
                            class="text-2xl font-bold text-white leading-tight mb-3 select-text"
                        >
                            {{ media.title?.userPreferred }}
                        </h1>
                        <div class="flex items-center gap-1.5 flex-wrap mb-3">
                            <Badge v-if="media.episodes">{{ media.episodes }} EP</Badge>
                            <Badge v-if="media.format" :query="{ format: media.format! }">{{
                                FORMAT_LABELS[media.format!] ?? media.format
                            }}</Badge>
                            <Badge v-if="media.status" :query="{ status: media.status! }">{{
                                STATUS_LABELS[media.status!] ?? media.status
                            }}</Badge>
                            <Badge
                                v-if="media.season && media.seasonYear"
                                :query="{ season: media.season!, year: String(media.seasonYear) }"
                                >{{ SEASON_LABELS[media.season!] ?? media.season }}
                                {{ media.seasonYear }}</Badge
                            >
                            <Badge v-if="media.averageScore">{{ media.averageScore }}%</Badge>
                        </div>
                        <p
                            class="text-white/50 text-xs leading-relaxed mb-2 line-clamp-3 select-text"
                        >
                            {{ stripHtml(media.description) }}
                        </p>
                        <div v-if="media.genres?.length" class="flex gap-1.5 flex-wrap mb-4">
                            <Badge
                                v-for="genre in (media.genres ?? []).filter(Boolean).slice(0, 5)"
                                :key="genre!"
                                variant="tag"
                                :query="{ genres: genre! }"
                                >{{ genre }}</Badge
                            >
                        </div>
                        <button
                            class="flex items-center gap-2 bg-white text-black text-xs font-semibold px-4 py-2 rounded-full hover:bg-white/85 transition-opacity cursor-pointer"
                        >
                            <Play :size="11" fill="black" /> Watch now
                        </button>
                    </div>
                </div>

                <!-- Episodes -->
                <div class="pb-8">
                    <template v-if="episodesLoading">
                        <h2 class="text-sm font-semibold mb-3">Episodes</h2>
                        <div class="grid grid-cols-2 gap-2">
                            <div
                                v-for="i in 6"
                                :key="i"
                                class="flex gap-3 p-2.5 rounded-lg bg-neutral-800/60 animate-pulse"
                            >
                                <div class="w-[100px] h-[60px] bg-neutral-700 rounded shrink-0" />
                                <div class="flex-1 py-0.5 space-y-2">
                                    <div class="h-2.5 bg-neutral-700 rounded w-3/4" />
                                    <div class="h-2 bg-neutral-700 rounded w-full" />
                                    <div class="h-2 bg-neutral-700 rounded w-2/3" />
                                </div>
                            </div>
                        </div>
                    </template>

                    <template v-else-if="episodes.length">
                        <h2 class="text-sm font-semibold mb-3">Episodes</h2>
                        <div class="grid grid-cols-2 gap-3">
                            <div
                                v-for="(ep, i) in episodes"
                                :key="ep.episodeNumber"
                                class="flex gap-3 p-3 rounded-lg bg-neutral-800/60 hover:bg-neutral-800 transition-colors cursor-pointer"
                                @click="openDialog(ep)"
                            >
                                <div
                                    class="w-[140px] h-[84px] bg-neutral-700 rounded shrink-0 relative overflow-hidden"
                                >
                                    <img
                                        v-if="ep.image"
                                        :src="ep.image"
                                        class="absolute inset-0 w-full h-full object-cover"
                                    />
                                    <span
                                        class="absolute bottom-1.5 left-2 text-[11px] font-semibold text-white/80 bg-black/70 px-1.5 py-0.5 rounded"
                                    >
                                        {{ i + 1 }}
                                    </span>
                                </div>
                                <div class="flex-1 min-w-0 py-0.5 flex flex-col">
                                    <p
                                        class="text-white text-sm font-medium leading-tight mb-1.5 truncate"
                                    >
                                        {{ episodeTitle(ep, i + 1) }}
                                    </p>
                                    <p
                                        class="text-white/35 text-[11px] leading-relaxed line-clamp-3"
                                    >
                                        {{ ep.overview ?? 'No synopsis available.' }}
                                    </p>
                                    <p
                                        v-if="ep.airDate"
                                        class="text-[10px] text-white/25 mt-auto pt-1"
                                    >
                                        {{ ep.airDate }}
                                    </p>
                                </div>
                                <span
                                    v-if="formatRuntime(ep.runtime)"
                                    class="text-[10px] text-white/25 shrink-0 pt-0.5"
                                >
                                    {{ formatRuntime(ep.runtime) }}
                                </span>
                            </div>
                        </div>
                    </template>
                </div>
            </div>
        </template>
    </div>

    <TorrentPickerDialog
        v-if="selectedEpisode && media"
        v-model:open="dialogOpen"
        :episode="selectedEpisode"
        :anilist-id="media.id"
        :titles="[media.title?.romaji, media.title?.english].filter((t): t is string => !!t)"
        :episode-count="media.episodes ?? null"
        :anidb-aid="anidbAid"
    />
</template>

<style scoped>
.sticky-fade-enter-active,
.sticky-fade-leave-active {
    transition:
        opacity 0.15s ease,
        transform 0.15s ease;
}
.sticky-fade-enter-from,
.sticky-fade-leave-to {
    opacity: 0;
    transform: translateY(-6px);
}
</style>
