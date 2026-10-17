import { defineStore } from 'pinia';
import { ref, computed, shallowRef } from 'vue';
import type { PlaybackActivity, WatchSelection } from '@shared/media/types';
import type { AniZipEpisode } from '@shared/anizip/types';
import type { AudioTrack, StreamStats, SubtitleBatch, SubtitleTrack } from '@shared/ipc/api';
import { dialogueLine, type SubtitleEvent } from '@shared/subtitles';
import { errorMessage } from '../lib/format';
import { useSettingsStore } from './settings';

export type PickerContext = {
    episode: AniZipEpisode;
    anilistId: number;
    titles: string[];
    episodeCount: number | null;
    anidbAid: number | null;
};

type CueListener = (trackId: string, events: SubtitleEvent[]) => void;

function defaultTrackId(tracks: SubtitleTrack[], lang: string): string {
    const preferred = tracks.filter((t) => t.lang === lang);
    const pool = preferred.length ? preferred : tracks;
    const track = pool.find((t) => !/sign|song/i.test(t.label)) ?? pool[0];
    return track?.id ?? '';
}

export const usePlayerStore = defineStore('player', () => {
    const settingsStore = useSettingsStore();
    const subtitleLanguage = () => settingsStore.settings?.subtitleLanguage ?? 'en';

    const selection = ref<WatchSelection | null>(null);
    const pickerContext = shallowRef<PickerContext | null>(null);
    const pickerOpen = ref(false);
    const torrentId = ref<string | null>(null);
    const streamUrl = ref<string | null>(null);
    const loading = ref(false);
    const error = ref<string | null>(null);
    const stats = ref<StreamStats | null>(null);

    const isPlaying = ref(false);
    const currentTime = ref(0);
    const duration = ref(0);

    const tracks = ref<SubtitleTrack[]>([]);
    const audioTracks = ref<AudioTrack[]>([]);
    const activeTrackId = ref('');
    const fonts = shallowRef<Uint8Array[]>([]);
    const cues = new Map<string, SubtitleEvent[]>();
    const cueListeners = new Set<CueListener>();

    const unsupportedAudio = computed(
        () => audioTracks.value.length > 0 && audioTracks.value.every((t) => !t.supported)
    );

    const activeTrack = computed(
        () => tracks.value.find((t) => t.id === activeTrackId.value) ?? null
    );

    const title = computed(() => selection.value?.media.title ?? '');

    const episodeNumber = computed(() => selection.value?.episode.number ?? null);
    const episodeTitle = computed(() => selection.value?.episode.title ?? null);

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
            activeTrackId.value =
                lastTrackId || defaultTrackId(tracks.value, subtitleLanguage() || 'en');
        }
    }

    function reset() {
        selection.value = null;
        pickerContext.value = null;
        pickerOpen.value = false;
        torrentId.value = null;
        streamUrl.value = null;
        loading.value = false;
        error.value = null;
        stats.value = null;
        isPlaying.value = false;
        currentTime.value = 0;
        duration.value = 0;
        tracks.value = [];
        audioTracks.value = [];
        activeTrackId.value = '';
        lastTrackId = '';
        fonts.value = [];
        cues.clear();
    }

    let generation = 0;

    async function startStream(next: WatchSelection, context: PickerContext | null = null) {
        const current = ++generation;
        reset();
        selection.value = next;
        pickerContext.value = context;
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
            audioTracks.value = result.audioTracks;
            activeTrackId.value = subtitleLanguage()
                ? defaultTrackId(result.tracks, subtitleLanguage())
                : '';
        } catch (err) {
            if (current === generation) {
                error.value = errorMessage(err);
            }
        } finally {
            if (current === generation) loading.value = false;
        }
    }

    async function stopStream() {
        generation++;
        const id = torrentId.value;
        reset();
        await window.api.stopStream(id);
    }

    return {
        selection,
        pickerContext,
        pickerOpen,
        torrentId,
        streamUrl,
        loading,
        error,
        stats,
        isPlaying,
        currentTime,
        duration,
        title,
        episodeNumber,
        episodeTitle,
        activity,
        tracks,
        audioTracks,
        unsupportedAudio,
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
