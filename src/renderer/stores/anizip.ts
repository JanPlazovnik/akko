import { defineStore } from 'pinia';
import { ref } from 'vue';
import { fetchEpisodes } from '../lib/anizip-client';
import type { AniZipEpisode } from '@shared/anizip/types';

export type { AniZipEpisode };

export const useAnizipStore = defineStore('anizip', () => {
    const episodes = ref<AniZipEpisode[]>([]);
    const loading = ref(false);
    const error = ref<Error | null>(null);
    let currentId: number | null = null;

    async function fetchForMedia(anilistId: number) {
        if (currentId === anilistId && episodes.value.length) return;

        loading.value = true;
        error.value = null;
        episodes.value = [];
        currentId = anilistId;

        try {
            const data = await fetchEpisodes(anilistId);
            const seen = new Set<number | null>();
            episodes.value = Object.entries(data.episodes)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([, ep]) => ep)
                .filter((ep) => {
                    if (ep.isSpecial) return false;
                    if (ep.tvdbId !== null && seen.has(ep.tvdbId)) return false;
                    seen.add(ep.tvdbId);
                    return true;
                });
        } catch (err) {
            error.value = err as Error;
            currentId = null;
        } finally {
            loading.value = false;
        }
    }

    function clear() {
        episodes.value = [];
        error.value = null;
        currentId = null;
    }

    return { episodes, loading, error, fetchForMedia, clear };
});
