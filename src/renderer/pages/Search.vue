<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { X } from '@lucide/vue';
import { toast } from '../lib/toast';
import { useLoadingStore } from '../stores/loading';
import { useMediaStore } from '../stores/media';
import MediaCard from '../components/MediaCard.vue';
import SelectMenu from '../components/ui/SelectMenu.vue';
import MultiSelectMenu from '../components/ui/MultiSelectMenu.vue';

const route = useRoute();
const router = useRouter();
const loadingBar = useLoadingStore();
const mediaStore = useMediaStore();

const q = route.query;
const filters = reactive({
    search: (q.search as string) || '',
    sort: (q.sort as string) || 'TRENDING_DESC',
    season: (q.season as string) || '',
    year: q.year ? Number(q.year) : (null as number | null),
    status: (q.status as string) || '',
    format: q.format ? String(q.format).split(',') : ([] as string[]),
    genres: q.genres ? String(q.genres).split(',') : ([] as string[]),
});

const SORT = [
    { value: 'TRENDING_DESC', label: 'Trending' },
    { value: 'POPULARITY_DESC', label: 'Popular' },
    { value: 'SCORE_DESC', label: 'Top Rated' },
    { value: 'START_DATE_DESC', label: 'Newest' },
    { value: 'TITLE_ROMAJI', label: 'A-Z' },
];

const SEASONS = [
    { value: 'WINTER', label: 'Winter' },
    { value: 'SPRING', label: 'Spring' },
    { value: 'SUMMER', label: 'Summer' },
    { value: 'FALL', label: 'Fall' },
];

const FORMATS = [
    { value: 'TV', label: 'TV Show' },
    { value: 'MOVIE', label: 'Movie' },
    { value: 'TV_SHORT', label: 'TV Short' },
    { value: 'SPECIAL', label: 'Special' },
    { value: 'OVA', label: 'OVA' },
    { value: 'ONA', label: 'ONA' },
    { value: 'MUSIC', label: 'Music' },
];

const STATUSES = [
    { value: 'RELEASING', label: 'Airing' },
    { value: 'FINISHED', label: 'Finished' },
    { value: 'CANCELLED', label: 'Cancelled' },
];

const GENRES = [
    'Action',
    'Adventure',
    'Comedy',
    'Drama',
    'Ecchi',
    'Fantasy',
    'Horror',
    'Mahou Shoujo',
    'Mecha',
    'Music',
    'Mystery',
    'Psychological',
    'Romance',
    'Sci-Fi',
    'Slice of Life',
    'Sports',
    'Supernatural',
    'Thriller',
];

const thisYear = new Date().getFullYear();
const YEARS = Array.from({ length: thisYear + 1 - 1941 + 1 }, (_, i) => {
    const y = String(thisYear + 1 - i);
    return { value: y, label: y };
});

const hasActiveFilters = computed(
    () =>
        !!filters.search ||
        !!filters.genres.length ||
        !!filters.year ||
        !!filters.season ||
        !!filters.format.length ||
        !!filters.status
);

function clearFilters() {
    filters.search = '';
    filters.sort = 'TRENDING_DESC';
    filters.season = '';
    filters.year = null;
    filters.status = '';
    filters.format = [];
    filters.genres = [];
}

const results = computed(() => mediaStore.searchResults);
const hasNextPage = computed(() => mediaStore.searchHasNextPage);
const loading = computed(() => mediaStore.searchLoading);
const failed = computed(() => !!mediaStore.searchError);
const resetting = ref(false);
const skeletonCount = computed(() => {
    if (!loading.value) return 0;
    if (!results.value.length) return 20;
    return resetting.value ? 0 : 14;
});

function buildVars() {
    const v: Record<string, unknown> = { type: 'ANIME', sort: [filters.sort] };
    if (filters.search) v.search = filters.search;
    if (filters.genres.length) v.genres = [...filters.genres];
    if (filters.year) v.seasonYear = filters.year;
    if (filters.season) v.season = filters.season;
    if (filters.format.length) v.format = [...filters.format];
    if (filters.status) v.status = filters.status;
    return v;
}

async function fetchPage(reset = false) {
    if (loading.value && !reset) return;
    if (!hasNextPage.value && !reset) return;
    // A failed page would otherwise retry in a loop as its skeletons unmount and expose the sentinel
    if (failed.value && !reset) return;
    if (reset) {
        loadingBar.start();
        resetting.value = true;
    }

    try {
        await mediaStore.searchAnime(buildVars() as any, reset);
    } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Search failed');
    } finally {
        if (reset) {
            loadingBar.finish();
            resetting.value = false;
        }
    }
}

function retry() {
    if (!results.value.length) return fetchPage(true);
    mediaStore.searchError = null;
    fetchPage();
}

watch(
    () => route.query.search,
    (search) => (filters.search = String(search ?? ''))
);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

watch(
    () => filters.search,
    () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => fetchPage(true), 400);
    }
);

watch(
    () => [
        filters.sort,
        filters.season,
        filters.year,
        filters.status,
        filters.format.slice(),
        filters.genres.slice(),
    ],
    () => fetchPage(true),
    { deep: true }
);

watch(
    filters,
    (f) => {
        router.replace({
            query: {
                ...(f.search && { search: f.search }),
                ...(f.sort !== 'TRENDING_DESC' && { sort: f.sort }),
                ...(f.season && { season: f.season }),
                ...(f.year && { year: String(f.year) }),
                ...(f.status && { status: f.status }),
                ...(f.format.length && { format: f.format.join(',') }),
                ...(f.genres.length && { genres: f.genres.join(',') }),
            },
        });
    },
    { deep: true }
);

const sentinel = ref<HTMLElement | null>(null);
let scrollObserver: IntersectionObserver | null = null;

onMounted(async () => {
    await fetchPage(true);
    await nextTick();
    if (sentinel.value) {
        scrollObserver = new IntersectionObserver(
            ([e]) => {
                if (e.isIntersecting) fetchPage();
            },
            { rootMargin: '300px' }
        );
        scrollObserver.observe(sentinel.value);
    }
});

onUnmounted(() => scrollObserver?.disconnect());
</script>

<template>
    <div class="min-h-full">
        <!-- filter bar -->
        <div
            class="sticky top-0 z-50 flex flex-wrap items-center gap-2 border-b border-line bg-surface/85 px-8 py-4 backdrop-blur-md"
        >
            <SelectMenu v-model="filters.sort" :options="SORT" placeholder="Sort" />
            <SelectMenu v-model="filters.season" :options="SEASONS" placeholder="Season" />
            <SelectMenu
                :model-value="filters.year ? String(filters.year) : ''"
                :options="YEARS"
                placeholder="Year"
                :scrollable="true"
                @update:model-value="filters.year = $event ? Number($event) : null"
            />
            <SelectMenu v-model="filters.status" :options="STATUSES" placeholder="Status" />
            <MultiSelectMenu v-model="filters.format" :options="FORMATS" placeholder="Format" />
            <MultiSelectMenu
                v-model="filters.genres"
                :options="GENRES.map((g) => ({ value: g, label: g }))"
                placeholder="Genres"
            />

            <button
                v-if="hasActiveFilters"
                class="flex items-center gap-1 h-8 px-3 rounded-full text-xs bg-neutral-800 hover:bg-neutral-700 text-white/50 hover:text-white transition-colors"
                @click="clearFilters"
            >
                <X :size="11" /> Clear
            </button>
        </div>

        <!-- results grid -->
        <div class="px-8 py-6">
            <div
                :class="[
                    'grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-4 gap-y-6 transition-opacity',
                    resetting && results.length && 'opacity-50',
                ]"
            >
                <MediaCard v-for="item in results" :key="item.id" :item="item" />
                <div v-for="i in skeletonCount" :key="`skeleton-${i}`" class="animate-pulse">
                    <div class="aspect-2/3 rounded-xl bg-raised" />
                    <div class="mt-2.5 h-3 w-3/4 rounded bg-raised" />
                    <div class="mt-1.5 h-2.5 w-1/2 rounded bg-raised" />
                </div>
            </div>

            <div ref="sentinel" class="h-4 mt-2" />
            <div v-if="failed && !loading" class="flex justify-center pb-4">
                <button
                    class="h-8 px-3 rounded-full text-xs bg-neutral-800 hover:bg-neutral-700 text-white/50 hover:text-white transition-colors"
                    @click="retry"
                >
                    Try again
                </button>
            </div>
            <div v-else-if="!hasNextPage && results.length" class="flex justify-center pb-4">
                <span class="text-white/15 text-xs">End of results</span>
            </div>
        </div>
    </div>
</template>
