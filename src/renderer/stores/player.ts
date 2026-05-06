import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

type TrackInfo = {
    trackNumber: string;
    lang: string;
    label: string;
    format: 'vtt' | 'ass';
    header: string;
    fonts: string[];
};

type SidecarTrack = {
    lang: string;
    label: string;
    format: 'vtt';
    content: string;
};

type SubtitleCue = {
    text: string;
    time: number;
    duration: number;
    readOrder?: string;
    layer?: string;
    style?: string;
    name?: string;
    marginL?: string;
    marginR?: string;
    marginV?: string;
    effect?: string;
};

export type SubtitleTrack = {
    lang: string;
    label: string;
    format: 'vtt' | 'ass';
    content: string;
    fonts?: string[];
    blobUrl?: string;
};

function assTime(ms: number): string {
    const totalCs = Math.max(0, Math.round(ms / 10));
    const hours = Math.floor(totalCs / 360000);
    const minutes = Math.floor((totalCs % 360000) / 6000);
    const seconds = Math.floor((totalCs % 6000) / 100);
    const centiseconds = totalCs % 100;
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

function vttTime(ms: number): string {
    const totalMs = Math.max(0, Math.round(ms));
    const hours = Math.floor(totalMs / 3_600_000);
    const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
    const seconds = Math.floor((totalMs % 60_000) / 1_000);
    const milliseconds = totalMs % 1_000;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

function buildAssDialogue(sub: SubtitleCue): string {
    const end = sub.time + sub.duration;
    return `Dialogue: ${sub.layer || '0'},${assTime(sub.time)},${assTime(end)},${sub.style || 'Default'},${sub.name || ''},${sub.marginL || '0'},${sub.marginR || '0'},${sub.marginV || '0'},${sub.effect || ''},${sub.text || ''}`;
}

function buildVttCue(sub: SubtitleCue): string {
    const end = sub.time + sub.duration;
    return `${vttTime(sub.time)} --> ${vttTime(end)}\n${sub.text || ''}`;
}

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

    const trackMeta = ref<TrackInfo[]>([]);
    const subtitles = ref<SubtitleTrack[]>([]);
    const activeSubtitle = ref<string | null>(null);

    const progress = computed(() => {
        if (!duration.value) return 0;
        return currentTime.value / duration.value;
    });

    function makeBlobUrl(content: string): string {
        return URL.createObjectURL(new Blob([content], { type: 'text/vtt' }));
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

    let streamGeneration = 0;
    let resetCues: (() => void) | null = null;

    async function startStream(magnet: string) {
        window.api.offSubtitle();
        subtitlesReady.value = false;
        loadingMessage.value = 'Episode will load after torrent metadata is received.';

        const generation = ++streamGeneration;
        const cuesByTrack = new Map<string, string[]>();
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;

        function rebuildSubtitles(sidecarTracks: SidecarTrack[]) {
            if (generation !== streamGeneration) return;
            const newTracks: SubtitleTrack[] = [
                ...sidecarTracks.map((t) => ({
                    lang: t.lang,
                    label: t.label,
                    format: t.format,
                    content: t.content,
                    blobUrl: makeBlobUrl(t.content),
                })),
                ...trackMeta.value.map((t) => {
                    const cues = cuesByTrack.get(t.trackNumber) ?? [];
                    const content = cues.length > 0 ? `${t.header}\n${cues.join('\n')}` : t.header;
                    return {
                        lang: t.lang,
                        label: t.label,
                        format: t.format,
                        content,
                        fonts: t.fonts.length > 0 ? t.fonts : undefined,
                        blobUrl: t.format === 'vtt' ? makeBlobUrl(content) : undefined,
                    };
                }),
            ];
            revokeSubtitleBlobUrls();
            subtitles.value = newTracks;
        }

        const result = await window.api.startStream(magnet);

        trackMeta.value = result.tracks;
        pendingMagnet.value = null;
        torrentId.value = result.torrentId;
        streamUrl.value = result.streamUrl;
        mimeType.value = result.mimeType;
        currentTime.value = 0;
        duration.value = 0;
        isPlaying.value = false;

        // Set initial subtitle state (header-only, no cues yet) and allow playback to start.
        revokeSubtitleBlobUrls();
        subtitles.value = [
            ...result.sidecarTracks.map((t) => ({
                lang: t.lang,
                label: t.label,
                format: t.format,
                content: t.content,
                blobUrl: makeBlobUrl(t.content),
            })),
            ...result.tracks.map((t) => ({
                lang: t.lang,
                label: t.label,
                format: t.format,
                content: t.header,
                fonts: t.fonts.length > 0 ? t.fonts : undefined,
                blobUrl: t.format === 'vtt' ? makeBlobUrl(t.header) : undefined,
            })),
        ];

        loadingMessage.value = null;
        subtitlesReady.value = true;

        if (!activeSubtitle.value && subtitles.value.length > 0) {
            activeSubtitle.value = subtitles.value[0].lang;
        }

        resetCues = () => {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
                debounceTimer = null;
            }
            cuesByTrack.clear();
            rebuildSubtitles(result.sidecarTracks);
        };

        window.api.onSubtitle((sub, trackNumber) => {
            const track = trackMeta.value.find((t) => t.trackNumber === trackNumber);
            if (!track) return;

            const cues = cuesByTrack.get(trackNumber) ?? [];
            cues.push(track.format === 'ass' ? buildAssDialogue(sub) : buildVttCue(sub));
            cuesByTrack.set(trackNumber, cues);

            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                debounceTimer = null;
                rebuildSubtitles(result.sidecarTracks);
            }, 150);
        });
    }

    function resetSubtitleCues() {
        resetCues?.();
    }

    async function stopStream() {
        if (!torrentId.value) return;

        resetCues = null;
        window.api.offSubtitle();
        await window.api.stopStream(torrentId.value);

        revokeSubtitleBlobUrls();

        trackMeta.value = [];
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
        trackMeta,
        subtitles,
        activeSubtitle,
        queueStream,
        startStream,
        stopStream,
        setActiveSubtitle,
        resetSubtitleCues,
    };
});
