import {
    dbGetAllExtensions,
    dbGetEnabledExtensions,
    dbGetExtensionCode,
    dbInstallExtension,
    dbUninstallExtension,
    dbSetEnabled,
    dbUpdateExtensionCode,
    dbExtensionExists,
} from './db';
import { loadExtension, testExtension, searchExtension } from './sandbox';
import type {
    ExtensionManifest,
    InstalledExtension,
    SearchMethod,
    SearchParams,
    TorrentResult,
    ExtensionSearchResult,
    UpdateInfo,
} from './types';

type ExtensionInstance = ReturnType<typeof loadExtension>;

const instances = new Map<string, ExtensionInstance>();

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
                const instance = loadExtension(ext.cachedCode);
                const ok = await testExtension(instance);
                if (ok) {
                    instances.set(ext.id, instance);
                } else {
                    console.warn(`[extensions] ${ext.id} test() returned false - disabling`);
                    dbSetEnabled(ext.id, false);
                }
            } catch (err) {
                console.warn(`[extensions] ${ext.id} failed startup test:`, err);
                dbSetEnabled(ext.id, false);
            }
        })
    );

    console.log(`[extensions] ${instances.size}/${extensions.length} extensions active`);
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

    console.log(`[extensions] installing ${manifest.id} v${manifest.version}`);
    console.log(`[extensions] downloading code from ${manifest.code}`);
    const res = await fetch(manifest.code);
    if (!res.ok) throw new Error(`Failed to download extension code: ${res.status}`);
    const code = await res.text();
    console.log(`[extensions] code downloaded (${code.length} chars), loading sandbox`);

    const instance = loadExtension(code);
    console.log(`[extensions] sandbox loaded, running test()`);
    const ok = await testExtension(instance);
    if (!ok) throw new Error('Extension test() failed - not installing');

    console.log(`[extensions] test() passed, saving to DB`);
    dbInstallExtension(manifest, code);
    instances.set(manifest.id, instance);
    console.log(`[extensions] ${manifest.id} installed successfully`);
}

export function uninstallExtension(id: string) {
    console.log(`[extensions] removing ${id}`);
    dbUninstallExtension(id);
    instances.delete(id);
    console.log(`[extensions] ${id} removed`);
}

export async function toggleExtension(id: string, enabled: boolean): Promise<void> {
    console.log(`[extensions] ${enabled ? 'enabling' : 'disabling'} ${id}`);
    dbSetEnabled(id, enabled);

    if (enabled && !instances.has(id)) {
        const code = dbGetExtensionCode(id);
        if (!code) throw new Error('Cached code not found');

        console.log(`[extensions] ${id}: loading sandbox and running test()`);
        const instance = loadExtension(code);
        const ok = await testExtension(instance);
        if (!ok) {
            dbSetEnabled(id, false);
            console.warn(`[extensions] ${id}: test() failed, keeping disabled`);
            throw new Error('Extension test() failed - kept disabled');
        }
        instances.set(id, instance);
        console.log(`[extensions] ${id}: enabled`);
    } else if (!enabled) {
        instances.delete(id);
        console.log(`[extensions] ${id}: disabled, instance unloaded`);
    }
}

export async function checkUpdates(): Promise<UpdateInfo[]> {
    const installed = dbGetAllExtensions();
    console.log(`[extensions] checking updates for ${installed.length} extension(s)`);

    const updateUrls = [...new Set(installed.map((e) => e.update))];
    console.log(`[extensions] fetching ${updateUrls.length} update URL(s):`, updateUrls);

    const remoteManifests = new Map<string, ExtensionManifest>();
    await Promise.allSettled(
        updateUrls.map(async (url) => {
            try {
                const manifests = await fetchRepository(url);
                console.log(`[extensions] ${url} returned ${manifests.length} manifest(s)`);
                for (const m of manifests) remoteManifests.set(m.id, m);
            } catch (err) {
                console.warn(`[extensions] failed to fetch update URL ${url}:`, err);
            }
        })
    );

    const updates: UpdateInfo[] = [];
    for (const ext of installed) {
        const remote = remoteManifests.get(ext.id);
        if (!remote) {
            console.log(`[extensions] ${ext.id}: not found in remote, skipping`);
            continue;
        }
        console.log(`[extensions] ${ext.id}: local v${ext.version}, remote v${remote.version}`);
        if (semverGt(remote.version, ext.version)) {
            console.log(
                `[extensions] ${ext.id}: update available ${ext.version} -> ${remote.version}`
            );
            updates.push({ id: ext.id, currentVersion: ext.version, newVersion: remote.version });
        } else {
            console.log(`[extensions] ${ext.id}: up to date`);
        }
    }

    console.log(`[extensions] update check done, ${updates.length} update(s) available`);
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

    const instance = loadExtension(code);
    const ok = await testExtension(instance);
    if (!ok) throw new Error('Updated extension test() failed - keeping old version');

    dbUpdateExtensionCode(id, newVersion, code);
    instances.set(id, instance);
}

export async function testExtensionById(id: string): Promise<boolean> {
    const instance = instances.get(id);
    if (!instance) throw new Error(`Extension ${id} not active`);
    console.log(`[extensions] running test() for ${id}`);
    const ok = await testExtension(instance);
    console.log(`[extensions] ${id} test(): ${ok}`);
    return ok;
}

export async function searchOne(
    id: string,
    method: SearchMethod,
    params: SearchParams
): Promise<TorrentResult[]> {
    const instance = instances.get(id);
    if (!instance) throw new Error(`Extension ${id} not active`);
    return searchExtension(instance, method, params);
}

export async function searchAll(
    method: SearchMethod,
    params: SearchParams
): Promise<ExtensionSearchResult[]> {
    const results = await Promise.allSettled(
        [...instances.entries()].map(async ([id, instance]) => {
            const results = await searchExtension(instance, method, params);
            return { extensionId: id, results };
        })
    );

    return results.map((r, i) => {
        const id = [...instances.keys()][i];
        if (r.status === 'fulfilled') return r.value;
        return { extensionId: id, results: [], error: String(r.reason) };
    });
}
