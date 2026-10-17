<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { toast } from 'vue3-toastify';
import { Play, Star } from '@lucide/vue';
import Badge from '../components/ui/Badge.vue';
import TorrentPickerDialog from '../components/TorrentPickerDialog.vue';
import { STATUS_LABELS, mediaMeta, stripHtml } from '../lib/media-labels';
import { accentStyle } from '../lib/accent';
import { useMediaStore } from '../stores/media';
import { useLoadingStore } from '../stores/loading';
import type { Episode } from '@shared/anizip/types';

const STATUS_DOT: Record<string, string> = {
    RELEASING: 'bg-emerald-400',
    NOT_YET_RELEASED: 'bg-amber-400',
    CANCELLED: 'bg-red-400',
    HIATUS: 'bg-red-400',
};

const route = useRoute();
const mediaStore = useMediaStore();
const loadingBar = useLoadingStore();

const routeMediaId = computed(() => Number(route.params.id));
const media = computed(() => mediaStore.mediaFor(routeMediaId.value));
const episodes = computed(() => mediaStore.episodesFor(routeMediaId.value));
const episodesLoading = computed(() => mediaStore.episodesLoadingFor(routeMediaId.value));
const anidbAid = computed(() => mediaStore.anidbAidFor(routeMediaId.value));
const selectedEpisode = ref<Episode | null>(null);
const dialogOpen = ref(false);
const descriptionExpanded = ref(false);

const description = computed(() => stripHtml(media.value?.description));
const fallbackThumbnail = computed(
    () => media.value?.bannerImage ?? media.value?.coverImage?.large ?? null
);
const firstEpisode = computed(() => episodes.value.find((ep) => !isUnaired(ep)) ?? null);

onMounted(async () => {
    const id = routeMediaId.value;
    loadingBar.start();
    mediaStore.setSelectedMedia(id);
    try {
        const loadedMedia = media.value ?? (await mediaStore.fetchMedia(id));
        if (loadedMedia?.status !== 'NOT_YET_RELEASED') {
            await mediaStore.fetchEpisodes(id);
        }
    } catch (err) {
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

function openDialog(ep: Episode) {
    selectedEpisode.value = ep;
    dialogOpen.value = true;
}

function isUnaired(ep: Episode) {
    if (!ep.airDate) return !ep.title;
    return Date.parse(ep.airDate) > Date.now();
}

const formatAirDate = (date: string) =>
    new Date(date).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
</script>

<template>
    <div class="min-h-full pb-16" :style="accentStyle(media?.coverImage?.color)">
        <div class="sticky top-0 z-50 h-0 overflow-visible">
            <Transition name="sticky-fade">
                <div
                    v-if="stickyVisible && media"
                    class="flex items-center gap-3 border-b border-line bg-surface/85 px-8 py-3 backdrop-blur-md"
                >
                    <img
                        v-if="media.coverImage?.large"
                        :src="media.coverImage.large"
                        class="h-10 w-7 shrink-0 rounded object-cover"
                    />
                    <p class="truncate font-display font-semibold">
                        {{ media.title?.userPreferred }}
                    </p>
                    <button
                        v-if="firstEpisode"
                        class="ml-auto inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-white/85"
                        @click="openDialog(firstEpisode)"
                    >
                        <Play :size="12" fill="currentColor" /> Watch
                    </button>
                </div>
            </Transition>
        </div>

        <template v-if="media">
            <section class="relative h-[340px] overflow-hidden">
                <img
                    v-if="media.bannerImage"
                    :src="media.bannerImage"
                    class="absolute inset-0 size-full object-cover"
                />
                <img
                    v-else-if="media.coverImage?.large"
                    :src="media.coverImage.large"
                    class="absolute inset-0 size-full scale-110 object-cover opacity-50 blur-2xl"
                />
                <div
                    class="absolute inset-0 bg-linear-to-t from-surface via-surface/40 to-transparent"
                />
                <div
                    class="absolute inset-0 bg-linear-to-r from-surface/70 via-transparent to-transparent"
                />
            </section>

            <div class="relative -mt-40 flex gap-8 px-10">
                <div
                    class="aspect-2/3 w-[190px] shrink-0 self-start overflow-hidden rounded-xl bg-raised shadow-2xl shadow-black/70 ring-1 ring-white/10"
                >
                    <img
                        v-if="media.coverImage?.large"
                        :src="media.coverImage.large"
                        class="size-full object-cover"
                    />
                </div>

                <div class="flex min-w-0 flex-1 flex-col justify-end pt-28">
                    <p
                        class="truncate text-xs font-semibold tracking-wider text-white/45 uppercase"
                    >
                        {{ media.title?.romaji }}
                    </p>
                    <h1
                        ref="titleEl"
                        class="mt-1 font-display text-4xl leading-tight font-bold tracking-tight text-balance select-text"
                    >
                        {{ media.title?.userPreferred }}
                    </h1>

                    <div
                        class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/65"
                    >
                        <span
                            v-if="media.averageScore"
                            class="flex items-center gap-1 font-semibold text-white"
                        >
                            <Star :size="14" class="fill-accent text-accent" />
                            {{ media.averageScore }}%
                        </span>
                        <span v-if="media.status" class="flex items-center gap-1.5">
                            <span
                                :class="[
                                    'size-1.5 rounded-full',
                                    STATUS_DOT[media.status] ?? 'bg-white/40',
                                ]"
                            />
                            {{ STATUS_LABELS[media.status] ?? media.status }}
                        </span>
                        <template v-for="part in mediaMeta(media)" :key="part">
                            <span class="text-white/25">•</span>
                            <span>{{ part }}</span>
                        </template>
                    </div>

                    <div v-if="media.genres?.length" class="mt-3 flex flex-wrap gap-1.5">
                        <Badge
                            v-for="genre in media.genres.filter(Boolean)"
                            :key="genre!"
                            variant="tag"
                            :query="{ genres: genre! }"
                        >
                            {{ genre }}
                        </Badge>
                    </div>

                    <div class="mt-5 flex items-center gap-3">
                        <button
                            class="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-white/85 active:scale-[0.97] disabled:cursor-default disabled:opacity-40"
                            :disabled="!firstEpisode"
                            @click="firstEpisode && openDialog(firstEpisode)"
                        >
                            <Play :size="15" fill="currentColor" />
                            {{
                                firstEpisode
                                    ? `Watch episode ${firstEpisode.number}`
                                    : 'Not available yet'
                            }}
                        </button>
                    </div>
                </div>
            </div>

            <div v-if="description" class="mt-8 max-w-4xl px-10">
                <p
                    :class="[
                        'text-sm leading-relaxed text-white/60 select-text',
                        !descriptionExpanded && 'line-clamp-3',
                    ]"
                >
                    {{ description }}
                </p>
                <button
                    v-if="description.length > 320"
                    class="mt-1.5 cursor-pointer text-xs font-semibold text-accent hover:underline"
                    @click="descriptionExpanded = !descriptionExpanded"
                >
                    {{ descriptionExpanded ? 'Show less' : 'Show more' }}
                </button>
            </div>

            <section v-if="episodesLoading || episodes.length" class="mt-10 px-10">
                <div class="mb-4 flex items-baseline gap-3">
                    <h2 class="font-display text-2xl font-semibold tracking-tight">Episodes</h2>
                    <span v-if="episodes.length" class="text-sm text-white/40">
                        {{ episodes.length }}
                    </span>
                </div>

                <div class="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-x-5 gap-y-7">
                    <template v-if="episodesLoading">
                        <div v-for="i in 8" :key="i" class="animate-pulse">
                            <div class="aspect-video rounded-xl bg-raised" />
                            <div class="mt-3 h-3 w-3/4 rounded bg-raised" />
                            <div class="mt-2 h-2.5 w-1/2 rounded bg-raised" />
                        </div>
                    </template>

                    <button
                        v-for="(ep, index) in episodes"
                        v-else
                        :key="index"
                        data-episode
                        class="group cursor-pointer self-start text-left disabled:cursor-default"
                        :disabled="isUnaired(ep)"
                        @click="openDialog(ep)"
                    >
                        <div
                            :class="[
                                'relative aspect-video overflow-hidden rounded-xl bg-raised ring-1 ring-white/5 transition group-enabled:group-hover:ring-accent/60',
                                isUnaired(ep) && 'opacity-40',
                            ]"
                        >
                            <img
                                v-if="ep.image"
                                :src="ep.image"
                                class="absolute inset-0 size-full object-cover transition duration-300 group-enabled:group-hover:scale-105"
                            />
                            <img
                                v-else-if="fallbackThumbnail"
                                :src="fallbackThumbnail"
                                class="absolute inset-0 size-full scale-110 object-cover opacity-35 blur-[2px]"
                            />
                            <div
                                class="absolute inset-0 bg-linear-to-t from-black/70 via-transparent to-transparent"
                            />
                            <div
                                class="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition-opacity group-enabled:group-hover:opacity-100"
                            >
                                <span
                                    class="grid size-11 place-items-center rounded-full bg-white text-black"
                                >
                                    <Play :size="18" fill="currentColor" />
                                </span>
                            </div>
                            <span
                                class="absolute bottom-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold"
                            >
                                EP {{ ep.number }}
                            </span>
                            <span
                                v-if="ep.runtime"
                                class="absolute right-2 bottom-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] text-white/80"
                            >
                                {{ ep.runtime }}m
                            </span>
                        </div>
                        <p class="mt-2.5 truncate text-sm font-medium">
                            {{ ep.title || `Episode ${ep.number}` }}
                        </p>
                        <p
                            v-if="ep.overview"
                            class="mt-1 line-clamp-2 text-xs leading-relaxed text-white/40"
                        >
                            {{ ep.overview }}
                        </p>
                        <p class="mt-1.5 text-[11px] text-white/30">
                            <template v-if="ep.airDate">
                                {{ isUnaired(ep) ? 'Airs' : 'Aired' }}
                                {{ formatAirDate(ep.airDate) }}
                            </template>
                            <template v-else-if="isUnaired(ep)">Not aired yet</template>
                        </p>
                    </button>
                </div>
            </section>
        </template>

        <template v-else>
            <div class="h-[340px] animate-pulse bg-raised/60" />
            <div class="-mt-40 flex gap-8 px-10">
                <div class="aspect-2/3 w-[190px] animate-pulse rounded-xl bg-raised" />
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
