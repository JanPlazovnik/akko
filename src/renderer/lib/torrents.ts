import type { Media } from '@shared/graphql/queries';
import { episodeToSummary, type MediaSummary, type WatchSelection } from '@shared/media/types';
import type { SearchParams, TorrentResult } from '../../main/extensions/types';
import type { PickerContext } from '../stores/player';

export function parseTitle(title: string) {
    const group = title.match(/^\[([^\]]+)\]\s*/);
    return {
        group: group?.[1] ?? null,
        name: group ? title.slice(group[0].length) : title,
        resolution: title.match(/\b(\d{3,4})p\b/)?.[1] ?? null,
    };
}

// Sources return a magnet, a .torrent URL (which WebTorrent downloads itself) or a bare info hash
export function torrentId(link: string, hash: string): string {
    if (link.startsWith('magnet:') || /^https?:\/\//.test(link)) return link;
    return `magnet:?xt=urn:btih:${link || hash}`;
}

export function searchParams(
    context: PickerContext,
    media: Media | null,
    resolution: string
): SearchParams {
    const { episode, mappings } = context;
    return {
        media: media ? JSON.parse(JSON.stringify(media)) : undefined,
        anilistId: context.anilistId,
        anidbEid: episode.anidbEid?.toString() ?? undefined,
        anidbAid: mappings?.anidb_id?.toString() ?? undefined,
        tvdbId: mappings?.thetvdb_id ?? undefined,
        tvdbEId: episode.tvdbId ?? undefined,
        tmdbId: mappings?.themoviedb_id?.toString() ?? undefined,
        imdbId: mappings?.imdb_id ?? undefined,
        titles: context.titles,
        episode: episode.absoluteNumber ?? episode.number,
        episodeCount: context.episodeCount ?? undefined,
        resolution,
        exclusions: [],
    };
}

export function selectionFor(
    media: MediaSummary,
    context: PickerContext,
    result: TorrentResult
): WatchSelection {
    return {
        media,
        episode: episodeToSummary(context.episode),
        torrent: {
            title: result.title,
            infoHash: result.hash || undefined,
            magnet: torrentId(result.link, result.hash),
        },
    };
}

const UNSUPPORTED_AUDIO = /(?:^|[^a-z])(?:DTS|TrueHD)/i;
const HEALTHY_SEEDERS = 10;

export const hasUnsupportedAudio = (result: TorrentResult) => UNSUPPORTED_AUDIO.test(result.title);

const sameGroup = (title: string, group: string) =>
    parseTitle(title).group?.toLowerCase() === group.toLowerCase();

// Earlier criteria win. Low accuracy is never picked on its own.
export function topPick(results: TorrentResult[], preferredGroup: string | null) {
    const criteria = (result: TorrentResult) => [
        hasUnsupportedAudio(result),
        !(preferredGroup && sameGroup(result.title, preferredGroup)),
        result.type !== 'best' && result.type !== 'alt',
        result.seeders < HEALTHY_SEEDERS,
        result.accuracy !== 'high',
    ];
    const ranked = results
        .filter((result) => result.accuracy !== 'low')
        .map((result) => ({ result, criteria: criteria(result) }))
        .sort((a, b) => {
            const index = a.criteria.findIndex((value, i) => value !== b.criteria[i]);
            if (index !== -1) return Number(a.criteria[index]) - Number(b.criteria[index]);
            return b.result.seeders - a.result.seeders;
        });
    return ranked[0]?.result ?? null;
}

// The show's name without the group, tags, episode number and extension
function releaseName(title: string) {
    return parseTitle(title)
        .name.replace(/\[[^\]]*\]|\([^)]*\)|\.\w{2,4}$/g, ' ')
        .replace(/[^a-z]+/gi, ' ')
        .trim()
        .toLowerCase();
}

// Another episode from the same group in the same resolution, preferring identically named ones
export function matchRelease(current: string, results: TorrentResult[]): TorrentResult | null {
    const { group, resolution } = parseTitle(current);
    if (!group) return null;
    const name = releaseName(current);
    const candidates = results.filter((result) => {
        const parsed = parseTitle(result.title);
        return (
            result.accuracy !== 'low' &&
            parsed.group?.toLowerCase() === group.toLowerCase() &&
            parsed.resolution === resolution
        );
    });
    return (
        candidates.sort(
            (a, b) =>
                Number(releaseName(b.title) === name) - Number(releaseName(a.title) === name) ||
                b.seeders - a.seeders
        )[0] ?? null
    );
}
