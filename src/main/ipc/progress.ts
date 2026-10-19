import { ipcMain } from 'electron';
import type { WatchProgress } from '../../shared/ipc/api';
import { dbGetWatchProgress, dbSaveWatchProgress } from '../db';

export function registerProgressHandlers() {
    ipcMain.handle('progress:all', () => dbGetWatchProgress());
    ipcMain.on('progress:save', (_e, progress: WatchProgress) => dbSaveWatchProgress(progress));
}
