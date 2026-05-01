import { defineStore } from 'pinia';
import { ref } from 'vue';
import { anilistClient } from '../lib/anilist-client';
import { ResultOf, VariablesOf } from '@shared/graphql/graphql';
import { DashboardQuery } from '@shared/graphql/queries';

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

    return {
        dashboard,
        dashboardLoading,
        dashboardError,
        fetchDashboard,
    };
});
