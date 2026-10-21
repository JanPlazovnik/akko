import { createHash } from 'node:crypto';
import type { CachedResult } from '../../shared/ipc/api';
import { cached } from '../cache';
import { sendToRenderer } from '../context';
import { createLogger } from '../logger';

const log = createLogger('anilist');

const ENDPOINT = 'https://graphql.anilist.co';
const MAX_RETRIES = 2;
const MAX_RETRY_WAIT_S = 60;
const PROBE_INTERVAL_MS = 60_000;
const PROBE_QUERY = '{ Media(id: 1) { id } }';

type GraphQLResponse = { data?: unknown; errors?: { message: string }[] };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class AnilistAuthError extends Error {}

let outage: string | null = null;
let probe: ReturnType<typeof setInterval> | null = null;

export const getAnilistOutage = () => outage;

// Keeps probing while down, since cached data can mean nothing else asks AniList for a while
function setOutage(message: string | null) {
    if (message === outage) return;
    if (message && !outage) log.warn('AniList is down:', message);
    if (!message) log.info('AniList is back up');
    outage = message;
    if (message) {
        probe ??= setInterval(
            () => void anilistRequest(PROBE_QUERY, {}).catch(() => undefined),
            PROBE_INTERVAL_MS
        );
    } else if (probe) {
        clearInterval(probe);
        probe = null;
    }
    sendToRenderer('anilist:outage', outage);
}

function stableStringify(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        const entries = Object.entries(value)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => a.localeCompare(b));
        return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

export async function anilistRequest(
    query: string,
    variables: unknown,
    token?: string,
    attempt = 0
): Promise<unknown> {
    let res: Response;
    try {
        res = await fetch(ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                ...(token && { Authorization: `Bearer ${token}` }),
            },
            body: JSON.stringify({ query, variables }),
        });
    } catch (err) {
        setOutage("The app couldn't connect to it.");
        throw err;
    }

    if (res.status === 429 && attempt < MAX_RETRIES) {
        const wait = Math.min(Number(res.headers.get('retry-after')) || 5, MAX_RETRY_WAIT_S);
        log.warn(`Rate limited, retrying in ${wait}s`);
        await sleep(wait * 1000);
        return anilistRequest(query, variables, token, attempt + 1);
    }

    const body = (await res.json().catch(() => null)) as GraphQLResponse | null;
    const message = body?.errors?.[0]?.message;
    // AniList answers 403 while its API is disabled
    const down = res.status >= 500 || res.status === 403;
    setOutage(down ? (message ?? `It answered with ${res.status}.`) : null);
    if (res.status === 404) return null;
    if (body?.errors?.length)
        log.debug(`AniList answered ${res.status}:`, JSON.stringify(body.errors));
    if (res.status === 401 || message === 'Invalid token') {
        throw new AnilistAuthError(message ?? 'AniList rejected the login');
    }
    if (!res.ok || body?.errors?.length) {
        throw new Error(message ?? `AniList request failed (${res.status})`);
    }
    return body?.data ?? null;
}

export function anilistCacheKey(query: string, variables: unknown): string {
    return createHash('sha1').update(query).update(stableStringify(variables)).digest('hex');
}

export function queryAnilist(
    query: string,
    variables: unknown,
    maxAge: number
): Promise<CachedResult<unknown>> {
    const key = `anilist:${anilistCacheKey(query, variables)}`;
    return cached(key, maxAge, () => anilistRequest(query, variables));
}
