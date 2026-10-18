import { ipcMain } from 'electron';
import { dbClearCache, dbCountCache } from '../db';
import { queryAnilist } from '../metadata/anilist';
import { queryAnilistUser } from '../accounts/anilist';
import { fetchAniZipEpisodes } from '../metadata/anizip';

export function registerMetadataHandlers() {
    ipcMain.handle('anilist:query', (_e, query: string, variables: unknown, maxAge: number) =>
        queryAnilist(query, variables, maxAge)
    );
    ipcMain.handle('anilist:user-query', (_e, query: string, variables: unknown, maxAge: number) =>
        queryAnilistUser(query, variables, maxAge)
    );
    ipcMain.handle('anizip:episodes', (_e, anilistId: number, maxAge: number) =>
        fetchAniZipEpisodes(anilistId, maxAge)
    );
    ipcMain.handle('cache:count', () => dbCountCache());
    ipcMain.handle('cache:clear', () => dbClearCache());
}
