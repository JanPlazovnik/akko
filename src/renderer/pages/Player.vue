<script setup lang="ts">
import { onUnmounted } from 'vue';
import { usePlayerStore } from '../stores/player';

const player = usePlayerStore();

onUnmounted(() => player.stopStream());
</script>

<template>
    <div class="min-h-screen bg-black flex items-center justify-center">
        <video
            v-if="player.streamUrl"
            :src="player.streamUrl"
            controls
            autoplay
            class="w-full h-screen"
        />
        <p v-else class="text-white/30 text-sm">Nothing playing</p>
    </div>
</template>
