import type { AniZipResponse } from '../../shared/anizip/types';
import type { CachedResult } from '../../shared/ipc/api';
import { cached } from '../cache';

export function fetchAniZipEpisodes(
    anilistId: number,
    maxAge: number
): Promise<CachedResult<AniZipResponse | null>> {
    return cached(`anizip:${anilistId}`, maxAge, async () => {
        const res = await fetch(`https://api.ani.zip/v1/episodes?anilist_id=${anilistId}`);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`AniZip request failed (${res.status})`);
        return (await res.json()) as AniZipResponse;
    });
}
