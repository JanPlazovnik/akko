import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

type SubtitleTrack = {
    lang: string;
    label: string;
    url: string;
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

    async function startStream(magnet: string) {
        window.api.onSubtitles((subs) => {
            subtitles.value = subs;
            if (!activeSubtitle.value && subs.length > 0) {
                activeSubtitle.value = subs[0].lang;
            }
        });

        const result = await window.api.startStream(magnet);

        torrentId.value = result.torrentId;
        streamUrl.value = result.streamUrl;
        mimeType.value = result.mimeType;
        subtitles.value = result.subtitles ?? [];
        activeSubtitle.value = result.subtitles?.[0]?.lang ?? null;

        currentTime.value = 0;
        duration.value = 0;
        isPlaying.value = false;
    }

    async function stopStream() {
        if (!torrentId.value) return;

        window.api.offSubtitles();
        await window.api.stopStream(torrentId.value);

        torrentId.value = null;
        streamUrl.value = null;
        mimeType.value = 'video/mp4';

        isPlaying.value = false;
        currentTime.value = 0;
        duration.value = 0;
        subtitles.value = [];
        activeSubtitle.value = null;
    }

    function seek(time: number) {
        currentTime.value = time;
    }

    function setSubtitles(tracks: SubtitleTrack[]) {
        subtitles.value = tracks;
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
        seek,
        setSubtitles,
        setActiveSubtitle,
    };
});
