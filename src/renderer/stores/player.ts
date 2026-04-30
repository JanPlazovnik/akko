import { defineStore } from 'pinia';
import { ref } from 'vue';

export const usePlayerStore = defineStore('player', () => {
    const torrentId = ref<string | null>(null);
    const streamUrl = ref<string | null>(null);
    const isPlaying = ref(false);
    const progress = ref(0);

    async function startStream(magnet: string) {
        const result = await window.api.startStream(magnet);
        torrentId.value = result.torrentId;
        streamUrl.value = result.streamUrl;
    }

    async function stopStream() {
        if (!torrentId.value) return;
        await window.api.stopStream(torrentId.value);
        torrentId.value = null;
        streamUrl.value = null;
        isPlaying.value = false;
    }

    return { torrentId, streamUrl, isPlaying, progress, startStream, stopStream };
});
