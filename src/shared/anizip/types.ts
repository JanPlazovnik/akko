// Episodes with TVDB data carry the camelCase fields; AniDB-only episodes only have episode,
// anidbEid, length, airdate, rating and title. Use normalizeEpisodes rather than reading these.
export interface AniZipEpisode {
    episode: string;
    anidbEid?: number | null;
    title?: Record<string, string | null>;
    tvdbShowId?: number | null;
    tvdbId?: number | null;
    seasonNumber?: number;
    episodeNumber?: number;
    absoluteEpisodeNumber?: number | null;
    airDate?: string | null;
    airdate?: string | null;
    airDateUtc?: string | null;
    runtime?: number | null;
    length?: number | null;
    overview?: string | null;
    summary?: string | null;
    image?: string | null;
    rating?: string | null;
}

export interface AniZipMappings {
    animeplanet_id: string | null;
    kitsu_id: number | null;
    mal_id: number | null;
    type: string;
    anilist_id: number;
    anisearch_id: number | null;
    anidb_id: number | null;
    notifymoe_id: string | null;
    livechart_id: number | null;
    thetvdb_id: number | null;
    imdb_id: string | null;
    themoviedb_id: number | null;
}

export interface AniZipImage {
    coverType: string;
    url: string;
}

export interface AniZipResponse {
    titles: Record<string, string>;
    episodes: Record<string, AniZipEpisode>;
    episodeCount: number;
    specialCount: number;
    images: AniZipImage[];
    mappings: AniZipMappings;
}

export interface StreamingEpisode {
    title?: string | null;
    thumbnail?: string | null;
}

export interface AiringEpisode {
    episode: number;
    airingAt: number;
}

// number is AniDB's, which splits seasons the same way AniList does, so it lines up with list
// progress. season and seasonEpisode are TVDB's, which often continues numbering across cours.
export interface EpisodeNumbers {
    number: number;
    season: number | null;
    seasonEpisode: number | null;
    absoluteNumber: number | null;
}

export interface Episode extends EpisodeNumbers {
    key: string;
    title: string | null;
    overview: string | null;
    image: string | null;
    airDate: string | null;
    runtime: number | null;
    anidbEid: number | null;
    tvdbId: number | null;
}

const STREAMING_TITLE = /^Episode (\d+)(?:\s*-\s*(.+))?$/i;

type Streamed = { title: string | null; thumbnail: string | null };

export type StreamingMatch = {
    scheme: 'number' | 'absoluteNumber';
    byKey: Map<string, Streamed>;
};

function words(title: string): Set<string> {
    return new Set(
        title
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s]/gu, '')
            .split(/\s+/)
            .filter(Boolean)
    );
}

function similarTitles(a: string, b: string): boolean {
    const x = words(a);
    const y = words(b);
    const shared = [...x].filter((word) => y.has(word)).length;
    return shared / Math.min(x.size, y.size) >= 0.5;
}

// AniList often attaches the whole series' Crunchyroll list to every season, numbered from the
// first season or across all of them. Only use it when it lines up with AniZip's episodes: most
// titles agree, or with no titles to compare, every streamed episode lands on one of ours.
export function matchStreaming(
    episodes: Episode[],
    streaming: StreamingEpisode[]
): StreamingMatch | null {
    const byNumber = new Map<number, Streamed>();
    for (const item of streaming) {
        const match = item.title?.match(STREAMING_TITLE);
        if (match) {
            byNumber.set(Number(match[1]), {
                title: match[2] ?? null,
                thumbnail: item.thumbnail ?? null,
            });
        }
    }
    if (byNumber.size === 0) return null;

    for (const scheme of ['number', 'absoluteNumber'] as const) {
        const byKey = new Map<string, Streamed>();
        let compared = 0;
        let agreed = 0;
        for (const episode of episodes) {
            const number = episode[scheme];
            const streamed = number === null ? undefined : byNumber.get(number);
            if (!streamed) continue;
            byKey.set(episode.key, streamed);
            if (episode.title && streamed.title) {
                compared++;
                if (similarTitles(episode.title, streamed.title)) agreed++;
            }
        }
        const fits = compared > 0 ? agreed * 2 > compared : byKey.size === byNumber.size;
        if (byKey.size > 0 && fits) return { scheme, byKey };
    }
    return null;
}

function withStreaming(episodes: Episode[], streaming: StreamingEpisode[]): Episode[] {
    const streamed = matchStreaming(episodes, streaming)?.byKey;
    if (!streamed) return episodes;
    return episodes.map((episode) => {
        const extra = streamed.get(episode.key);
        if (!extra) return episode;
        return {
            ...episode,
            title: episode.title ?? extra.title,
            image: episode.image ?? extra.thumbnail,
        };
    });
}

function blankEpisode(number: number, airDate: string | null): Episode {
    return {
        key: String(number),
        number,
        season: null,
        seasonEpisode: null,
        absoluteNumber: null,
        title: null,
        overview: null,
        image: null,
        airDate,
        runtime: null,
        anidbEid: null,
        tvdbId: null,
    };
}

const scheduleDates = (airing: AiringEpisode[]) =>
    new Map(
        airing.map(({ episode, airingAt }) => [episode, new Date(airingAt * 1000).toISOString()])
    );

// AniZip has nothing for some shows (often ONAs and brand-new seasons), so fall back to AniList's
// episode count and airing schedule. Without a schedule, everything counts as out since release.
export function placeholderEpisodes(
    count: number,
    airing: AiringEpisode[],
    released: string | null,
    streaming: StreamingEpisode[] = []
): Episode[] {
    const airDates = scheduleDates(airing);
    const episodes = Array.from({ length: count }, (_, i) =>
        blankEpisode(i + 1, airDates.get(i + 1) ?? released)
    );
    return withStreaming(episodes, streaming);
}

// AniList's schedule follows delays and drives its own countdown, while AniZip's dates can lag
// days behind and it only lists a few episodes ahead, so the schedule wins and fills the gaps
export function applySchedule(episodes: Episode[], airing: AiringEpisode[]): Episode[] {
    if (!airing.length) return episodes;
    const airDates = scheduleDates(airing);
    const known = new Set(episodes.map((episode) => episode.number));
    const scheduled = episodes.map((episode) => {
        const airDate = airDates.get(episode.number);
        return airDate ? { ...episode, airDate } : episode;
    });
    const missing = [...airDates]
        .filter(([number]) => !known.has(number))
        .map(([number, airDate]) => blankEpisode(number, airDate));
    return [...scheduled, ...missing].sort((a, b) => a.number - b.number);
}

export function normalizeEpisodes(
    data: AniZipResponse | null,
    streaming: StreamingEpisode[] = []
): Episode[] {
    if (!data) return [];

    const episodes = Object.entries(data.episodes)
        .filter(([key]) => /^\d+$/.test(key))
        .map(([key, episode]) => {
            const title = episode.title;
            return {
                key,
                number: Number(episode.episode || key),
                season: episode.seasonNumber ?? null,
                seasonEpisode: episode.episodeNumber ?? null,
                absoluteNumber: episode.absoluteEpisodeNumber ?? null,
                title: title?.en || title?.['x-jat'] || title?.ja || null,
                overview: episode.overview ?? episode.summary ?? null,
                image: episode.image ?? null,
                airDate: episode.airDateUtc ?? episode.airDate ?? episode.airdate ?? null,
                runtime: episode.runtime ?? episode.length ?? null,
                anidbEid: episode.anidbEid ?? null,
                tvdbId: episode.tvdbId ?? null,
            };
        })
        .sort((a, b) => a.number - b.number);
    return withStreaming(episodes, streaming);
}
