import { BrowserWindow, safeStorage, session } from 'electron';
import { print } from 'graphql';
import type { AnilistAccount, CachedResult } from '../../shared/ipc/api';
import type { ResultOf } from '../../shared/graphql/graphql';
import { ViewerQuery } from '../../shared/graphql/queries';
import { getWindow, sendToRenderer } from '../context';
import { cached } from '../cache';
import {
    dbClearCacheByPrefix,
    dbDeleteAccount,
    dbGetAccount,
    dbSaveAccount,
    type AccountRow,
} from '../db';
import { createLogger } from '../logger';
import { AnilistAuthError, anilistCacheKey, anilistRequest } from '../metadata/anilist';

const log = createLogger('accounts');

const PROVIDER = 'anilist';
const CLIENT_ID = '54213';
const AUTHORIZE_URL = `https://anilist.co/api/v2/oauth/authorize?client_id=${CLIENT_ID}&response_type=token`;
const PARTITION = 'persist:anilist';
const USER_CACHE_PREFIX = 'anilist-user:';
const DEFAULT_EXPIRY_S = 365 * 24 * 60 * 60;

type Viewer = NonNullable<ResultOf<typeof ViewerQuery>['Viewer']>;

let pendingLogin: Promise<AnilistAccount> | null = null;

function toAccount(row: AccountRow): AnilistAccount {
    return {
        id: row.userId,
        name: row.name,
        avatar: row.avatar,
        scoreFormat: row.scoreFormat,
        titleLanguage: row.titleLanguage,
        expiresAt: row.expiresAt,
    };
}

function notify() {
    sendToRenderer('accounts:changed', { anilist: getAnilistAccount() });
}

const isExpired = (row: AccountRow) => row.expiresAt <= Date.now();

// Expired accounts are kept so the app can ask to reconnect instead of silently signing out
export function getAnilistAccount(): AnilistAccount | null {
    const row = dbGetAccount(PROVIDER);
    return row ? toAccount(row) : null;
}

function saveViewer(viewer: Viewer, token: Buffer, expiresAt: number): AnilistAccount {
    const row: AccountRow = {
        provider: PROVIDER,
        userId: viewer.id,
        name: viewer.name,
        avatar: viewer.avatar?.medium ?? null,
        scoreFormat: viewer.mediaListOptions?.scoreFormat ?? 'POINT_10',
        titleLanguage: viewer.options?.titleLanguage ?? 'ROMAJI',
        token,
        expiresAt,
    };
    dbSaveAccount(row);
    return toAccount(row);
}

type Send = (query: string, variables: unknown) => Promise<unknown>;

async function fetchViewer(send: Send): Promise<Viewer> {
    const data = (await send(print(ViewerQuery), {})) as ResultOf<typeof ViewerQuery> | null;
    if (!data?.Viewer) throw new Error("Couldn't load your AniList profile");
    return data.Viewer;
}

// A revoked token is treated like an expired one, so the app asks to reconnect
function expire(row: AccountRow) {
    dbSaveAccount({ ...row, expiresAt: Date.now() });
    notify();
}

export async function anilistUserRequest(query: string, variables: unknown): Promise<unknown> {
    const row = dbGetAccount(PROVIDER);
    if (!row) throw new Error('Not connected to AniList');
    if (isExpired(row)) throw new Error('Your AniList login expired, reconnect it in Settings');
    const token = safeStorage.decryptString(row.token);
    try {
        return await anilistRequest(query, variables, token);
    } catch (err) {
        if (!(err instanceof AnilistAuthError)) throw err;
        // AniList occasionally rejects a valid token, so only expire it if the profile fails too
        const stillValid = await anilistRequest(print(ViewerQuery), {}, token).then(
            Boolean,
            () => false
        );
        if (!stillValid) {
            log.warn('AniList rejected the token:', err.message);
            expire(row);
            throw err;
        }
        log.warn('AniList rejected a valid token, retrying once:', err.message);
        return anilistRequest(query, variables, token);
    }
}

// Cached per user; served stale when offline or after the login expires
export function queryAnilistUser(
    query: string,
    variables: unknown,
    maxAge: number
): Promise<CachedResult<unknown>> {
    const row = dbGetAccount(PROVIDER);
    if (!row) return Promise.reject(new Error('Not connected to AniList'));
    const key = `${USER_CACHE_PREFIX}${row.userId}:${anilistCacheKey(query, variables)}`;
    return cached(key, maxAge, () => anilistUserRequest(query, variables));
}

// Clears the user's cached queries so nothing stale is served after the change
export async function mutateAnilist(query: string, variables: unknown): Promise<unknown> {
    const result = await anilistUserRequest(query, variables);
    const row = dbGetAccount(PROVIDER);
    if (row) dbClearCacheByPrefix(`${USER_CACHE_PREFIX}${row.userId}:`);
    return result;
}

// The implicit grant redirects to the client's redirect URL with the token in the fragment.
// The window never needs to load that URL: the token is read from the navigation itself.
function authorize(): Promise<{ token: string; expiresIn: number }> {
    return new Promise((resolve, reject) => {
        const win = new BrowserWindow({
            parent: getWindow(),
            modal: true,
            width: 480,
            height: 720,
            title: 'Connect AniList',
            autoHideMenuBar: true,
            backgroundColor: '#0b1622',
            show: false,
            webPreferences: { partition: PARTITION, sandbox: true },
        });
        let settled = false;

        const capture = (url: string) => {
            if (settled) return true;
            const params = new URLSearchParams(new URL(url).hash.slice(1));
            const token = params.get('access_token');
            if (!token) return false;
            settled = true;
            resolve({ token, expiresIn: Number(params.get('expires_in')) || DEFAULT_EXPIRY_S });
            win.close();
            return true;
        };
        const intercept = (event: Electron.Event, url: string) => {
            if (capture(url)) event.preventDefault();
        };

        win.webContents.on('will-redirect', intercept);
        win.webContents.on('will-navigate', intercept);
        win.webContents.on('did-navigate', (_event, url) => capture(url));
        win.webContents.on('did-navigate-in-page', (_event, url) => capture(url));
        win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        win.once('ready-to-show', () => win.show());
        win.on('closed', () => {
            if (!settled) reject(new Error('Login cancelled'));
        });
        win.loadURL(AUTHORIZE_URL).catch((err) => {
            if (!settled) log.warn('AniList login page failed to load:', err);
        });
    });
}

async function login(): Promise<AnilistAccount> {
    if (!CLIENT_ID) throw new Error('No AniList client ID is configured');
    if (!safeStorage.isEncryptionAvailable()) {
        throw new Error("Secure storage isn't available, so the login can't be saved");
    }
    if (safeStorage.getSelectedStorageBackend?.() === 'basic_text') {
        log.warn('No system keyring found, the AniList token is only obfuscated on disk');
    }

    const { token, expiresIn } = await authorize();
    const viewer = await fetchViewer((query, variables) => anilistRequest(query, variables, token));
    const account = saveViewer(
        viewer,
        safeStorage.encryptString(token),
        Date.now() + expiresIn * 1000
    );
    log.info(`Connected AniList as ${viewer.name} (${viewer.id})`);
    notify();
    return account;
}

export function loginAnilist(): Promise<AnilistAccount> {
    pendingLogin ??= login().finally(() => (pendingLogin = null));
    return pendingLogin;
}

export async function logoutAnilist() {
    dbDeleteAccount(PROVIDER);
    dbClearCacheByPrefix(USER_CACHE_PREFIX);
    notify();
    await session.fromPartition(PARTITION).clearStorageData();
    log.info('Disconnected AniList');
}

// Picks up profile changes and notices a token revoked on AniList's side
export async function refreshAnilistAccount() {
    const row = dbGetAccount(PROVIDER);
    if (!row) return;
    if (isExpired(row)) {
        log.warn(`AniList login expired on ${new Date(row.expiresAt).toISOString()}`);
        return;
    }
    try {
        const viewer = await fetchViewer(anilistUserRequest);
        saveViewer(viewer, row.token, row.expiresAt);
        notify();
        log.debug(`AniList account ${viewer.name} (${viewer.id}) is valid`);
    } catch (err) {
        if (!(err instanceof AnilistAuthError)) log.warn('Failed to refresh AniList account:', err);
    }
}
