<script setup lang="ts">
import { usePlayerStore } from '../../stores/player';

defineProps<{ fallback?: string }>();

const player = usePlayerStore();
</script>

<template>
    <template v-if="player.episodeTitle">
        <span class="mr-1.5 tabular-nums opacity-50">E{{ player.episodeNumber }}</span>
        {{ player.episodeTitle }}
    </template>
    <template v-else-if="player.episodeNumber">Episode {{ player.episodeNumber }}</template>
    <template v-else>{{ fallback }}</template>
</template>
