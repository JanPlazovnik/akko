import { ipcMain } from 'electron';
import { dbClearCache, dbCountCache } from '../db';
import { getAnilistOutage, queryAnilist } from '../metadata/anilist';
import { mutateAnilist, queryAnilistUser } from '../accounts/anilist';
import { fetchAniZipEpisodes } from '../metadata/anizip';
import { fetchLogo } from '../metadata/logos';

export function registerMetadataHandlers() {
    ipcMain.handle('anilist:query', (_e, query: string, variables: unknown, maxAge: number) =>
        queryAnilist(query, variables, maxAge)
    );
    ipcMain.handle('anilist:user-query', (_e, query: string, variables: unknown, maxAge: number) =>
        queryAnilistUser(query, variables, maxAge)
    );
    ipcMain.handle('anilist:mutate', (_e, query: string, variables: unknown) =>
        mutateAnilist(query, variables)
    );
    ipcMain.handle('anilist:outage', () => getAnilistOutage());
    ipcMain.handle('anizip:episodes', (_e, anilistId: number, maxAge: number) =>
        fetchAniZipEpisodes(anilistId, maxAge)
    );
    ipcMain.handle('metadata:logo', (_e, anilistId: number) => fetchLogo(anilistId));
    ipcMain.handle('cache:count', () => dbCountCache());
    ipcMain.handle('cache:clear', () => dbClearCache());
}
