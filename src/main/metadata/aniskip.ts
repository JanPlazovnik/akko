import type { Chapter } from '../../shared/ipc/api';
import { cached } from '../cache';
import { fetchAniZipEpisodes } from './anizip';

const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAPPINGS_MAX_AGE_MS = 6 * 60 * 60 * 1000;

// Mixed openings and endings play over the episode, so skipping them would skip story
const TITLES = { op: 'Opening', ed: 'Ending', recap: 'Recap' } as const;

type SkipType = keyof typeof TITLES;
type AniSkipResponse = {
    found: boolean;
    results: { skipType: SkipType; interval: { startTime: number; endTime: number } }[];
};

// Submissions are timed against one release, so the duration filters out other cuts
export async function fetchSkipTimes(
    anilistId: number,
    episode: number,
    duration: number
): Promise<Chapter[]> {
    const { data: anizip } = await fetchAniZipEpisodes(anilistId, MAPPINGS_MAX_AGE_MS);
    const malId = anizip?.mappings?.mal_id;
    if (!malId) return [];

    const length = Math.round(duration);
    const { data } = await cached(`aniskip:${malId}:${episode}:${length}`, MAX_AGE_MS, async () => {
        const types = Object.keys(TITLES)
            .map((t) => `types[]=${t}`)
            .join('&');
        const res = await fetch(
            `https://api.aniskip.com/v2/skip-times/${malId}/${episode}?${types}&episodeLength=${length}`
        );
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`AniSkip request failed (${res.status})`);
        return (await res.json()) as AniSkipResponse;
    });
    if (!data?.found) return [];

    return data.results
        .filter((r, i, all) => all.findIndex((o) => o.skipType === r.skipType) === i)
        .map((r) => ({
            start: r.interval.startTime,
            end: r.interval.endTime,
            title: TITLES[r.skipType],
        }))
        .sort((a, b) => a.start - b.start);
}
