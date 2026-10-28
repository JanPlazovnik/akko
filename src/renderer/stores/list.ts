import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import {
    DeleteListEntryMutation,
    SaveListEntryMutation,
    UserListQuery,
    type ListEntry,
    type Media,
} from '@shared/graphql/queries';
import type { ResultOf, VariablesOf } from '@shared/graphql/graphql';
import { anilistMutation, anilistUserQuery, staleWhileRevalidate } from '../lib/anilist';
import { errorMessage } from '../lib/format';
import { t } from '../i18n';
import { createLogger } from '../lib/logger';
import { toast } from '../lib/toast';
import { airedEpisodes } from '../lib/watching';
import { useAccountsStore } from './accounts';
import { useMediaStore } from './media';

const log = createLogger('list');

const MAX_AGE = 5 * 60_000;

export const LIST_STATUSES = [
    'CURRENT',
    'REPEATING',
    'PLANNING',
    'COMPLETED',
    'PAUSED',
    'DROPPED',
] as const;
export type ListStatus = (typeof LIST_STATUSES)[number];

// ListMediaFragment leaves out tags and relation titles, which nothing reading list media uses
export const entryMedia = (entry: ListEntry) => entry.media as unknown as Media;

export type EntryPatch = {
    status?: ListStatus;
    progress?: number;
    score?: number;
    repeat?: number;
};

type SaveVariables = VariablesOf<typeof SaveListEntryMutation>;

const today = () => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
};

const byUpdated = (a: ListEntry, b: ListEntry) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0);

// Like AniList's site: progress starts a planned show and the last episode completes it, unless
// the status was picked explicitly. Completing needs a known episode count, or airing shows
// would complete at whatever has aired so far.
function withRules(
    previous: ListEntry | null,
    patch: EntryPatch,
    episodes: number | null | undefined
): Omit<SaveVariables, 'mediaId'> {
    let status = patch.status ?? (previous?.status as ListStatus | undefined) ?? 'PLANNING';
    let progress = patch.progress ?? previous?.progress ?? 0;
    let repeat = patch.repeat ?? previous?.repeat ?? 0;
    if (episodes) progress = Math.min(progress, episodes);

    if (patch.status === 'COMPLETED' && episodes) progress = episodes;
    if (!patch.status && progress > (previous?.progress ?? 0)) {
        if (status === 'PLANNING' || status === 'PAUSED') status = 'CURRENT';
        if (episodes && progress >= episodes && (status === 'CURRENT' || status === 'REPEATING')) {
            if (status === 'REPEATING') repeat += 1;
            status = 'COMPLETED';
        }
    }

    const vars: Omit<SaveVariables, 'mediaId'> = { status, progress, repeat };
    if (patch.score !== undefined) vars.score = patch.score;
    const started = progress > 0 || status === 'CURRENT' || status === 'REPEATING';
    if (!previous?.startedAt?.year && status !== 'PLANNING' && started) vars.startedAt = today();
    if (status === 'COMPLETED' && !previous?.completedAt?.year) vars.completedAt = today();
    return vars;
}

// Without a scheduled next episode AniList often still has one airing, so assume there is
function hasUnwatchedEpisode({ media, progress }: ListEntry): boolean {
    if (!media || media.status === 'FINISHED') return true;
    return (progress ?? 0) < (airedEpisodes(media) ?? Infinity);
}

export const useListStore = defineStore('list', () => {
    const accounts = useAccountsStore();
    const mediaStore = useMediaStore();

    const entries = ref<ListEntry[]>([]);
    const loading = ref(false);
    const error = ref<string | null>(null);
    let request = 0;

    const byMediaId = computed(() => new Map(entries.value.map((e) => [e.mediaId, e])));

    const byStatus = computed(() => {
        const groups = Object.fromEntries(LIST_STATUSES.map((s) => [s, []])) as unknown as Record<
            ListStatus,
            ListEntry[]
        >;
        for (const entry of entries.value) groups[entry.status as ListStatus]?.push(entry);
        return groups;
    });

    const continueWatching = computed(() =>
        entries.value.filter(
            (e) => (e.status === 'CURRENT' || e.status === 'REPEATING') && hasUnwatchedEpisode(e)
        )
    );

    const entryFor = (mediaId: number) => byMediaId.value.get(mediaId) ?? null;

    function put(mediaId: number, entry: ListEntry | null) {
        const others = entries.value.filter((e) => e.mediaId !== mediaId);
        entries.value = entry ? [...others, entry].sort(byUpdated) : others;
    }

    // A show not on the list yet borrows the media store's copy until AniList replies
    const mediaOf = (mediaId: number) =>
        entryFor(mediaId)?.media ?? (mediaStore.mediaFor(mediaId) as unknown as ListEntry['media']);

    async function save(mediaId: number, patch: EntryPatch): Promise<ListEntry | null> {
        return commit(mediaId, withRules(entryFor(mediaId), patch, mediaOf(mediaId)?.episodes));
    }

    // Puts an entry back exactly as it was, dates included, e.g. to undo an automatic update
    async function restore(mediaId: number, entry: ListEntry | null): Promise<boolean> {
        if (!entry) return remove(mediaId);
        const { status, progress, score, repeat, startedAt, completedAt } = entry;
        const saved = await commit(mediaId, {
            status,
            progress,
            score,
            repeat,
            startedAt: startedAt ?? undefined,
            completedAt: completedAt ?? undefined,
        });
        return Boolean(saved);
    }

    // Shows the change straight away and rolls it back if AniList refuses it
    async function commit(
        mediaId: number,
        vars: Omit<SaveVariables, 'mediaId'>
    ): Promise<ListEntry | null> {
        const previous = entryFor(mediaId);
        const media = mediaOf(mediaId);
        const optimistic = {
            ...previous,
            ...vars,
            id: previous?.id ?? 0,
            mediaId,
            media,
            updatedAt: Math.floor(Date.now() / 1000),
        } as ListEntry;
        put(mediaId, optimistic);
        try {
            const data = await anilistMutation(SaveListEntryMutation, { mediaId, ...vars });
            const reply = data?.SaveMediaListEntry as ListEntry | null | undefined;
            // Saving doesn't change the show, and keeping our copy of it means a reply without the
            // airing schedule can't make the next, unaired episode look out
            const saved = reply && { ...reply, media: previous?.media ?? reply.media };
            if (saved) put(mediaId, saved);
            log.info(`Saved AniList ${mediaId}:`, JSON.stringify(vars));
            return saved ?? optimistic;
        } catch (err) {
            put(mediaId, previous);
            log.warn(`Failed to save AniList ${mediaId}:`, err);
            toast.error(t('list.saveFailed', { error: errorMessage(err) }));
            return null;
        }
    }

    async function remove(mediaId: number): Promise<boolean> {
        const previous = entryFor(mediaId);
        if (!previous) return true;
        put(mediaId, null);
        try {
            const data = await anilistMutation(DeleteListEntryMutation, { id: previous.id });
            if (!data?.DeleteMediaListEntry?.deleted) throw new Error('AniList kept the entry');
            log.info(`Removed AniList ${mediaId} from the list`);
            return true;
        } catch (err) {
            put(mediaId, previous);
            log.warn(`Failed to remove AniList ${mediaId}:`, err);
            toast.error(t('list.removeFailed', { error: errorMessage(err) }));
            return false;
        }
    }

    // Custom lists repeat entries from the status lists, so only the status lists are read
    function apply(data: ResultOf<typeof UserListQuery> | null) {
        const next = (data?.MediaListCollection?.lists ?? [])
            .flatMap((list) => (list && !list.isCustomList ? (list.entries ?? []) : []))
            .filter((entry): entry is ListEntry => Boolean(entry?.media))
            .sort(byUpdated);
        entries.value = next;
        mediaStore.rememberMissing(next.map(entryMedia));
        log.info(`Loaded ${next.length} list entries`);
    }

    async function load() {
        const current = ++request;
        const userId = accounts.anilist?.id;
        error.value = null;
        if (!userId) {
            entries.value = [];
            return;
        }
        loading.value = !entries.value.length;
        try {
            await staleWhileRevalidate(
                (maxAge) => anilistUserQuery(UserListQuery, { userId }, maxAge),
                MAX_AGE,
                (data) => current === request && apply(data)
            );
        } catch (err) {
            if (current !== request) return;
            error.value = errorMessage(err);
            log.warn('Failed to load list:', err);
        } finally {
            if (current === request) loading.value = false;
        }
    }

    watch(() => accounts.anilist?.id, load, { immediate: true });

    return {
        entries,
        loading,
        error,
        byStatus,
        continueWatching,
        entryFor,
        load,
        save,
        restore,
        remove,
    };
});
