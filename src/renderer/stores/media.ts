import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { anilistClient } from '../lib/anilist-client';
import { fetchEpisodes as fetchAniZipEpisodes } from '../lib/anizip-client';
import type { ResultOf, VariablesOf } from '../../shared/graphql/graphql';
import { DashboardQuery, GetAnimeQuery, SearchQuery } from '../../shared/graphql/queries';
import type { AniZipEpisode } from '../../shared/anizip/types';
import type { Media } from '../../shared/graphql/queries';
import router from '../router';

type DashboardData = ResultOf<typeof DashboardQuery>;
type SearchVars = VariablesOf<typeof SearchQuery>;

function getCurrentSeason(): VariablesOf<typeof DashboardQuery> {
    const month = new Date().getMonth() + 1;
    const year = new Date().getFullYear();
    const season = month <= 3 ? 'WINTER' : month <= 6 ? 'SPRING' : month <= 9 ? 'SUMMER' : 'FALL';
    return { season, seasonYear: year };
}

function episodeList(data: Record<string, AniZipEpisode>): AniZipEpisode[] {
    return Object.entries(data)
        .filter(([key]) => /^\d+$/.test(key))
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([, episode]) => episode);
}

export const useMediaStore = defineStore('media', () => {
    const dashboard = ref<DashboardData | null>(null);
    const dashboardLoading = ref(false);
    const dashboardError = ref<Error | null>(null);

    const selectedMediaId = ref<number | null>(null);
    const mediaById = ref<Record<number, Media>>({});
    const mediaLoadingById = ref<Record<number, boolean>>({});
    const mediaErrorById = ref<Record<number, Error | null>>({});

    const episodesByMediaId = ref<Record<number, AniZipEpisode[]>>({});
    const anidbAidByMediaId = ref<Record<number, number | null>>({});
    const episodesLoadingByMediaId = ref<Record<number, boolean>>({});
    const episodesErrorByMediaId = ref<Record<number, Error | null>>({});

    const searchResults = ref<Media[]>([]);
    const searchPage = ref(1);
    const searchHasNextPage = ref(true);
    const searchLoading = ref(false);
    const searchError = ref<Error | null>(null);
    const mediaRequests = new Map<number, Promise<Media | null>>();
    const episodeRequests = new Map<number, Promise<AniZipEpisode[]>>();
    let searchRequestId = 0;

    const selectedMedia = computed(() =>
        selectedMediaId.value ? (mediaById.value[selectedMediaId.value] ?? null) : null
    );

    const selectedEpisodes = computed(() =>
        selectedMediaId.value ? (episodesByMediaId.value[selectedMediaId.value] ?? []) : []
    );

    const selectedAnidbAid = computed(() =>
        selectedMediaId.value ? (anidbAidByMediaId.value[selectedMediaId.value] ?? null) : null
    );

    function rememberMedia(item: Media) {
        mediaById.value = { ...mediaById.value, [item.id]: item };
    }

    function rememberMany(items: (Media | null)[] | null | undefined) {
        for (const item of items ?? []) {
            if (item) rememberMedia(item);
        }
    }

    function setSelectedMedia(id: number) {
        selectedMediaId.value = id;
    }

    function mediaFor(id: number) {
        return mediaById.value[id] ?? null;
    }

    function episodesFor(id: number) {
        return episodesByMediaId.value[id] ?? [];
    }

    function anidbAidFor(id: number) {
        return anidbAidByMediaId.value[id] ?? null;
    }

    function episodesLoadingFor(id: number) {
        return episodesLoadingByMediaId.value[id] ?? false;
    }

    async function fetchDashboard() {
        if (dashboardLoading.value) return;
        dashboardLoading.value = true;
        dashboardError.value = null;

        try {
            const { data } = await anilistClient.query(
                DashboardQuery,
                getCurrentSeason(),
                'dashboard'
            );
            dashboard.value = data;
            rememberMany(data?.trending?.media);
            rememberMany(data?.season?.media);
            rememberMany(data?.popular?.media);
            rememberMany(data?.top?.media);
        } catch (err) {
            dashboardError.value = err as Error;
        } finally {
            dashboardLoading.value = false;
        }
    }

    async function fetchMedia(id: number): Promise<Media | null> {
        const inFlight = mediaRequests.get(id);
        if (inFlight) return inFlight;

        const request = (async () => {
            mediaLoadingById.value = { ...mediaLoadingById.value, [id]: true };
            mediaErrorById.value = { ...mediaErrorById.value, [id]: null };

            try {
                const { data } = await anilistClient.query(GetAnimeQuery, { id }, `media-${id}`);
                if (data?.Media) rememberMedia(data.Media as Media);
                return mediaFor(id);
            } catch (err) {
                mediaErrorById.value = { ...mediaErrorById.value, [id]: err as Error };
                throw err;
            } finally {
                mediaLoadingById.value = { ...mediaLoadingById.value, [id]: false };
                mediaRequests.delete(id);
            }
        })();
        mediaRequests.set(id, request);
        return request;
    }

    async function fetchEpisodes(id: number): Promise<AniZipEpisode[]> {
        const cached = episodesByMediaId.value[id];
        if (cached) return cached;
        const inFlight = episodeRequests.get(id);
        if (inFlight) return inFlight;

        const request = (async () => {
            episodesLoadingByMediaId.value = { ...episodesLoadingByMediaId.value, [id]: true };
            episodesErrorByMediaId.value = { ...episodesErrorByMediaId.value, [id]: null };

            try {
                const data = await fetchAniZipEpisodes(id);
                const episodes = episodeList(data.episodes);
                episodesByMediaId.value = { ...episodesByMediaId.value, [id]: episodes };
                anidbAidByMediaId.value = {
                    ...anidbAidByMediaId.value,
                    [id]: data.mappings.anidb_id,
                };
                return episodes;
            } catch (err) {
                episodesErrorByMediaId.value = {
                    ...episodesErrorByMediaId.value,
                    [id]: err as Error,
                };
                throw err;
            } finally {
                episodesLoadingByMediaId.value = {
                    ...episodesLoadingByMediaId.value,
                    [id]: false,
                };
                episodeRequests.delete(id);
            }
        })();
        episodeRequests.set(id, request);
        return request;
    }

    async function preloadMedia(id: number) {
        const media = mediaFor(id) ?? (await fetchMedia(id));
        if (media?.status !== 'NOT_YET_RELEASED') {
            await fetchEpisodes(id);
        }
    }

    function viewMedia(item: Media) {
        rememberMedia(item);
        selectedMediaId.value = item.id;
        void preloadMedia(item.id);
        router.push(`/media/${item.id}`);
    }

    function resetSearch() {
        searchResults.value = [];
        searchPage.value = 1;
        searchHasNextPage.value = true;
        searchError.value = null;
    }

    async function searchAnime(vars: Omit<SearchVars, 'page'>, reset = false) {
        if (searchLoading.value && !reset) return;
        if (!searchHasNextPage.value && !reset) return;

        if (reset) {
            searchPage.value = 1;
            searchHasNextPage.value = true;
        }

        const id = ++searchRequestId;
        searchLoading.value = true;
        searchError.value = null;

        try {
            const { data } = await anilistClient.query(SearchQuery, {
                ...vars,
                page: searchPage.value,
            } as SearchVars);
            if (id !== searchRequestId) return;

            const media = (data?.Page?.media ?? []).filter((item): item is Media => item !== null);
            rememberMany(media);
            searchResults.value = reset ? media : [...searchResults.value, ...media];
            searchHasNextPage.value = data?.Page?.pageInfo?.hasNextPage ?? false;
            searchPage.value++;
        } catch (err) {
            if (id !== searchRequestId) return;
            searchError.value = err as Error;
            throw err;
        } finally {
            if (id === searchRequestId) {
                searchLoading.value = false;
            }
        }
    }

    return {
        dashboard,
        dashboardLoading,
        dashboardError,
        selectedMediaId,
        selectedMedia,
        selectedEpisodes,
        selectedAnidbAid,
        mediaById,
        mediaLoadingById,
        mediaErrorById,
        episodesByMediaId,
        anidbAidByMediaId,
        episodesLoadingByMediaId,
        episodesErrorByMediaId,
        searchResults,
        searchPage,
        searchHasNextPage,
        searchLoading,
        searchError,
        rememberMedia,
        setSelectedMedia,
        mediaFor,
        episodesFor,
        anidbAidFor,
        episodesLoadingFor,
        fetchDashboard,
        fetchMedia,
        fetchEpisodes,
        preloadMedia,
        viewMedia,
        resetSearch,
        searchAnime,
    };
});
