<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { toast } from 'vue3-toastify';
import { useAnilistStore } from '../stores/anilist';
import { useLoadingStore } from '../stores/loading';
import HeroBanner from '../components/HeroBanner.vue';
import MediaRow from '../components/MediaRow.vue';

const anilist = useAnilistStore();
const loadingBar = useLoadingStore();

onMounted(async () => {
    loadingBar.start();
    await anilist.fetchDashboard();
    loadingBar.finish();
});

watch(
    () => anilist.dashboardError,
    (err) => err && toast.error(err.message)
);

const nonNull = <T,>(arr: (T | null)[] | null | undefined) =>
    (arr ?? []).filter((x): x is T => x !== null);

const trending = computed(() => nonNull(anilist.dashboard?.trending?.media));
const season = computed(() => nonNull(anilist.dashboard?.season?.media));
const popular = computed(() => nonNull(anilist.dashboard?.popular?.media));
</script>

<template>
    <div class="min-h-full bg-neutral-900 text-white pb-12">
        <div
            v-if="anilist.dashboardLoading"
            class="flex items-center justify-center h-64 text-white/40 text-sm"
        >
            Loading...
        </div>
        <template v-else>
            <HeroBanner :items="trending.slice(0, 6)" />
            <MediaRow title="Trending" :items="trending" />
            <MediaRow title="This Season" :items="season" />
            <MediaRow title="Popular" :items="popular" />
        </template>
    </div>
</template>
