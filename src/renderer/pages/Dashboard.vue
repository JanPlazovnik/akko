<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useAnilistStore } from '../stores/anilist';
import HeroBanner from '../components/HeroBanner.vue';
import MediaRow from '../components/MediaRow.vue';

const anilist = useAnilistStore();
onMounted(() => anilist.fetchDashboard());

const trending = computed(() => anilist.dashboard?.trending?.media ?? []);
const season = computed(() => anilist.dashboard?.season?.media ?? []);
const popular = computed(() => anilist.dashboard?.popular?.media ?? []);
</script>

<template>
    <div class="min-h-full bg-neutral-900 text-white pb-12">
        <div
            v-if="anilist.dashboardLoading"
            class="flex items-center justify-center h-64 text-white/40 text-sm"
        >
            Loading...
        </div>
        <div
            v-else-if="anilist.dashboardError"
            class="flex items-center justify-center h-64 text-red-400 text-sm"
        >
            {{ anilist.dashboardError.message }}
        </div>
        <template v-else>
            <HeroBanner :items="trending.slice(0, 6)" />
            <MediaRow title="Trending" :items="trending" />
            <MediaRow title="This Season" :items="season" />
            <MediaRow title="Popular" :items="popular" />
        </template>
    </div>
</template>
