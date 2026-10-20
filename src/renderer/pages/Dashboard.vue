<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { toast } from '../lib/toast';
import { useMediaStore } from '../stores/media';
import { useLoadingStore } from '../stores/loading';
import { useProgressStore, type ContinueItem } from '../stores/progress';
import type { PickerContext } from '../stores/player';
import HeroBanner from '../components/HeroBanner.vue';
import MediaRow from '../components/MediaRow.vue';
import TorrentPickerDialog from '../components/TorrentPickerDialog.vue';

const mediaStore = useMediaStore();
const loadingBar = useLoadingStore();
const progress = useProgressStore();

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
const continueById = computed(
    () => new Map(progress.continueItems.map((item) => [item.media.id, item]))
);
const continueWatching = computed(() => progress.continueItems.map((item) => item.media));

const picker = ref<PickerContext | null>(null);
const pickerOpen = ref(false);

// Resumes the release that was playing, or searches for the next episode
async function play(item: ContinueItem) {
    if (item.record) return progress.resume(item.media, item.record);
    const context = await progress.contextFor(item.media, item.episode);
    if (!context) return mediaStore.viewMedia(item.media);
    picker.value = context;
    pickerOpen.value = true;
}
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
            <MediaRow
                v-if="continueWatching.length"
                title="Continue watching"
                :items="continueWatching"
                :continue-items="continueById"
                @play="play"
            />
            <MediaRow title="Trending now" :items="trending" />
            <MediaRow title="Airing this season" :items="season" />
            <MediaRow title="All-time popular" :items="popular" />
        </template>
    </div>
    <TorrentPickerDialog v-if="picker" v-model:open="pickerOpen" v-bind="picker" />
</template>
