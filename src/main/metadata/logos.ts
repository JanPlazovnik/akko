import { cached } from '../cache';

// Our own API (see api/), which keeps the TMDB token out of the app
const API_URL = 'https://api.akko.odstrani.se';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export async function fetchLogo(anilistId: number): Promise<string | null> {
    // Wrapped so shows without a logo are cached too
    const { data } = await cached(`logo:${anilistId}`, MAX_AGE_MS, async () => {
        const res = await fetch(`${API_URL}/logo?anilist_id=${anilistId}`);
        if (!res.ok) throw new Error(`Logo request failed (${res.status})`);
        return (await res.json()) as { logo: string | null };
    });
    return data?.logo ?? null;
}
