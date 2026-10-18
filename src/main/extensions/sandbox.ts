import { BrowserWindow } from 'electron';
import type { SearchMethod, SearchParams, TorrentResult } from './types';
import { getWindow } from '../context';
import { createLogger } from '../logger';

const log = createLogger('extensions:sandbox');

const LOAD_TIMEOUT_MS = 3000;
const TEST_TIMEOUT_MS = 10000;
const SEARCH_TIMEOUT_MS = 15000;
const PING_TIMEOUT_MS = 1000;

const HOST_SCRIPT = `
(() => {
    const extensions = new Map();
    const nativeFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = (input, init) => nativeFetch(input, { cache: 'no-store', ...init });
    const run = async (fn) => {
        try {
            return { value: await fn() };
        } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
        }
    };
    globalThis.__akko = {
        load: (key, code) => run(() => {
            const ext = new Function('let __ext;' + code.replace(/^export\\s+default\\s+/m, '__ext = ') + '\\nreturn __ext;')();
            if (!ext || typeof ext.test !== 'function') {
                throw new Error('Extension did not export a valid instance with test()');
            }
            extensions.set(key, ext);
        }),
        call: (key, method, params) => run(async () => {
            const ext = extensions.get(key);
            if (typeof ext?.[method] !== 'function') {
                throw new Error('Extension does not support method: ' + method);
            }
            return JSON.parse(JSON.stringify((await ext[method]({ fetch: globalThis.fetch, ...params })) ?? null));
        }),
        unload(key) {
            extensions.delete(key);
        },
    };
})();
`;

type Host = { window: BrowserWindow; loaded: Set<string> };

export type ExtensionInstance = { key: string };

const sources = new Map<string, string>();
let host: Promise<Host> | null = null;
let nextKey = 0;

async function createHost(): Promise<Host> {
    const window = new BrowserWindow({
        show: false,
        webPreferences: {
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false,
            partition: 'extensions',
            spellcheck: false,
        },
    });
    const { webContents } = window;
    webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    webContents.on('will-navigate', (event) => event.preventDefault());
    webContents.on('console-message', (_event, _level, message) => log.debug(message));
    getWindow().once('closed', () => window.destroy());

    await window.loadURL('about:blank');
    await webContents.executeJavaScript(HOST_SCRIPT);
    return { window, loaded: new Set() };
}

function getHost(): Promise<Host> {
    host ??= createHost().catch((err) => {
        host = null;
        throw err;
    });
    return host;
}

function destroyHost() {
    const current = host;
    host = null;
    void current?.then(({ window }) => window.destroy()).catch(() => undefined);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function normalizeError(e: unknown): Error {
    return new Error(e instanceof Error ? e.message : String(e));
}

async function execute(key: string, script: string | null, ms: number) {
    const current = await getHost();
    const { webContents } = current.window;
    const evaluate = async (source: string) => {
        const result = await webContents.executeJavaScript(source);
        if (result?.error !== undefined) throw new Error(result.error);
        return result?.value;
    };
    const run = async () => {
        if (!current.loaded.has(key)) {
            const code = JSON.stringify(sources.get(key));
            await evaluate(`__akko.load(${JSON.stringify(key)}, ${code})`);
            current.loaded.add(key);
        }
        return script ? evaluate(script) : undefined;
    };

    try {
        return await withTimeout(run(), ms);
    } catch (err) {
        const responsive = await withTimeout(webContents.executeJavaScript('1'), PING_TIMEOUT_MS)
            .then(() => true)
            .catch(() => false);
        if (!responsive) {
            log.warn('Extension host stopped responding, restarting');
            destroyHost();
        }
        throw normalizeError(err);
    }
}

function call(instance: ExtensionInstance, method: string, params: unknown, ms: number) {
    const args = [instance.key, method, params ?? null].map((v) => JSON.stringify(v)).join(', ');
    return execute(instance.key, `__akko.call(${args})`, ms);
}

export async function loadExtension(code: string): Promise<ExtensionInstance> {
    const instance = { key: String(++nextKey) };
    sources.set(instance.key, code);
    try {
        await execute(instance.key, null, LOAD_TIMEOUT_MS);
    } catch (e) {
        sources.delete(instance.key);
        throw new Error(`Extension load failed: ${normalizeError(e).message}`);
    }
    return instance;
}

export function unloadExtension(instance: ExtensionInstance) {
    sources.delete(instance.key);
    void host
        ?.then(({ window, loaded }) => {
            loaded.delete(instance.key);
            return window.webContents.executeJavaScript(
                `__akko.unload(${JSON.stringify(instance.key)})`
            );
        })
        .catch(() => undefined);
}

export async function testExtension(instance: ExtensionInstance): Promise<boolean> {
    return Boolean(await call(instance, 'test', null, TEST_TIMEOUT_MS));
}

export async function searchExtension(
    instance: ExtensionInstance,
    method: SearchMethod,
    params: SearchParams
): Promise<TorrentResult[]> {
    const raw: TorrentResult[] = (await call(instance, method, params, SEARCH_TIMEOUT_MS)) ?? [];
    return raw.map((r) => ({ ...r, date: String(r.date) }));
}
