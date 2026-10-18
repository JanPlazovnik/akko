import { print, type DocumentNode } from 'graphql';
import type { ResultOf, VariablesOf } from '@shared/graphql/graphql';
import type { CachedResult } from '@shared/ipc/api';
import { createLogger } from './logger';

const log = createLogger('anilist');

const sources = new WeakMap<object, string>();

function source(query: object): string {
    let printed = sources.get(query);
    if (!printed) {
        printed = print(query as DocumentNode);
        sources.set(query, printed);
    }
    return printed;
}

export function anilistQuery<TQuery extends object>(
    query: TQuery,
    variables: VariablesOf<TQuery>,
    maxAge: number
): Promise<CachedResult<ResultOf<TQuery> | null>> {
    return window.api.metadata.anilist(source(query), variables, maxAge) as Promise<
        CachedResult<ResultOf<TQuery> | null>
    >;
}

// Sent with the connected account's token and cached per user
export function anilistUserQuery<TQuery extends object>(
    query: TQuery,
    variables: VariablesOf<TQuery>,
    maxAge: number
): Promise<CachedResult<ResultOf<TQuery> | null>> {
    return window.api.metadata.anilistUser(source(query), variables, maxAge) as Promise<
        CachedResult<ResultOf<TQuery> | null>
    >;
}

// Applies whatever is cached straight away, then refreshes in the background when it is older
// than maxAge. The returned promise settles once the first data has been applied.
export async function staleWhileRevalidate<T>(
    load: (maxAge: number) => Promise<CachedResult<T>>,
    maxAge: number,
    apply: (data: T) => void
): Promise<void> {
    const first = await load(Infinity);
    apply(first.data);
    if (!first.fromCache || first.age <= maxAge) return;
    load(0)
        .then((fresh) => apply(fresh.data))
        .catch((err) => log.warn('Background refresh failed', err));
}
