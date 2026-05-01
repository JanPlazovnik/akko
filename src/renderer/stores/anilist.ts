import { defineStore } from 'pinia';
import { ref } from 'vue';
import { anilistClient } from '../lib/anilist-client';
import { ResultOf, VariablesOf } from '@shared/graphql/graphql';
import { DashboardQuery, GetAnimeQuery } from '@shared/graphql/queries';
import type { Media } from '@shared/graphql/queries';
import router from '../router';

type DashboardData = ResultOf<typeof DashboardQuery>;

function getCurrentSeason(): VariablesOf<typeof DashboardQuery> {
    const month = new Date().getMonth() + 1;
    const year = new Date().getFullYear();
    const season = month <= 3 ? 'WINTER' : month <= 6 ? 'SPRING' : month <= 9 ? 'SUMMER' : 'FALL';
    const seasons = ['WINTER', 'SPRING', 'SUMMER', 'FALL'] as const;
    const nextSeason = seasons[(seasons.indexOf(season) + 1) % 4];
    return { season, seasonYear: year };
}

export const useAnilistStore = defineStore('anilist', () => {
    const dashboard = ref<DashboardData | null>(null);
    const dashboardLoading = ref(false);
    const dashboardError = ref<Error | null>(null);
    const selectedMedia = ref<Media | null>(null);

    async function fetchDashboard() {
        if (dashboardLoading.value) return;
        dashboardLoading.value = true;
        dashboardError.value = null;

        try {
            const { data } = await anilistClient.query(
                DashboardQuery,
                getCurrentSeason(),
                'dashboard'
            );
            dashboard.value = data;
        } catch (err) {
            dashboardError.value = err as Error;
        } finally {
            dashboardLoading.value = false;
        }
    }

    async function fetchMedia(id: number): Promise<void> {
        const { data } = await anilistClient.query(GetAnimeQuery, { id }, `media-${id}`);
        if (data?.Media) selectedMedia.value = data.Media as Media;
    }

    function viewMedia(item: Media) {
        selectedMedia.value = item;
        router.push(`/media/${item.id}`);
    }

    return {
        dashboard,
        dashboardLoading,
        dashboardError,
        selectedMedia,
        fetchDashboard,
        fetchMedia,
        viewMedia,
    };
});
