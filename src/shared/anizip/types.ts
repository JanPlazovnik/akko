export interface AniZipEpisode {
    tvdbShowId: number | null;
    tvdbId: number | null;
    seasonNumber: number;
    episodeNumber: number;
    absoluteEpisodeNumber: number | null;
    title: Record<string, string | null>;
    airDate: string | null;
    airDateUtc: string | null;
    runtime: number | null;
    overview: string | null;
    summary: string | null | undefined;
    image: string | null;
    rating: string | null;
    length: number | null;
    episode: string;
    anidbEid: number | null;
    filename: string | null | undefined;
    isSpecial: boolean;
    specialType: string | null | undefined;
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
