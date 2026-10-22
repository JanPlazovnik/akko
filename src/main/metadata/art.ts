import { cached } from '../cache';
import type { ShowArt } from '../../shared/ipc/api';

// Our own API (see api/), which keeps the TMDB token out of the app
const API_URL = 'https://api.akko.odstrani.se';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const NO_ART: ShowArt = { logo: null, backdrop: null };

export async function fetchArt(anilistId: number): Promise<ShowArt> {
    // Wrapped so shows without art are cached too
    const { data } = await cached(`art:${anilistId}`, MAX_AGE_MS, async () => {
        const res = await fetch(`${API_URL}/art?anilist_id=${anilistId}`);
        if (!res.ok) throw new Error(`Art request failed (${res.status})`);
        return (await res.json()) as ShowArt;
    });
    return data ?? NO_ART;
}
