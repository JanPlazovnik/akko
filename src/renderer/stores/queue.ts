import { defineStore } from 'pinia';
import { computed, ref, shallowRef, toRaw, watch } from 'vue';
import type { Episode } from '@shared/anizip/types';
import { episodeToSummary, type WatchSelection } from '@shared/media/types';
import { errorMessage } from '../lib/format';
import { createLogger } from '../lib/logger';
import { matchRelease, parseTitle, searchParams, selectionFor } from '../lib/torrents';
import { finishedAt, isUnaired } from '../lib/watching';
import { useMediaStore } from './media';
import { usePlayerStore, type PickerContext } from './player';
import { useProgressStore } from './progress';

export const COUNTDOWN_S = 10;

const log = createLogger('queue');

export const useQueueStore = defineStore('queue', () => {
    const player = usePlayerStore();
    const mediaStore = useMediaStore();
    const progress = useProgressStore();

    const anilistId = computed(() => player.selection?.media.anilistId ?? null);

    function neighbour(offset: number): Episode | null {
        const selection = player.selection;
        if (!selection) return null;
        const number = selection.episode.number + offset;
        const episode = mediaStore
            .episodesFor(selection.media.anilistId)
            .find((ep) => ep.number === number);
        return episode && !isUnaired(episode) ? episode : null;
    }

    const next = computed(() => neighbour(1));
    const previous = computed(() => neighbour(-1));
    const finding = shallowRef<Episode | null>(null);
    const countdown = ref<number | null>(null);

    // A batch has the other episodes too, otherwise look for the same group and resolution
    async function findRelease(
        current: WatchSelection,
        batch: boolean,
        context: PickerContext
    ): Promise<WatchSelection | null> {
        if (batch) return { ...current, episode: episodeToSummary(context.episode) };
        const resolution = parseTitle(current.torrent.title).resolution ?? '1080';
        const params = searchParams(context, mediaStore.mediaFor(context.anilistId), resolution);
        const sources = await window.api.extensions.searchAll('single', params);
        const match = matchRelease(
            current.torrent.title,
            sources.flatMap((source) => source.results)
        );
        log.info(
            `Episode ${context.episode.number}:`,
            match ? `found "${match.title}"` : `no match for "${current.torrent.title}"`
        );
        return match ? selectionFor(current.media, context, match) : null;
    }

    type Lookup = { context: PickerContext | null; selection: WatchSelection | null };
    const lookups = new Map<string, Promise<Lookup>>();

    // Cached, so the release found ahead of time starts as soon as the countdown ends
    function lookup(episode: Episode): Promise<Lookup> {
        const current = toRaw(player.selection);
        const media = current && mediaStore.mediaFor(current.media.anilistId);
        if (!current || !media) return Promise.resolve({ context: null, selection: null });
        const key = `${current.torrent.magnet}#${episode.number}`;
        let request = lookups.get(key);
        if (!request) {
            const batch = player.fileMatch === 'episode';
            request = (async () => {
                const context = await progress.contextFor(media, episode.number);
                if (!context) return { context, selection: null };
                const selection = await findRelease(current, batch, context).catch((err) => {
                    log.warn(`Release lookup failed: ${errorMessage(err)}`);
                    return null;
                });
                return { context, selection };
            })();
            lookups.set(key, request);
            void request.then(({ selection }) => !selection && lookups.delete(key));
        }
        return request;
    }

    function openPicker(context: PickerContext) {
        // The dialog renders outside the fullscreen element
        if (document.fullscreenElement) void document.exitFullscreen();
        const previousContext = player.pickerContext;
        player.pickerContext = context;
        player.pickerOpen = true;
        // Closing without picking keeps "change release" pointed at what's playing
        const stop = watch(
            () => player.pickerOpen,
            (open) => {
                if (open) return;
                stop();
                if (player.pickerContext === context) player.pickerContext = previousContext;
            }
        );
    }

    async function play(episode: Episode) {
        cancelCountdown();
        const magnet = player.selection?.torrent.magnet;
        finding.value = episode;
        try {
            const { context, selection } = await lookup(episode);
            if (finding.value !== episode || !context) return;
            if (!selection) return openPicker(context);
            await player.startStream(selection, context);
            // The batch didn't have this episode after all
            if (player.fileMatch === 'fallback' && selection.torrent.magnet === magnet) {
                openPicker(context);
            }
        } finally {
            if (finding.value === episode) finding.value = null;
        }
    }

    let timer: ReturnType<typeof setInterval> | undefined;

    function startCountdown() {
        if (!next.value || countdown.value !== null) return;
        countdown.value = COUNTDOWN_S;
        timer = setInterval(() => {
            countdown.value = (countdown.value ?? 0) - 1;
            if (countdown.value > 0) return;
            const episode = next.value;
            cancelCountdown();
            if (episode) void play(episode);
        }, 1000);
    }

    function cancelCountdown() {
        clearInterval(timer);
        countdown.value = null;
    }

    watch(anilistId, (id) => {
        lookups.clear();
        if (id) void mediaStore.preloadMedia(id).catch(() => undefined);
    });

    watch(
        () => player.selection,
        () => cancelCountdown()
    );

    // Look the next release up once the episode counts as watched, before the credits end
    watch(
        () => player.duration > 0 && player.currentTime >= finishedAt(player.duration),
        (finished) => {
            if (finished && next.value && player.fileMatch !== 'fallback') void lookup(next.value);
        }
    );

    return {
        next,
        previous,
        finding,
        countdown,
        play,
        startCountdown,
        cancelCountdown,
    };
});
