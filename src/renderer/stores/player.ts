import { defineStore } from 'pinia';
import { ref, computed, shallowRef, watch } from 'vue';
import type { PlaybackActivity, WatchSelection } from '@shared/media/types';
import type { AniZipMappings, Episode } from '@shared/anizip/types';
import type {
    AudioTrack,
    Chapter,
    FileMatch,
    StreamStats,
    SubtitleBatch,
    SubtitleTrack,
} from '@shared/ipc/api';
import { describeEpisode } from '@shared/media/types';
import { dialogueLine, type SubtitleEvent } from '@shared/subtitles';
import { errorMessage } from '../lib/format';
import { createLogger } from '../lib/logger';
import { useSettingsStore } from './settings';

export type PickerContext = {
    episode: Episode;
    anilistId: number;
    titles: string[];
    episodeCount: number | null;
    mappings: AniZipMappings | null;
};

type CueListener = (trackId: string, events: SubtitleEvent[]) => void;

const log = createLogger('player');

const SKIPPABLE_CHAPTER = /\b(op|ed|opening|ending|intro|outro|credits|preview)\b/i;

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
    const fileMatch = ref<FileMatch | null>(null);

    const isPlaying = ref(false);
    const currentTime = ref(0);
    const duration = ref(0);

    const tracks = ref<SubtitleTrack[]>([]);
    const audioTracks = ref<AudioTrack[]>([]);
    const activeTrackId = ref('');
    const fonts = shallowRef<Uint8Array[]>([]);
    const chapters = shallowRef<Chapter[]>([]);
    const skipTimes = shallowRef<Chapter[]>([]);
    let skipTimesRequested = false;
    const cues = new Map<string, SubtitleEvent[]>();
    const early = new Map<string, (() => void)[]>();
    const cueListeners = new Set<CueListener>();

    const audioSupport = computed(() => {
        const supports = new Set(audioTracks.value.map((t) => t.support));
        if (!supports.size || supports.has('native')) return 'native';
        return supports.has('decoded') ? 'decoded' : 'none';
    });
    const audioBridgeFailed = ref(false);
    const unsupportedAudio = computed(
        () => audioSupport.value === 'none' || audioBridgeFailed.value
    );

    // The release's own chapters match its cut exactly, so AniSkip only fills in without them
    const skipSegments = computed(() => {
        const skippable = chapters.value.filter((c) => SKIPPABLE_CHAPTER.test(c.title));
        return skippable.length ? skippable : skipTimes.value;
    });

    const skippableChapter = computed(
        () =>
            skipSegments.value.find(
                (c) => currentTime.value >= c.start && currentTime.value < c.end - 1
            ) ?? null
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

    // Read while the stream starts, so they can arrive before startStream resolves with the torrent id
    function forStream(id: string, apply: () => void) {
        if (id === torrentId.value) apply();
        else if (loading.value) early.set(id, [...(early.get(id) ?? []), apply]);
    }

    window.api.on('stream:fonts', (id, data) => forStream(id, () => (fonts.value = data)));

    window.api.on('stream:chapters', (id, data) => forStream(id, () => (chapters.value = data)));

    // Needs the file's duration, which AniSkip uses to pick submissions timed to this release
    watch([torrentId, duration], async ([id, length]) => {
        const watching = selection.value;
        if (!id || !length || !watching || skipTimesRequested) return;
        skipTimesRequested = true;
        try {
            const times = await window.api.metadata.skipTimes(
                watching.media.anilistId,
                watching.episode.number,
                length
            );
            if (id === torrentId.value) skipTimes.value = times;
        } catch (err) {
            log.warn('Failed to load skip times:', err);
        }
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
        fileMatch.value = null;
        isPlaying.value = false;
        currentTime.value = 0;
        duration.value = 0;
        tracks.value = [];
        audioTracks.value = [];
        audioBridgeFailed.value = false;
        activeTrackId.value = '';
        lastTrackId = '';
        fonts.value = [];
        chapters.value = [];
        skipTimes.value = [];
        skipTimesRequested = false;
        cues.clear();
        early.clear();
    }

    // The picker renders outside the player, so it can't show over fullscreen video
    function pickAnotherRelease() {
        if (document.fullscreenElement) void document.exitFullscreen();
        pickerOpen.value = true;
    }

    let generation = 0;

    async function startStream(next: WatchSelection, context: PickerContext | null = null) {
        const current = ++generation;
        reset();
        selection.value = next;
        pickerContext.value = context;
        loading.value = true;
        log.info(
            `Starting AniList ${next.media.anilistId} "${next.media.title}"`,
            `${describeEpisode(next.episode)} from "${next.torrent.title}"`
        );

        try {
            const result = await window.api.startStream(next.torrent.magnet, next.episode);
            if (current !== generation) {
                await window.api.stopStream(result.torrentId);
                return;
            }
            if (result.match === 'fallback') {
                log.warn(
                    `No file in "${next.torrent.title}" matched ${describeEpisode(next.episode)}`
                );
            }
            torrentId.value = result.torrentId;
            early.get(result.torrentId)?.forEach((apply) => apply());
            early.clear();
            streamUrl.value = result.streamUrl;
            tracks.value = result.tracks;
            audioTracks.value = result.audioTracks;
            fileMatch.value = result.match;
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
        fileMatch,
        isPlaying,
        currentTime,
        duration,
        title,
        episodeNumber,
        episodeTitle,
        activity,
        tracks,
        audioTracks,
        audioSupport,
        audioBridgeFailed,
        unsupportedAudio,
        activeTrackId,
        activeTrack,
        fonts,
        chapters,
        skipSegments,
        skippableChapter,
        onCues,
        trackContent,
        toggleSubtitles,
        pickAnotherRelease,
        startStream,
        stopStream,
    };
});
