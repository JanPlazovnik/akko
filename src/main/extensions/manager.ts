import {
    dbGetAllExtensions,
    dbGetEnabledExtensions,
    dbGetExtensionCode,
    dbInstallExtension,
    dbUninstallExtension,
    dbSetEnabled,
    dbUpdateExtensionCode,
    dbExtensionExists,
} from '../db';
import { loadExtension, unloadExtension, testExtension, searchExtension } from './sandbox';
import type { ExtensionInstance } from './sandbox';
import type {
    ExtensionManifest,
    InstalledExtension,
    SearchMethod,
    SearchParams,
    TorrentResult,
    ExtensionSearchResult,
    UpdateInfo,
} from './types';
import { createLogger } from '../logger';

const log = createLogger('extensions');

const instances = new Map<string, ExtensionInstance>();

async function loadTested(code: string): Promise<ExtensionInstance | null> {
    const instance = await loadExtension(code);
    const ok = await testExtension(instance).catch((err) => {
        unloadExtension(instance);
        throw err;
    });
    if (ok) return instance;
    unloadExtension(instance);
    return null;
}

function deactivate(id: string) {
    const current = instances.get(id);
    if (current) unloadExtension(current);
    instances.delete(id);
}

function activate(id: string, instance: ExtensionInstance) {
    deactivate(id);
    instances.set(id, instance);
}

async function search(
    id: string,
    instance: ExtensionInstance,
    method: SearchMethod,
    params: SearchParams
): Promise<TorrentResult[]> {
    log.debug(`running search() for ${id} with method ${method}`);
    const results = await searchExtension(instance, method, params);
    return results.map((r) => ({ ...r, extensionId: id }));
}

function semverGt(a: string, b: string): boolean {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
        if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
    }
    return false;
}

export async function initExtensions() {
    const extensions = dbGetEnabledExtensions();

    await Promise.allSettled(
        extensions.map(async (ext) => {
            try {
                const instance = await loadTested(ext.cachedCode);
                if (instance) {
                    activate(ext.id, instance);
                } else {
                    log.warn(`${ext.id} test() returned false - disabling`);
                    dbSetEnabled(ext.id, false);
                }
            } catch (err) {
                log.warn(`${ext.id} failed startup test:`, err);
                dbSetEnabled(ext.id, false);
            }
        })
    );

    log.info(`${instances.size}/${extensions.length} extensions active`);
}

export async function fetchRepository(url: string): Promise<ExtensionManifest[]> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch repository: ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Repository is not an array');
    return data as ExtensionManifest[];
}

export function listExtensions(): InstalledExtension[] {
    return dbGetAllExtensions().map((ext) => ({
        ...ext,
        hasUpdate: false,
    }));
}

export async function installExtension(manifest: ExtensionManifest): Promise<void> {
    if (dbExtensionExists(manifest.id))
        throw new Error(`Extension ${manifest.id} already installed`);

    log.info(`installing ${manifest.id} v${manifest.version}`);
    log.debug(`downloading code from ${manifest.code}`);
    const res = await fetch(manifest.code);
    if (!res.ok) throw new Error(`Failed to download extension code: ${res.status}`);
    const code = await res.text();
    log.debug(`code downloaded (${code.length} chars), loading sandbox`);

    const instance = await loadTested(code);
    if (!instance) throw new Error('Extension test() failed - not installing');

    log.debug(`test() passed, saving to DB`);
    dbInstallExtension(manifest, code);
    activate(manifest.id, instance);
    log.info(`${manifest.id} installed successfully`);
}

export function uninstallExtension(id: string) {
    dbUninstallExtension(id);
    deactivate(id);
    log.info(`${id} uninstalled`);
}

export async function toggleExtension(id: string, enabled: boolean): Promise<void> {
    log.info(`${enabled ? 'enabling' : 'disabling'} ${id}`);
    dbSetEnabled(id, enabled);

    if (enabled && !instances.has(id)) {
        const code = dbGetExtensionCode(id);
        if (!code) throw new Error('Cached code not found');

        log.debug(`${id}: loading sandbox and running test()`);
        const instance = await loadTested(code);
        if (!instance) {
            dbSetEnabled(id, false);
            log.warn(`${id}: test() failed, keeping disabled`);
            throw new Error('Extension test() failed - kept disabled');
        }
        activate(id, instance);
    } else if (!enabled) {
        deactivate(id);
    }
}

export async function checkUpdates(): Promise<UpdateInfo[]> {
    const installed = dbGetAllExtensions();
    log.info(`checking updates for ${installed.length} extension(s)`);

    const updateUrls = [...new Set(installed.map((e) => e.update))];
    log.debug(`fetching ${updateUrls.length} update URL(s):`, updateUrls);

    const remoteManifests = new Map<string, ExtensionManifest>();
    await Promise.allSettled(
        updateUrls.map(async (url) => {
            try {
                const manifests = await fetchRepository(url);
                log.debug(`${url} returned ${manifests.length} manifest(s)`);
                for (const m of manifests) remoteManifests.set(m.id, m);
            } catch (err) {
                log.warn(`failed to fetch update URL ${url}:`, err);
            }
        })
    );

    const updates: UpdateInfo[] = [];
    for (const ext of installed) {
        const remote = remoteManifests.get(ext.id);
        if (!remote) {
            log.debug(`${ext.id}: not found in remote, skipping`);
            continue;
        }
        log.debug(`${ext.id}: local v${ext.version}, remote v${remote.version}`);
        if (semverGt(remote.version, ext.version)) {
            log.info(`${ext.id}: update available ${ext.version} -> ${remote.version}`);
            updates.push({ id: ext.id, currentVersion: ext.version, newVersion: remote.version });
        } else {
            log.debug(`${ext.id}: up to date`);
        }
    }

    log.info(`update check done, ${updates.length} update(s) available`);
    return updates;
}

export async function updateExtension(
    id: string,
    newVersion: string,
    codeUrl: string
): Promise<void> {
    const res = await fetch(codeUrl);
    if (!res.ok) throw new Error(`Failed to download updated code: ${res.status}`);
    const code = await res.text();

    const instance = await loadTested(code);
    if (!instance) throw new Error('Updated extension test() failed - keeping old version');

    dbUpdateExtensionCode(id, newVersion, code);
    activate(id, instance);
}

export async function testExtensionById(id: string): Promise<boolean> {
    const instance = instances.get(id);
    if (!instance) throw new Error(`Extension ${id} not active`);
    log.debug(`running test() for ${id}`);
    const ok = await testExtension(instance);
    log.debug(`${id} test(): ${ok}`);
    return ok;
}

export async function searchOne(
    id: string,
    method: SearchMethod,
    params: SearchParams
): Promise<TorrentResult[]> {
    const instance = instances.get(id);
    if (!instance) throw new Error(`Extension ${id} not active`);
    return search(id, instance, method, params);
}

export async function searchAll(
    method: SearchMethod,
    params: SearchParams
): Promise<ExtensionSearchResult[]> {
    log.debug(`running searchAll() with method ${method}`);
    const active = [...instances.entries()];
    const results = await Promise.allSettled(
        active.map(([id, instance]) => search(id, instance, method, params))
    );

    log.debug(`searchAll() results:`, results);
    return results.map((r, i) => {
        const id = active[i][0];
        if (r.status === 'fulfilled') return { extensionId: id, results: r.value };
        log.warn(`${id} search() failed:`, r.reason);
        return { extensionId: id, results: [], error: String(r.reason) };
    });
}
