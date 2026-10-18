import type { Episode, EpisodeNumbers } from '../anizip/types';
import type { Media } from '../graphql/queries';

export type MediaSummary = {
    anilistId: number;
    title: string;
    coverImage?: string | null;
    bannerImage?: string | null;
    format?: string | null;
    episodeCount?: number | null;
};

export type EpisodeSummary = EpisodeNumbers & {
    key: string;
    title?: string | null;
    thumbnail?: string | null;
    airDate?: string | null;
    source: 'anizip';
};

export type TorrentSelection = {
    title: string;
    magnet: string;
    infoHash?: string;
};

export type WatchSelection = {
    media: MediaSummary;
    episode: EpisodeSummary;
    torrent: TorrentSelection;
};

export type PlaybackActivity = WatchSelection & {
    playback: {
        currentTime: number;
        duration: number;
        isPlaying: boolean;
    };
};

export function mediaToSummary(media: Media): MediaSummary {
    return {
        anilistId: media.id,
        title:
            media.title?.userPreferred ??
            media.title?.english ??
            media.title?.romaji ??
            'Unknown title',
        coverImage: media.coverImage?.large,
        bannerImage: media.bannerImage,
        format: media.format,
        episodeCount: media.episodes,
    };
}

export function episodeToSummary(episode: Episode): EpisodeSummary {
    return {
        key: episode.key,
        number: episode.number,
        season: episode.season,
        seasonEpisode: episode.seasonEpisode,
        absoluteNumber: episode.absoluteNumber,
        title: episode.title,
        thumbnail: episode.image,
        airDate: episode.airDate,
        source: 'anizip',
    };
}

export function describeEpisode({ number, season, seasonEpisode, absoluteNumber }: EpisodeNumbers) {
    const aliases = [
        season !== null && seasonEpisode !== null && `S${season}E${seasonEpisode}`,
        absoluteNumber !== null && absoluteNumber !== number && `#${absoluteNumber}`,
    ].filter(Boolean);
    return `episode ${number}${aliases.length ? ` (${aliases.join(', ')})` : ''}`;
}
