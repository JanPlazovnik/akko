import { ClientError, GraphQLClient } from 'graphql-request';
import { VariablesOf, ResultOf } from '@shared/graphql/graphql';
import { createLogger } from './logger';

const log = createLogger('anilist');

const DEFAULT_TTL_MS = 1000 * 60 * 10;

interface CacheEntry {
    data: any;
    expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export interface CachedResult<T> {
    data: T | null;
    fromCache: boolean;
    duration: number;
}

export class AnilistClient extends GraphQLClient {
    private token: string | null = null;

    constructor() {
        super('https://graphql.anilist.co', {
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        });
    }

    setToken(token: string | null) {
        this.token = token;
        this.setHeaders({
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        });
    }

    clearCache() {
        cache.clear();
    }

    async query<TQuery>(
        query: TQuery,
        variables?: VariablesOf<TQuery>,
        cacheKey?: string
    ): Promise<CachedResult<ResultOf<TQuery>>> {
        const key = JSON.stringify({
            cacheKey: cacheKey ?? (query as any).definitions?.[0]?.name?.value,
            variables,
        });

        const start = performance.now();

        const cached = cache.get(key);
        if (cached && Date.now() < cached.expiresAt) {
            return {
                data: cached.data,
                fromCache: true,
                duration: performance.now() - start,
            };
        }

        try {
            const data = await super.request<ResultOf<TQuery>, any>(query as any, variables);
            const duration = performance.now() - start;

            if (data && Object.values(data as object).some((v) => v != null)) {
                cache.set(key, { data, expiresAt: Date.now() + DEFAULT_TTL_MS });
            }

            return { data, fromCache: false, duration };
        } catch (err) {
            const duration = performance.now() - start;
            log.error('Request failed', { err, variables });

            if (err instanceof ClientError) {
                const status = err.response?.status ?? 0;
                if (status === 404) return { data: null, fromCache: false, duration };
                throw err;
            }

            throw err;
        }
    }

    async mutate<TMutation>(
        mutation: TMutation,
        variables?: VariablesOf<TMutation>
    ): Promise<ResultOf<TMutation>> {
        return super.request<ResultOf<TMutation>, any>(mutation as any, variables);
    }
}

export const anilistClient = new AnilistClient();
