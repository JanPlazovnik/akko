import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { anilistQuery, staleWhileRevalidate } from '../lib/anilist';
import type { ResultOf, VariablesOf } from '../../shared/graphql/graphql';
import { DashboardQuery, GetAnimeQuery, SearchQuery } from '../../shared/graphql/queries';
import {
    normalizeEpisodes,
    type AniZipResponse,
    type Episode,
    type StreamingEpisode,
} from '../../shared/anizip/types';
import type { Media } from '../../shared/graphql/queries';
import router from '../router';

type DashboardData = ResultOf<typeof DashboardQuery>;

const MINUTE = 60_000;
const MAX_AGE = {
    dashboard: 15 * MINUTE,
    media: 6 * 60 * MINUTE,
    episodes: 6 * 60 * MINUTE,
    search: 10 * MINUTE,
};
type SearchVars = VariablesOf<typeof SearchQuery>;

function getCurrentSeason(): VariablesOf<typeof DashboardQuery> {
    const month = new Date().getMonth() + 1;
    const year = new Date().getFullYear();
    const season = month <= 3 ? 'WINTER' : month <= 6 ? 'SPRING' : month <= 9 ? 'SUMMER' : 'FALL';
    return { season, seasonYear: year };
}

export const useMediaStore = defineStore('media', () => {
    const dashboard = ref<DashboardData | null>(null);
    const dashboardLoading = ref(false);
    const dashboardError = ref<Error | null>(null);

    const selectedMediaId = ref<number | null>(null);
    const mediaById = ref<Record<number, Media>>({});
    const mediaLoadingById = ref<Record<number, boolean>>({});
    const mediaErrorById = ref<Record<number, Error | null>>({});

    const anizipById = ref<Record<number, AniZipResponse | null>>({});
    const streamingById = ref<Record<number, StreamingEpisode[]>>({});
    const episodesLoadingByMediaId = ref<Record<number, boolean>>({});
    const episodesErrorByMediaId = ref<Record<number, Error | null>>({});

    const searchResults = ref<Media[]>([]);
    const searchPage = ref(1);
    const searchHasNextPage = ref(true);
    const searchLoading = ref(false);
    const searchError = ref<Error | null>(null);
    const mediaRequests = new Map<number, Promise<Media | null>>();
    const episodeRequests = new Map<number, Promise<Episode[]>>();
    let searchRequestId = 0;

    const selectedMedia = computed(() =>
        selectedMediaId.value ? (mediaById.value[selectedMediaId.value] ?? null) : null
    );

    const episodesById = computed(() => {
        const episodes: Record<number, Episode[]> = {};
        for (const [id, data] of Object.entries(anizipById.value)) {
            episodes[Number(id)] = normalizeEpisodes(data, streamingById.value[Number(id)]);
        }
        return episodes;
    });

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
        return episodesById.value[id] ?? [];
    }

    function anidbAidFor(id: number) {
        return anizipById.value[id]?.mappings.anidb_id ?? null;
    }

    function episodesLoadingFor(id: number) {
        return episodesLoadingByMediaId.value[id] ?? false;
    }

    function applyDashboard(data: DashboardData | null) {
        if (!data) return;
        dashboard.value = data;
        rememberMany(data.trending?.media);
        rememberMany(data.season?.media);
        rememberMany(data.popular?.media);
        rememberMany(data.top?.media);
    }

    async function fetchDashboard() {
        dashboardLoading.value = !dashboard.value;
        dashboardError.value = null;

        try {
            await staleWhileRevalidate(
                (maxAge) => anilistQuery(DashboardQuery, getCurrentSeason(), maxAge),
                MAX_AGE.dashboard,
                applyDashboard
            );
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
                await staleWhileRevalidate(
                    (maxAge) => anilistQuery(GetAnimeQuery, { id }, maxAge),
                    MAX_AGE.media,
                    (data) => data?.Media && applyMedia(id, data.Media)
                );
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

    function applyMedia(id: number, media: NonNullable<ResultOf<typeof GetAnimeQuery>['Media']>) {
        rememberMedia(media as Media);
        streamingById.value = {
            ...streamingById.value,
            [id]: (media.streamingEpisodes ?? []).flatMap((e) => (e ? [e] : [])),
        };
    }

    function applyEpisodes(id: number, data: AniZipResponse | null) {
        anizipById.value = { ...anizipById.value, [id]: data };
    }

    async function fetchEpisodes(id: number): Promise<Episode[]> {
        const inFlight = episodeRequests.get(id);
        if (inFlight) return inFlight;

        const request = (async () => {
            episodesLoadingByMediaId.value = {
                ...episodesLoadingByMediaId.value,
                [id]: !(id in anizipById.value),
            };
            episodesErrorByMediaId.value = { ...episodesErrorByMediaId.value, [id]: null };

            try {
                await staleWhileRevalidate(
                    (maxAge) => window.api.metadata.anizipEpisodes(id, maxAge),
                    MAX_AGE.episodes,
                    (data) => applyEpisodes(id, data)
                );
                return episodesFor(id);
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
            const { data } = await anilistQuery(
                SearchQuery,
                { ...vars, page: searchPage.value } as SearchVars,
                MAX_AGE.search
            );
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
        mediaById,
        mediaLoadingById,
        mediaErrorById,
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
