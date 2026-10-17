import { defineStore } from 'pinia';
import { ref, computed, shallowRef } from 'vue';
import type { PlaybackActivity, WatchSelection } from '@shared/media/types';
import type { StreamStats, SubtitleBatch, SubtitleTrack } from '@shared/ipc/api';
import { dialogueLine, type SubtitleEvent } from '@shared/subtitles';

type CueListener = (trackId: string, events: SubtitleEvent[]) => void;

function defaultTrackId(tracks: SubtitleTrack[]): string {
    const english = tracks.filter((t) => t.lang === 'en');
    const track = english.find((t) => !/sign|song/i.test(t.label)) ?? english[0] ?? tracks[0];
    return track?.id ?? '';
}

export const usePlayerStore = defineStore('player', () => {
    const selection = ref<WatchSelection | null>(null);
    const torrentId = ref<string | null>(null);
    const streamUrl = ref<string | null>(null);
    const loading = ref(false);
    const error = ref<string | null>(null);
    const stats = ref<StreamStats | null>(null);

    const isPlaying = ref(false);
    const currentTime = ref(0);
    const duration = ref(0);

    const tracks = ref<SubtitleTrack[]>([]);
    const activeTrackId = ref('');
    const fonts = shallowRef<Uint8Array[]>([]);
    const cues = new Map<string, SubtitleEvent[]>();
    const cueListeners = new Set<CueListener>();

    const activeTrack = computed(
        () => tracks.value.find((t) => t.id === activeTrackId.value) ?? null
    );

    const title = computed(() => selection.value?.media.title ?? '');

    const episodeLabel = computed(() => {
        const episode = selection.value?.episode;
        if (!episode) return '';
        return [`Episode ${episode.number}`, episode.title].filter(Boolean).join(' · ');
    });

    const activity = computed<PlaybackActivity | null>(() => {
        if (!selection.value) return null;
        return {
            ...selection.value,
            playback: {
                currentTime: currentTime.value,
                duration: duration.value,
                isPlaying: isPlaying.value,
            },
        };
    });

    window.api.on('stream:subtitles', (id, batch) => {
        if (id === torrentId.value) addCues(batch);
    });

    window.api.on('stream:stats', (id, data) => {
        if (id === torrentId.value) stats.value = data;
    });

    window.api.on('stream:fonts', (id, data) => {
        if (id === torrentId.value) fonts.value = data;
    });

    function addCues(batch: SubtitleBatch) {
        for (const [trackId, events] of Object.entries(batch)) {
            const existing = cues.get(trackId);
            if (existing) events.forEach((event) => existing.push(event));
            else cues.set(trackId, events);
            cueListeners.forEach((listener) => listener(trackId, events));
        }
    }

    function onCues(listener: CueListener) {
        cueListeners.add(listener);
        return () => void cueListeners.delete(listener);
    }

    function trackContent(track: SubtitleTrack): string {
        return [track.header, ...(cues.get(track.id) ?? []).map(dialogueLine)].join('\n');
    }

    let lastTrackId = '';

    function toggleSubtitles() {
        if (activeTrackId.value) {
            lastTrackId = activeTrackId.value;
            activeTrackId.value = '';
        } else {
            activeTrackId.value = lastTrackId || defaultTrackId(tracks.value);
        }
    }

    function reset() {
        selection.value = null;
        torrentId.value = null;
        streamUrl.value = null;
        loading.value = false;
        error.value = null;
        stats.value = null;
        isPlaying.value = false;
        currentTime.value = 0;
        duration.value = 0;
        tracks.value = [];
        activeTrackId.value = '';
        lastTrackId = '';
        fonts.value = [];
        cues.clear();
    }

    let generation = 0;

    async function startStream(next: WatchSelection) {
        const current = ++generation;
        reset();
        selection.value = next;
        loading.value = true;

        try {
            const result = await window.api.startStream(next.torrent.magnet, next.episode.number);
            if (current !== generation) {
                await window.api.stopStream(result.torrentId);
                return;
            }
            torrentId.value = result.torrentId;
            streamUrl.value = result.streamUrl;
            tracks.value = result.tracks;
            activeTrackId.value = defaultTrackId(result.tracks);
        } catch (err) {
            if (current === generation) {
                error.value = err instanceof Error ? err.message : String(err);
            }
        } finally {
            if (current === generation) loading.value = false;
        }
    }

    async function stopStream() {
        generation++;
        const id = torrentId.value;
        reset();
        if (id) await window.api.stopStream(id);
    }

    return {
        selection,
        torrentId,
        streamUrl,
        loading,
        error,
        stats,
        isPlaying,
        currentTime,
        duration,
        title,
        episodeLabel,
        activity,
        tracks,
        activeTrackId,
        activeTrack,
        fonts,
        onCues,
        trackContent,
        toggleSubtitles,
        startStream,
        stopStream,
    };
});
