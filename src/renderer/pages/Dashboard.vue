<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { toast } from 'vue3-toastify';
import { useMediaStore } from '../stores/media';
import { useLoadingStore } from '../stores/loading';
import HeroBanner from '../components/HeroBanner.vue';
import MediaRow from '../components/MediaRow.vue';

const mediaStore = useMediaStore();
const loadingBar = useLoadingStore();

onMounted(async () => {
    loadingBar.start();
    await mediaStore.fetchDashboard();
    loadingBar.finish();
});

watch(
    () => mediaStore.dashboardError,
    (err) => err && toast.error(err.message)
);

const nonNull = <T,>(arr: (T | null)[] | null | undefined) =>
    (arr ?? []).filter((x): x is T => x !== null);

const trending = computed(() => nonNull(mediaStore.dashboard?.trending?.media));
const season = computed(() => nonNull(mediaStore.dashboard?.season?.media));
const popular = computed(() => nonNull(mediaStore.dashboard?.popular?.media));
</script>

<template>
    <div class="min-h-full bg-neutral-900 text-white pb-12">
        <div
            v-if="mediaStore.dashboardLoading"
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
