import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export type SubtitleTrack = {
    lang: string;
    label: string;
    format: 'vtt' | 'ass';
    content: string;
    fonts?: string[];
    blobUrl?: string;
};

export const usePlayerStore = defineStore('player', () => {
    const pendingMagnet = ref<string | null>(null);
    const torrentId = ref<string | null>(null);
    const streamUrl = ref<string | null>(null);
    const mimeType = ref<string>('video/mp4');

    const isPlaying = ref(false);
    const subtitlesReady = ref(false);
    const loadingMessage = ref<string | null>(null);
    const currentTime = ref(0);
    const duration = ref(0);

    const subtitles = ref<SubtitleTrack[]>([]);
    const activeSubtitle = ref<string | null>(null);

    const progress = computed(() => {
        if (!duration.value) return 0;
        return currentTime.value / duration.value;
    });

    function createSubtitleBlobUrls(
        tracks: {
            lang: string;
            label: string;
            content: string;
            format?: 'vtt' | 'ass';
            fonts?: string[];
        }[]
    ): SubtitleTrack[] {
        revokeSubtitleBlobUrls();
        return tracks.map((t) => ({
            lang: t.lang,
            label: t.label,
            format: t.format ?? 'vtt',
            content: t.content,
            fonts: t.fonts,
            blobUrl:
                (t.format ?? 'vtt') === 'vtt'
                    ? URL.createObjectURL(new Blob([t.content], { type: 'text/vtt' }))
                    : undefined,
        }));
    }

    function revokeSubtitleBlobUrls() {
        subtitles.value.forEach((t) => {
            if (t.blobUrl) URL.revokeObjectURL(t.blobUrl);
        });
    }

    function queueStream(magnet: string) {
        pendingMagnet.value = magnet;
        loadingMessage.value = 'Episode will load after torrent metadata is received.';
    }

    async function startStream(magnet: string) {
        window.api.offSubtitles();
        subtitlesReady.value = false;
        loadingMessage.value = 'Episode will load after torrent metadata is received.';

        window.api.onSubtitles((incoming) => {
            subtitles.value = createSubtitleBlobUrls(incoming);
            subtitlesReady.value = true;
            loadingMessage.value = null;
            if (!activeSubtitle.value && subtitles.value.length > 0) {
                activeSubtitle.value = subtitles.value[0].lang;
            }
        });

        const result = await window.api.startStream(magnet);

        pendingMagnet.value = null;
        torrentId.value = result.torrentId;
        streamUrl.value = result.streamUrl;
        mimeType.value = result.mimeType;
        loadingMessage.value = 'Episode is preparing to play.';
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
        subtitlesReady.value = false;
        loadingMessage.value = null;
        subtitles.value = [];
        activeSubtitle.value = null;
    }

    function setActiveSubtitle(lang: string | null) {
        activeSubtitle.value = lang;
    }

    return {
        torrentId,
        pendingMagnet,
        streamUrl,
        mimeType,
        isPlaying,
        subtitlesReady,
        loadingMessage,
        currentTime,
        duration,
        progress,
        subtitles,
        activeSubtitle,
        queueStream,
        startStream,
        stopStream,
        setActiveSubtitle,
    };
});
