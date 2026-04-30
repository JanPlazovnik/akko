import { initGraphQLTada } from 'gql.tada';
import type { introspection } from './graphql-env.ts';

export const graphql = initGraphQLTada<{
    introspection: introspection;
    scalars: {
        Int: number;
        Float: number;
        Boolean: boolean;
        String: string;
        ID: string;
        Json: any;
        // ISO 3166-1 alpha-2 country code
        CountryCode: string;
        // 8 digit long date integer (YYYYMMDD).
        // Unknown dates represented by 0. E.g. 2016: 20160000, May 1976: 19760500
        FuzzyDateInt: number;
    };
}>();

export type { FragmentOf, ResultOf, VariablesOf } from 'gql.tada';
export { readFragment } from 'gql.tada';

export interface AiringSchedule {
    episode: number;
    airingAt: number;
    timeUntilAiring: number;
}

export interface FuzzyDate {
    year?: number | null;
    month?: number | null;
    day?: number | null;
}
