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
    <div class="min-h-full pb-16">
        <template v-if="mediaStore.dashboardLoading && !trending.length">
            <div class="h-[min(68vh,620px)] min-h-[440px] animate-pulse bg-raised/60" />
            <div v-for="row in 2" :key="row" class="px-8 pt-8">
                <div class="mb-3 h-5 w-36 animate-pulse rounded bg-raised" />
                <div class="flex gap-4 overflow-hidden">
                    <div
                        v-for="i in 8"
                        :key="i"
                        class="aspect-2/3 w-[168px] shrink-0 animate-pulse rounded-xl bg-raised"
                    />
                </div>
            </div>
        </template>
        <template v-else>
            <HeroBanner :items="trending.slice(0, 6)" />
            <MediaRow title="Trending now" :items="trending" />
            <MediaRow title="Airing this season" :items="season" />
            <MediaRow title="All-time popular" :items="popular" />
        </template>
    </div>
</template>
