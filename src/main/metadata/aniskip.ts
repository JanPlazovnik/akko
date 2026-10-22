import type { Chapter } from '../../shared/ipc/api';
import { cached } from '../cache';
import { fetchAniZipEpisodes } from './anizip';

const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAPPINGS_MAX_AGE_MS = 6 * 60 * 60 * 1000;

// An opening this close to the start isn't behind a cold open, so it sits at the same time each week
const COLD_OPEN_SECONDS = 5;

// Mixed openings and endings play over the episode, so skipping them would skip story
const TITLES = { op: 'Opening', ed: 'Ending', recap: 'Recap' } as const;

type SkipType = keyof typeof TITLES;
type SkipResult = {
    skipType: SkipType;
    interval: { startTime: number; endTime: number };
    episodeLength: number;
};
type AniSkipResponse = { found: boolean; results: SkipResult[] };

// Submissions are timed against one release, so the duration filters out other cuts
async function querySkipTimes(malId: number, episode: number, length: number) {
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
    const byType = new Map<SkipType, SkipResult>();
    for (const result of data?.found ? data.results : []) {
        if (!byType.has(result.skipType)) byType.set(result.skipType, result);
    }
    return byType;
}

// New episodes take a while to get submissions, so borrow the previous episode's ending, which
// sits the same distance from the end each week, and its opening when nothing comes before it
function borrowFromPrevious(previous: Map<SkipType, SkipResult>, length: number) {
    const borrowed = new Map<SkipType, SkipResult>();
    const op = previous.get('op');
    if (op && op.interval.startTime <= COLD_OPEN_SECONDS) borrowed.set('op', op);
    const ed = previous.get('ed');
    if (ed) {
        const shift = length - ed.episodeLength;
        borrowed.set('ed', {
            ...ed,
            interval: {
                startTime: ed.interval.startTime + shift,
                endTime: Math.min(ed.interval.endTime + shift, length),
            },
        });
    }
    return borrowed;
}

export async function fetchSkipTimes(
    anilistId: number,
    episode: number,
    duration: number
): Promise<Chapter[]> {
    const { data: anizip } = await fetchAniZipEpisodes(anilistId, MAPPINGS_MAX_AGE_MS);
    const malId = anizip?.mappings?.mal_id;
    if (!malId) return [];

    const length = Math.round(duration);
    const times = await querySkipTimes(malId, episode, length);
    if (episode > 1 && !(times.has('op') && times.has('ed'))) {
        const previous = await querySkipTimes(malId, episode - 1, length);
        for (const [type, result] of borrowFromPrevious(previous, length)) {
            if (!times.has(type)) times.set(type, result);
        }
    }

    return [...times.values()]
        .map((r) => ({
            start: r.interval.startTime,
            end: r.interval.endTime,
            title: TITLES[r.skipType],
        }))
        .sort((a, b) => a.start - b.start);
}
