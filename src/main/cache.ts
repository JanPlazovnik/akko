import type { CachedResult } from '../shared/ipc/api';
import { dbGetCache, dbPruneCache, dbSetCache } from './db';
import { createLogger } from './logger';

const log = createLogger('cache');

const PRUNE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

const inFlight = new Map<string, Promise<unknown>>();

export function pruneCache() {
    dbPruneCache(Date.now() - PRUNE_AFTER_MS);
}

export async function cached<T>(
    key: string,
    maxAge: number,
    fetcher: () => Promise<T | null>
): Promise<CachedResult<T | null>> {
    const entry = dbGetCache(key);
    const age = entry ? Date.now() - entry.fetchedAt : Infinity;
    if (entry && age <= maxAge) return { data: JSON.parse(entry.value), age, fromCache: true };

    let request = inFlight.get(key) as Promise<T | null> | undefined;
    if (!request) {
        request = fetcher().finally(() => inFlight.delete(key));
        inFlight.set(key, request);
    }

    try {
        const data = await request;
        if (data !== null) dbSetCache(key, JSON.stringify(data));
        return { data, age: 0, fromCache: false };
    } catch (err) {
        if (!entry) throw err;
        log.warn(`Serving stale ${key} after fetch failed:`, err);
        return { data: JSON.parse(entry.value), age, fromCache: true };
    }
}
