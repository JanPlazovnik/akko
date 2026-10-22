import { ipcMain } from 'electron';
import { dbClearCache, dbCountCache } from '../db';
import { getAnilistOutage, queryAnilist } from '../metadata/anilist';
import { mutateAnilist, queryAnilistUser } from '../accounts/anilist';
import { fetchAniZipEpisodes } from '../metadata/anizip';
import { fetchArt } from '../metadata/art';
import { fetchSkipTimes } from '../metadata/aniskip';

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
    ipcMain.handle('metadata:art', (_e, anilistId: number) => fetchArt(anilistId));
    ipcMain.handle(
        'metadata:skip-times',
        (_e, anilistId: number, episode: number, duration: number) =>
            fetchSkipTimes(anilistId, episode, duration)
    );
    ipcMain.handle('cache:count', () => dbCountCache());
    ipcMain.handle('cache:clear', () => dbClearCache());
}
