import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export type SubtitleTrack = {
    lang: string;
    label: string;
    blobUrl: string;
};

export const usePlayerStore = defineStore('player', () => {
    const torrentId = ref<string | null>(null);
    const streamUrl = ref<string | null>(null);
    const mimeType = ref<string>('video/mp4');

    const isPlaying = ref(false);
    const currentTime = ref(0);
    const duration = ref(0);

    const subtitles = ref<SubtitleTrack[]>([]);
    const activeSubtitle = ref<string | null>(null);

    const progress = computed(() => {
        if (!duration.value) return 0;
        return currentTime.value / duration.value;
    });

    function createSubtitleBlobUrls(
        tracks: { lang: string; label: string; content: string }[]
    ): SubtitleTrack[] {
        revokeSubtitleBlobUrls();
        return tracks.map((t) => ({
            lang: t.lang,
            label: t.label,
            blobUrl: URL.createObjectURL(new Blob([t.content], { type: 'text/vtt' })),
        }));
    }

    function revokeSubtitleBlobUrls() {
        subtitles.value.forEach((t) => URL.revokeObjectURL(t.blobUrl));
    }

    async function startStream(magnet: string) {
        window.api.onSubtitles((incoming) => {
            subtitles.value = createSubtitleBlobUrls(incoming);
            if (!activeSubtitle.value && subtitles.value.length > 0) {
                activeSubtitle.value = subtitles.value[0].lang;
            }
        });

        const result = await window.api.startStream(magnet);

        torrentId.value = result.torrentId;
        streamUrl.value = result.streamUrl;
        mimeType.value = result.mimeType;
        currentTime.value = 0;
        duration.value = 0;
        isPlaying.value = false;
    }

    async function stopStream() {
        if (!torrentId.value) return;

        window.api.offSubtitles();
        await window.api.stopStream(torrentId.value);

        revokeSubtitleBlobUrls();

        torrentId.value = null;
        streamUrl.value = null;
        mimeType.value = 'video/mp4';
        isPlaying.value = false;
        currentTime.value = 0;
        duration.value = 0;
        subtitles.value = [];
        activeSubtitle.value = null;
    }

    function setActiveSubtitle(lang: string | null) {
        activeSubtitle.value = lang;
    }

    return {
        torrentId,
        streamUrl,
        mimeType,
        isPlaying,
        currentTime,
        duration,
        progress,
        subtitles,
        activeSubtitle,
        startStream,
        stopStream,
        setActiveSubtitle,
    };
});
