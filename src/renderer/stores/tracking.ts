import { defineStore } from 'pinia';
import { watch } from 'vue';
import { toast } from 'vue3-toastify';
import type { ListEntry } from '@shared/graphql/queries';
import { createLogger } from '../lib/logger';
import { finishedAt } from '../lib/watching';
import { useAccountsStore } from './accounts';
import { useListStore, type EntryPatch } from './list';
import { useMediaStore } from './media';
import { usePlayerStore } from './player';
import { useSettingsStore } from './settings';

const log = createLogger('tracking');

// Only real playback counts, so opening the wrong episode or skimming doesn't start a show
const START_AFTER_S = 5 * 60;
const MAX_TICK_S = 2;

export const useTrackingStore = defineStore('tracking', () => {
    const player = usePlayerStore();
    const list = useListStore();
    const accounts = useAccountsStore();
    const settings = useSettingsStore();
    const mediaStore = useMediaStore();

    let watched = 0;
    let lastTime = 0;
    let started = false;
    let finished = false;

    function blockedReason(): string | null {
        if (!settings.settings?.syncProgress) return 'sync is turned off';
        if (!accounts.anilist) return 'AniList is not connected';
        if (accounts.anilistExpiry()?.expired) return 'the AniList login expired';
        if (player.fileMatch === 'fallback') return "the file didn't match the episode";
        return null;
    }

    async function apply(mediaId: number, patch: EntryPatch, message: string) {
        const before = list.entryFor(mediaId);
        if (!(await list.save(mediaId, patch))) return;
        log.info(message);
        toast.success(`${message}. Click to undo.`, {
            onClick: () => void undo(mediaId, before),
        });
    }

    async function undo(mediaId: number, before: ListEntry | null) {
        if (await list.restore(mediaId, before)) toast.info('Undone');
    }

    async function markStarted() {
        const selection = player.selection;
        if (!selection) return;
        const reason = blockedReason();
        if (reason) return log.debug(`Not marking as started: ${reason}`);

        const { anilistId, title } = selection.media;
        const entry = list.entryFor(anilistId);
        const media = mediaStore.mediaFor(anilistId);
        const single = media?.format === 'MOVIE' || media?.episodes === 1;

        if (!entry || entry.status === 'PLANNING' || entry.status === 'PAUSED') {
            await apply(anilistId, { status: 'CURRENT' }, `Marked ${title} as watching`);
        } else if (entry.status === 'COMPLETED' && selection.episode.number === 1 && !single) {
            await apply(
                anilistId,
                { status: 'REPEATING', progress: 0 },
                `Marked ${title} as rewatching`
            );
        }
    }

    async function markFinished() {
        const selection = player.selection;
        if (!selection) return;
        const reason = blockedReason();
        if (reason) return log.debug(`Not updating progress: ${reason}`);

        const { anilistId, title } = selection.media;
        const number = selection.episode.number;
        const progress = list.entryFor(anilistId)?.progress ?? 0;
        const episodes = mediaStore.mediaFor(anilistId)?.episodes;
        if (number <= progress) return log.debug(`Episode ${number} is already counted`);
        if (episodes && number > episodes) {
            return log.warn(`Episode ${number} is beyond ${title}'s ${episodes} episodes`);
        }

        const single = episodes === 1;
        const message = single
            ? `Marked ${title} as watched`
            : `Marked episode ${number} of ${title} as watched`;
        await apply(anilistId, { progress: number }, message);
    }

    watch(
        () => player.selection,
        () => {
            watched = 0;
            lastTime = 0;
            started = false;
            finished = false;
        }
    );

    watch(
        () => player.currentTime,
        (time) => {
            const delta = time - lastTime;
            lastTime = time;
            if (player.isPlaying && delta > 0 && delta < MAX_TICK_S) watched += delta;
            if (!player.selection || !player.duration) return;

            if (!started && watched >= START_AFTER_S) {
                started = true;
                void markStarted();
            }
            if (!finished && time >= finishedAt(player.duration)) {
                finished = true;
                void markFinished();
            }
        }
    );

    return {};
});
