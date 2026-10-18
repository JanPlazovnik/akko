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

export function normalizeEpisodes(
    data: AniZipResponse | null,
    streaming: StreamingEpisode[] = []
): Episode[] {
    if (!data) return [];

    const fromStreaming = new Map<number, { title: string | null; thumbnail: string | null }>();
    for (const item of streaming) {
        const match = item.title?.match(STREAMING_TITLE);
        if (match) {
            fromStreaming.set(Number(match[1]), {
                title: match[2] ?? null,
                thumbnail: item.thumbnail ?? null,
            });
        }
    }

    return Object.entries(data.episodes)
        .filter(([key]) => /^\d+$/.test(key))
        .map(([key, episode]) => {
            const number = Number(episode.episode || key);
            const streamed = fromStreaming.get(number);
            const title = episode.title;
            return {
                key,
                number,
                season: episode.seasonNumber ?? null,
                seasonEpisode: episode.episodeNumber ?? null,
                absoluteNumber: episode.absoluteEpisodeNumber ?? null,
                title: title?.en || title?.['x-jat'] || title?.ja || streamed?.title || null,
                overview: episode.overview ?? episode.summary ?? null,
                image: episode.image ?? streamed?.thumbnail ?? null,
                airDate: episode.airDate ?? episode.airdate ?? null,
                runtime: episode.runtime ?? episode.length ?? null,
                anidbEid: episode.anidbEid ?? null,
                tvdbId: episode.tvdbId ?? null,
            };
        })
        .sort((a, b) => a.number - b.number);
}
