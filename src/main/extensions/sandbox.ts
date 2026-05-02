import vm from 'node:vm';
import type { SearchMethod, SearchParams, TorrentResult } from './types';

const SANDBOX_TIMEOUT_MS = 3000;
const TEST_TIMEOUT_MS = 10000;
const SEARCH_TIMEOUT_MS = 15000;

interface ExtensionInstance {
    single?: (params: SearchParams) => Promise<TorrentResult[]>;
    batch?: (params: SearchParams) => Promise<TorrentResult[]>;
    movie?: (params: SearchParams) => Promise<TorrentResult[]>;
    test: () => Promise<boolean>;
}

function createContext() {
    return vm.createContext({
        fetch: globalThis.fetch,
        atob: globalThis.atob,
        btoa: globalThis.btoa,
        URL,
        URLSearchParams,
        console,
        setTimeout,
        clearTimeout,
        Promise,
        Error,
    });
}

function rejectAfter(ms: number): Promise<never> {
    return new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
    );
}

function normalizeError(e: unknown): Error {
    if (e instanceof Error) return new Error(e.message);
    return new Error(String(e));
}

export function loadExtension(code: string): ExtensionInstance {
    const transformed = code.replace(/^export\s+default\s+/m, '__ext = ');
    const ctx = createContext() as Record<string, unknown>;
    ctx.__ext = null;

    try {
        vm.runInContext(transformed, ctx as vm.Context, { timeout: SANDBOX_TIMEOUT_MS });
    } catch (e) {
        throw new Error(`Extension load failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    const instance = ctx.__ext as ExtensionInstance;
    if (!instance || typeof instance.test !== 'function') {
        throw new Error('Extension did not export a valid instance with test()');
    }

    return instance;
}

export async function testExtension(instance: ExtensionInstance): Promise<boolean> {
    try {
        return await Promise.race([instance.test(), rejectAfter(TEST_TIMEOUT_MS)]);
    } catch (e) {
        throw normalizeError(e);
    }
}

export async function searchExtension(
    instance: ExtensionInstance,
    method: SearchMethod,
    params: SearchParams
): Promise<TorrentResult[]> {
    const fn = instance[method];
    if (!fn) throw new Error(`Extension does not support method: ${method}`);

    let raw: TorrentResult[];
    try {
        console.log(`[extensions] running ${method}() with params:`, params);
        raw = await Promise.race([fn.call(instance, params), rejectAfter(SEARCH_TIMEOUT_MS)]);
    } catch (e) {
        throw normalizeError(e);
    }

    return raw.map((r) => {
        const date = r.date as unknown;
        return {
            ...r,
            date: date instanceof Date ? date.toISOString() : String(date),
        };
    });
}
