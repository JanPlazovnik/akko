import { ipcMain } from 'electron';
import type { AppSettings } from '../../shared/ipc/api';
import { dbGetSettings } from '../db';
import {
    checkFolder,
    chooseFolder,
    openDownloads,
    openLogs,
    settingsPaths,
    updateSettings,
} from '../settings';

export function registerSettingsHandlers() {
    ipcMain.handle('settings:get', () => dbGetSettings());
    ipcMain.handle('settings:update', (_e, patch: Partial<AppSettings>) => updateSettings(patch));
    ipcMain.handle('settings:paths', () => settingsPaths());
    ipcMain.handle('settings:choose-folder', (_e, current: string) => chooseFolder(current));
    ipcMain.handle('settings:check-folder', (_e, folder: string) => checkFolder(folder));
    ipcMain.handle('settings:open-downloads', () => openDownloads());
    ipcMain.handle('settings:open-logs', () => openLogs());
}
