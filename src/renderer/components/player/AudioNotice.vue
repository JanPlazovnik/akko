<script setup lang="ts">
import { computed } from 'vue';
import { usePlayerStore } from '../../stores/player';

const player = usePlayerStore();

const codecs = computed(() => [...new Set(player.audioTracks.map((t) => t.codec))].join('/'));

function chooseAnother() {
    if (document.fullscreenElement) void document.exitFullscreen();
    player.pickerOpen = true;
}
</script>

<template>
    <p v-if="player.unsupportedAudio" class="text-sm text-amber-200/90">
        No sound, {{ codecs }} audio
        {{ player.audioBridgeFailed ? "couldn't be loaded" : "isn't supported" }}.
        <button
            v-if="player.pickerContext"
            class="cursor-pointer text-white/80 underline decoration-white/30 underline-offset-4 transition-colors hover:text-white hover:decoration-white"
            @click="chooseAnother"
        >
            Pick another release
        </button>
    </p>
</template>
