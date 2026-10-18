import { createHash } from 'node:crypto';
import type { CachedResult } from '../../shared/ipc/api';
import { cached } from '../cache';
import { createLogger } from '../logger';

const log = createLogger('anilist');

const ENDPOINT = 'https://graphql.anilist.co';
const MAX_RETRIES = 2;
const MAX_RETRY_WAIT_S = 60;

type GraphQLResponse = { data?: unknown; errors?: { message: string }[] };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class AnilistAuthError extends Error {}

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
    const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ query, variables }),
    });

    if (res.status === 429 && attempt < MAX_RETRIES) {
        const wait = Math.min(Number(res.headers.get('retry-after')) || 5, MAX_RETRY_WAIT_S);
        log.warn(`Rate limited, retrying in ${wait}s`);
        await sleep(wait * 1000);
        return anilistRequest(query, variables, token, attempt + 1);
    }

    if (res.status === 404) return null;
    const body = (await res.json().catch(() => null)) as GraphQLResponse | null;
    const message = body?.errors?.[0]?.message;
    if (res.status === 401 || message === 'Invalid token') {
        throw new AnilistAuthError(message ?? 'AniList rejected the login');
    }
    if (!res.ok || body?.errors?.length) {
        throw new Error(message ?? `AniList request failed (${res.status})`);
    }
    return body?.data ?? null;
}

export function queryAnilist(
    query: string,
    variables: unknown,
    maxAge: number
): Promise<CachedResult<unknown>> {
    const hash = createHash('sha1').update(query).update(stableStringify(variables)).digest('hex');
    return cached(`anilist:${hash}`, maxAge, () => anilistRequest(query, variables));
}
