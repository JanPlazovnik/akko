import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { UserListQuery, type ListEntry, type Media } from '@shared/graphql/queries';
import type { ResultOf } from '@shared/graphql/graphql';
import { anilistUserQuery, staleWhileRevalidate } from '../lib/anilist';
import { errorMessage } from '../lib/format';
import { createLogger } from '../lib/logger';
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

// Without a scheduled next episode AniList often still has one airing, so assume there is
function hasUnwatchedEpisode({ media, progress }: ListEntry): boolean {
    if (!media || media.status === 'FINISHED') return true;
    const aired = media.nextAiringEpisode ? media.nextAiringEpisode.episode - 1 : Infinity;
    return (progress ?? 0) < aired;
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

    // Custom lists repeat entries from the status lists, so only the status lists are read
    function apply(data: ResultOf<typeof UserListQuery> | null) {
        const next = (data?.MediaListCollection?.lists ?? [])
            .flatMap((list) => (list && !list.isCustomList ? (list.entries ?? []) : []))
            .filter((entry): entry is ListEntry => Boolean(entry?.media))
            .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
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

    return { entries, loading, error, byStatus, continueWatching, entryFor, load };
});
