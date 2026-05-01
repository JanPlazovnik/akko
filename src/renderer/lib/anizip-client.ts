import type { AniZipResponse } from '@shared/anizip/types';

const DEFAULT_TTL_MS = 1000 * 60 * 10;

interface CacheEntry {
    data: AniZipResponse;
    expiresAt: number;
}

const cache = new Map<number, CacheEntry>();

export async function fetchEpisodes(anilistId: number): Promise<AniZipResponse> {
    const cached = cache.get(anilistId);
    if (cached && Date.now() < cached.expiresAt) return cached.data;

    const res = await fetch(`https://api.ani.zip/v1/episodes?anilist_id=${anilistId}`);
    if (!res.ok) throw new Error(`AniZip ${res.status}: ${res.statusText}`);

    const data: AniZipResponse = await res.json();
    cache.set(anilistId, { data, expiresAt: Date.now() + DEFAULT_TTL_MS });
    return data;
}
