import { ipcMain } from 'electron';
import { createLogger } from '../logger';

const log = createLogger('extensions:ipc');
import {
    fetchRepository,
    listExtensions,
    installExtension,
    uninstallExtension,
    toggleExtension,
    checkUpdates,
    updateExtension,
    testExtensionById,
    searchOne,
    searchAll,
} from '../extensions/manager';
import type { ExtensionManifest, SearchMethod, SearchParams } from '../extensions/types';

function wrap<T>(fn: () => Promise<T>): Promise<T> {
    return fn().catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        log.error('IPC error:', msg);
        throw new Error(msg);
    });
}

export function registerExtensionHandlers() {
    ipcMain.handle('extension:list', () => wrap(() => Promise.resolve(listExtensions())));

    ipcMain.handle('extension:fetch-repository', (_e, url: string) =>
        wrap(() => fetchRepository(url))
    );

    ipcMain.handle('extension:install', (_e, manifest: ExtensionManifest) =>
        wrap(() => installExtension(manifest))
    );

    ipcMain.handle('extension:uninstall', (_e, id: string) =>
        wrap(() => Promise.resolve(uninstallExtension(id)))
    );

    ipcMain.handle('extension:toggle', (_e, id: string, enabled: boolean) =>
        wrap(() => toggleExtension(id, enabled))
    );

    ipcMain.handle('extension:check-updates', () => wrap(() => checkUpdates()));

    ipcMain.handle('extension:test', (_e, id: string) => wrap(() => testExtensionById(id)));

    ipcMain.handle('extension:update', (_e, id: string, newVersion: string, codeUrl: string) =>
        wrap(() => updateExtension(id, newVersion, codeUrl))
    );

    ipcMain.handle(
        'extension:search',
        (_e, id: string, method: SearchMethod, params: SearchParams) =>
            wrap(() => searchOne(id, method, params))
    );

    ipcMain.handle('extension:search-all', (_e, method: SearchMethod, params: SearchParams) =>
        wrap(() => searchAll(method, params))
    );
}
