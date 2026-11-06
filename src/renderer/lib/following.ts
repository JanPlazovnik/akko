import { ref, watch, type Ref } from 'vue';
import { FollowingEntriesQuery, type FollowingEntry } from '@shared/graphql/queries';
import type { VariablesOf } from '@shared/graphql/graphql';
import { anilistUserQuery, staleWhileRevalidate } from './anilist';
import { createLogger } from './logger';
import { useAccountsStore } from '../stores/accounts';

const log = createLogger('following');

const MAX_AGE = 10 * 60_000;

type ScoreFormat = VariablesOf<typeof FollowingEntriesQuery>['scoreFormat'];

// People who follow back come first
const byMutual = (a: FollowingEntry, b: FollowingEntry) =>
    Number(Boolean(b.user?.isFollower)) - Number(Boolean(a.user?.isFollower));

// List entries of the people the connected account follows, for whichever show is given
export function useFollowingEntries(mediaId: Ref<number | null | undefined>) {
    const accounts = useAccountsStore();
    const entries = ref<FollowingEntry[]>([]);
    let request = 0;

    async function load(id: number | null | undefined) {
        const current = ++request;
        entries.value = [];
        const viewer = accounts.anilist;
        if (!id || !viewer) return;
        const scoreFormat = viewer.scoreFormat as ScoreFormat;
        try {
            await staleWhileRevalidate(
                (maxAge) =>
                    anilistUserQuery(FollowingEntriesQuery, { mediaId: id, scoreFormat }, maxAge),
                MAX_AGE,
                (data) => {
                    if (current !== request) return;
                    entries.value = (data?.Page?.mediaList ?? [])
                        .filter((e): e is FollowingEntry =>
                            Boolean(e?.user && e.user.id !== viewer.id)
                        )
                        .sort(byMutual);
                }
            );
        } catch (err) {
            log.warn(`Failed to load followed users for ${id}:`, err);
        }
    }

    watch(
        () => [mediaId.value, accounts.anilist?.id] as const,
        ([id]) => void load(id),
        {
            immediate: true,
        }
    );

    return entries;
}
