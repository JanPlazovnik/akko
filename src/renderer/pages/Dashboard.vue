<script setup lang="ts">
import { onMounted } from 'vue';
import { useAnilistStore } from '../stores/anilist';

const anilist = useAnilistStore();
onMounted(() => anilist.fetchDashboard());
</script>

<template>
    <div v-if="anilist.dashboardLoading">Loading...</div>
    <div v-else-if="anilist.dashboardError">Error: {{ anilist.dashboardError.message }}</div>
    <div v-else-if="anilist.dashboard">
        <pre>{{ anilist.dashboard }}</pre>
    </div>
</template>
