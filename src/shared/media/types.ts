import type { Episode } from '../anizip/types';
import type { Media } from '../graphql/queries';

export type MediaSummary = {
    anilistId: number;
    title: string;
    coverImage?: string | null;
    bannerImage?: string | null;
    format?: string | null;
    episodeCount?: number | null;
};

export type EpisodeSummary = {
    key: string;
    number: number;
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
        number: episode.absoluteNumber ?? episode.number,
        title: episode.title,
        thumbnail: episode.image,
        airDate: episode.airDate,
        source: 'anizip',
    };
}
