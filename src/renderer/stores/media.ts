import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { anilistQuery, staleWhileRevalidate } from '../lib/anilist';
import { createLogger } from '../lib/logger';
import type { ResultOf, VariablesOf } from '../../shared/graphql/graphql';
import { DashboardQuery, GetAnimeQuery, SearchQuery } from '../../shared/graphql/queries';
import {
    matchStreaming,
    applySchedule,
    normalizeEpisodes,
    padEpisodes,
    placeholderEpisodes,
    type AiringEpisode,
    type AniZipResponse,
    type Episode,
    type StreamingEpisode,
} from '../../shared/anizip/types';
import type { Media } from '../../shared/graphql/queries';
import { mediaTitle } from '../../shared/media/types';
import { RELATION_LABELS } from '../lib/media-labels';
import router from '../router';

type DashboardData = ResultOf<typeof DashboardQuery>;
type AnimeData = NonNullable<ResultOf<typeof GetAnimeQuery>['Media']>;
type FuzzyDate = Media['startDate'];

export type RelatedMedia = { relation: string; media: Media };
export type Trailer = { site: 'youtube' | 'dailymotion'; id: string };
export type MediaDetails = {
    trailer: Trailer | null;
    studios: string[];
    related: RelatedMedia[];
    recommendations: Media[];
};

const TRAILER_SITES = new Set<string>(['youtube', 'dailymotion'] satisfies Trailer['site'][]);
const RELATION_ORDER = Object.keys(RELATION_LABELS);

const dateKey = (date: FuzzyDate) =>
    (date?.year ?? 9999) * 10_000 + (date?.month ?? 99) * 100 + (date?.day ?? 99);

// The lighter list fields cover everything a card shows
const asMedia = (item: unknown) => item as Media;

// Only anime opens on the media page, and music videos crowd out the actual seasons
function mediaDetails(media: AnimeData): MediaDetails {
    const { id: trailerId, site } = media.trailer ?? {};
    const trailer =
        trailerId && site && TRAILER_SITES.has(site)
            ? { site: site as Trailer['site'], id: trailerId }
            : null;
    const related = (media.relations?.edges ?? [])
        .flatMap((edge) =>
            edge?.node?.type === 'ANIME' &&
            edge.node.format !== 'MUSIC' &&
            edge.relationType &&
            edge.relationType in RELATION_LABELS
                ? [{ relation: edge.relationType, media: asMedia(edge.node) }]
                : []
        )
        .sort(
            (a, b) =>
                RELATION_ORDER.indexOf(a.relation) - RELATION_ORDER.indexOf(b.relation) ||
                dateKey(a.media.startDate) - dateKey(b.media.startDate)
        )
        .filter((r, i, all) => all.findIndex((other) => other.media.id === r.media.id) === i);
    const recommendations = (media.recommendations?.nodes ?? []).flatMap((node) => {
        const item = node?.mediaRecommendation;
        return item && (media.isAdult || !item.isAdult) ? [asMedia(item)] : [];
    });
    return {
        trailer,
        studios: (media.studios?.edges ?? []).flatMap((edge) =>
            edge?.isMain && edge.node?.name ? [edge.node.name] : []
        ),
        related,
        recommendations,
    };
}

const log = createLogger('media');

const MINUTE = 60_000;
const MAX_AGE = {
    dashboard: 15 * MINUTE,
    media: 6 * 60 * MINUTE,
    episodes: 6 * 60 * MINUTE,
    search: 10 * MINUTE,
};
type SearchVars = VariablesOf<typeof SearchQuery>;

function releaseDate(date: FuzzyDate): string | null {
    if (!date?.year || !date.month || !date.day) return null;
    const released = Date.UTC(date.year, date.month - 1, date.day);
    return released <= Date.now() ? new Date(released).toISOString() : null;
}

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

    const detailsById = ref<Record<number, MediaDetails>>({});
    const anizipById = ref<Record<number, AniZipResponse | null>>({});
    const streamingById = ref<Record<number, StreamingEpisode[]>>({});
    const airingById = ref<Record<number, AiringEpisode[]>>({});
    const episodesLoadingByMediaId = ref<Record<number, boolean>>({});
    const episodesErrorByMediaId = ref<Record<number, Error | null>>({});

    const searchResults = ref<Media[]>([]);
    const searchPage = ref(1);
    const searchHasNextPage = ref(true);
    const searchLoading = ref(false);
    const searchError = ref<Error | null>(null);
    const mediaRequests = new Map<number, Promise<Media | null>>();
    const episodeRequests = new Map<number, Promise<Episode[]>>();
    const loggedMappings = new Set<number>();
    const loggedStreaming = new Set<number>();
    let searchRequestId = 0;

    const selectedMedia = computed(() =>
        selectedMediaId.value ? (mediaById.value[selectedMediaId.value] ?? null) : null
    );

    const episodesById = computed(() => {
        const episodes: Record<number, Episode[]> = {};
        for (const [key, data] of Object.entries(anizipById.value)) {
            const id = Number(key);
            const streaming = streamingById.value[id];
            const normalized = normalizeEpisodes(data, streaming);
            episodes[id] = normalized.length
                ? padToTotal(id, applySchedule(normalized, airingById.value[id] ?? []))
                : fallbackEpisodes(id, streaming);
        }
        return episodes;
    });

    // Episodes past AniZip's list have no date, unless the show has finished airing
    function padToTotal(id: number, episodes: Episode[]): Episode[] {
        const media = mediaFor(id);
        if (!media?.episodes) return episodes;
        const released = media.status === 'FINISHED' ? releaseDate(media.startDate) : null;
        return padEpisodes(episodes, media.episodes, released);
    }

    // While AniList doesn't know the total, the airing schedule tells how many are planned
    function fallbackEpisodes(id: number, streaming?: StreamingEpisode[]): Episode[] {
        const media = mediaFor(id);
        const airing = airingById.value[id];
        if (!media || !airing) return [];
        const count = media.episodes ?? Math.max(0, ...airing.map((a) => a.episode));
        return placeholderEpisodes(count, airing, releaseDate(media.startDate), streaming);
    }

    function rememberMedia(item: Media) {
        mediaById.value = { ...mediaById.value, [item.id]: item };
    }

    // Fills in media known only from lighter queries without replacing fuller copies
    function rememberMissing(items: Media[]) {
        const missing = items.filter((item) => !(item.id in mediaById.value));
        if (!missing.length) return;
        mediaById.value = {
            ...mediaById.value,
            ...Object.fromEntries(missing.map((item) => [item.id, item])),
        };
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

    function detailsFor(id: number) {
        return detailsById.value[id] ?? null;
    }

    function mappingsFor(id: number) {
        return anizipById.value[id]?.mappings ?? null;
    }

    const logos = ref<Record<number, string | null>>({});

    const logoFor = (id: number) => logos.value[id] ?? null;

    async function fetchLogo(id: number) {
        if (id in logos.value) return;
        logos.value = { ...logos.value, [id]: null };
        const logo = await window.api.metadata.logo(id).catch(() => null);
        logos.value = { ...logos.value, [id]: logo };
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

    function applyMedia(id: number, media: AnimeData) {
        rememberMedia(media as Media);
        const details = mediaDetails(media);
        detailsById.value = { ...detailsById.value, [id]: details };
        rememberMissing([...details.related.map((r) => r.media), ...details.recommendations]);
        streamingById.value = {
            ...streamingById.value,
            [id]: (media.streamingEpisodes ?? []).flatMap((e) => (e ? [e] : [])),
        };
        airingById.value = {
            ...airingById.value,
            [id]: (media.airingSchedule?.nodes ?? []).flatMap((e) => (e ? [e] : [])),
        };
        logMapping(id);
        logStreaming(id);
    }

    function applyEpisodes(id: number, data: AniZipResponse | null) {
        anizipById.value = { ...anizipById.value, [id]: data };
        logMapping(id);
        logStreaming(id);
    }

    function logStreaming(id: number) {
        const streaming = streamingById.value[id];
        const data = anizipById.value[id];
        if (!streaming?.length || !data || loggedStreaming.has(id)) return;
        loggedStreaming.add(id);

        const match = matchStreaming(normalizeEpisodes(data), streaming);
        if (match) {
            log.debug(
                `AniList ${id} uses ${match.byKey.size}/${streaming.length} streaming episodes,`,
                `matched by ${match.scheme}`
            );
        } else {
            log.info(
                `AniList ${id} ignores ${streaming.length} streaming episodes,`,
                "they don't line up with its episodes"
            );
        }
    }

    // Episode numbers come from AniZip, so a wrong mapping or a count that differs from AniList's
    // means playback would line up with the wrong AniList episode. While a show airs, AniZip only
    // lists aired episodes, so fewer than AniList's total is expected.
    function logMapping(id: number) {
        const media = mediaFor(id);
        if (!media || !(id in anizipById.value) || loggedMappings.has(id)) return;
        loggedMappings.add(id);

        const data = anizipById.value[id];
        const name = `AniList ${id} "${mediaTitle(media)}"`;
        if (!data) return log.warn(`${name} has no AniZip data, using AniList's episode count`);

        const { anilist_id, anidb_id, thetvdb_id, mal_id } = data.mappings;
        const episodeCount = data.episodeCount ?? 0;
        log.info(
            `${name} maps to AniDB ${anidb_id}, TVDB ${thetvdb_id}, MAL ${mal_id};`,
            `${episodeCount} episodes, AniList has ${media.episodes ?? 'unknown'}`
        );
        if (!episodeCount)
            log.warn(`${name} has no AniZip episodes, using AniList's episode count`);
        if (anilist_id !== id) log.warn(`${name} got AniZip data for AniList ${anilist_id}`);
        if (media.idMal && mal_id && media.idMal !== mal_id) {
            log.warn(`${name} has MAL ${media.idMal} but AniZip maps it to MAL ${mal_id}`);
        }
        const finished = media.status === 'FINISHED';
        if (
            media.episodes &&
            episodeCount &&
            (episodeCount > media.episodes || (finished && episodeCount !== media.episodes))
        ) {
            log.warn(
                `${name} has ${media.episodes} episodes but AniZip lists ${episodeCount},`,
                'episode numbers may be offset'
            );
        }
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
        rememberMissing,
        setSelectedMedia,
        mediaFor,
        episodesFor,
        detailsFor,
        mappingsFor,
        logoFor,
        fetchLogo,
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
