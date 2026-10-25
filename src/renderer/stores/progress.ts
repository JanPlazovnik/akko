import { defineStore } from 'pinia';
import { computed, ref, toRaw, watch } from 'vue';
import type { Media } from '@shared/graphql/queries';
import type { WatchProgress } from '@shared/ipc/api';
import type { WatchSelection } from '@shared/media/types';
import { createLogger } from '../lib/logger';
import { airedEpisodes, finishedAt, isUnaired } from '../lib/watching';
import router from '../router';
import { entryMedia, useListStore } from './list';
import { useMediaStore } from './media';
import { usePlayerStore, type PickerContext } from './player';

const SAVE_EVERY_S = 5;
// Anything earlier just starts over, and a finished episode isn't reopened by a quick peek
const RESUME_MIN_S = 15;
const RESUME_REWIND_S = 5;
const CONTINUE_LIMIT = 20;

export type ContinueItem = {
    media: Media;
    episode: number;
    record: WatchProgress | null;
    updatedAt: number;
};

const log = createLogger('progress');
const keyOf = (anilistId: number, episode: number) => `${anilistId}:${episode}`;

export const useProgressStore = defineStore('progress', () => {
    const player = usePlayerStore();
    const list = useListStore();
    const mediaStore = useMediaStore();

    const records = ref<Record<string, WatchProgress>>({});

    const latestByShow = computed(() => {
        const latest = new Map<number, WatchProgress>();
        for (const record of Object.values(records.value)) {
            const current = latest.get(record.anilistId);
            if (!current || record.updatedAt > current.updatedAt) {
                latest.set(record.anilistId, record);
            }
        }
        return latest;
    });

    const recentShows = computed(() =>
        [...latestByShow.value.values()]
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, CONTINUE_LIMIT)
    );

    const latestFor = (anilistId: number) => latestByShow.value.get(anilistId) ?? null;

    const forEpisode = (anilistId: number, episode: number) =>
        records.value[keyOf(anilistId, episode)] ?? null;

    function resumable(anilistId: number, episode: number) {
        const record = forEpisode(anilistId, episode);
        return record && !record.finished && record.position >= RESUME_MIN_S ? record : null;
    }

    function furthestFinished(anilistId: number) {
        let furthest = 0;
        for (const record of Object.values(records.value)) {
            if (record.anilistId === anilistId && record.finished) {
                furthest = Math.max(furthest, record.episode);
            }
        }
        return furthest;
    }

    // Where to pick a show back up from local playback, or null when the list entry should decide:
    // it's newer (edited or watched elsewhere since), or local playback was a rewatch of an episode
    // it already counts. Rewatching never moves a show back, starting over resets the list instead.
    function continuePoint(anilistId: number) {
        const latest = latestByShow.value.get(anilistId);
        if (!latest) return null;
        const entry = list.entryFor(anilistId);
        if (entry?.updatedAt && entry.updatedAt * 1000 > latest.updatedAt) return null;
        const counted = entry ? (entry.progress ?? 0) : furthestFinished(anilistId);
        if (latest.episode <= counted) {
            return entry
                ? null
                : { episode: counted + 1, record: resumable(anilistId, counted + 1) };
        }
        return latest.finished
            ? { episode: latest.episode + 1, record: null }
            : { episode: latest.episode, record: resumable(anilistId, latest.episode) };
    }

    function resumePosition(selection: WatchSelection | null): number {
        if (!selection) return 0;
        const record = resumable(selection.media.anilistId, selection.episode.number);
        return record ? Math.max(0, record.position - RESUME_REWIND_S) : 0;
    }

    // Without loaded episodes or an airing schedule the next one is assumed to exist, as long as
    // the count allows it
    function hasEpisode(media: Media, number: number): boolean {
        if (media.episodes && number > media.episodes) return false;
        const aired = airedEpisodes(list.entryFor(media.id)?.media ?? {});
        if (aired !== null) return number <= aired;
        const episodes = mediaStore.episodesFor(media.id);
        if (!episodes.length) return true;
        const episode = episodes.find((ep) => ep.number === number);
        return Boolean(episode && !isUnaired(episode));
    }

    const continueItems = computed<ContinueItem[]>(() => {
        const items = new Map<number, ContinueItem>();
        for (const latest of recentShows.value) {
            const id = latest.anilistId;
            const point = continuePoint(id);
            const media = mediaStore.mediaFor(id);
            if (!point || !media) continue;
            if (!point.record && !hasEpisode(media, point.episode)) continue;
            items.set(id, {
                media,
                episode: point.episode,
                record: point.record,
                updatedAt: latest.updatedAt,
            });
        }
        for (const entry of list.continueWatching) {
            const id = entry.mediaId;
            if (items.has(id) || continuePoint(id)) continue;
            const episode = (entry.progress ?? 0) + 1;
            items.set(id, {
                media: entryMedia(entry),
                episode,
                record: resumable(id, episode),
                updatedAt: (entry.updatedAt ?? 0) * 1000,
            });
        }
        return [...items.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    });

    async function contextFor(media: Media, number: number): Promise<PickerContext | null> {
        const episodes = await mediaStore
            .fetchEpisodes(media.id)
            .catch(() => mediaStore.episodesFor(media.id));
        const episode = episodes.find((ep) => ep.number === number);
        if (!episode) return null;
        return {
            episode,
            anilistId: media.id,
            titles: [media.title?.romaji, media.title?.english].filter((t): t is string => !!t),
            episodeCount: media.episodes ?? null,
            mappings: mediaStore.mappingsFor(media.id),
        };
    }

    // Starts the release that was playing, so there's no need to search again
    async function resume(media: Media, record: WatchProgress) {
        const context = await contextFor(media, record.episode);
        // Stored records are reactive, and IPC can't clone proxies
        void player.startStream(toRaw(record).selection, context);
        await router.push('/player');
    }

    let snapshot: { selection: WatchSelection; position: number; duration: number } | null = null;
    let lastSaved = 0;

    function save() {
        if (!snapshot) return;
        const { selection, position, duration } = snapshot;
        const anilistId = selection.media.anilistId;
        const episode = selection.episode.number;
        const finished = position >= finishedAt(duration);
        if (forEpisode(anilistId, episode)?.finished && !finished && position < RESUME_MIN_S) {
            return;
        }
        const record: WatchProgress = {
            anilistId,
            episode,
            position,
            duration,
            finished,
            selection,
            updatedAt: Date.now(),
        };
        records.value = { ...records.value, [keyOf(anilistId, episode)]: record };
        window.api.progress.save(record);
    }

    watch(
        () => player.currentTime,
        (time) => {
            const selection = player.selection;
            // A fallback file may be a different episode, so its position would be misleading
            if (!selection || !player.duration || time <= 0 || player.fileMatch === 'fallback') {
                return;
            }
            snapshot = { selection: toRaw(selection), position: time, duration: player.duration };
            if (player.isPlaying && Math.abs(time - lastSaved) >= SAVE_EVERY_S) {
                lastSaved = time;
                save();
            }
        }
    );

    watch(
        () => player.isPlaying,
        (playing) => !playing && save()
    );

    watch(
        () => player.selection,
        () => {
            save();
            snapshot = null;
            lastSaved = 0;
        }
    );

    window.addEventListener('beforeunload', save);

    void window.api.progress
        .all()
        .then((all) => {
            records.value = Object.fromEntries(
                all.map((record) => [keyOf(record.anilistId, record.episode), record])
            );
            for (const { anilistId } of recentShows.value) {
                void mediaStore.preloadMedia(anilistId).catch(() => undefined);
            }
        })
        .catch((err) => log.warn('Failed to load watch progress:', err));

    return {
        latestFor,
        forEpisode,
        resumable,
        continuePoint,
        resumePosition,
        continueItems,
        contextFor,
        resume,
    };
});
