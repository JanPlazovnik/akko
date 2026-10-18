import type {
    ExtensionManifest,
    ExtensionSearchResult,
    InstalledExtension,
    SearchMethod,
    SearchParams,
    TorrentResult,
    UpdateInfo,
} from '../../main/extensions/types';
import type { SubtitleEvent } from '../subtitles';
import type { AniZipResponse, EpisodeNumbers } from '../anizip/types';

export type SubtitleTrack = {
    id: string;
    lang: string;
    label: string;
    header: string;
};

export const LOG_LEVELS = ['error', 'warn', 'info', 'verbose', 'debug', 'silly'] as const;
export const TITLE_LANGUAGES = ['ANILIST', 'ROMAJI', 'ENGLISH', 'NATIVE'] as const;

export type AppSettings = {
    logLevel: (typeof LOG_LEVELS)[number];
    logToFile: boolean;
    subtitleLanguage: string;
    downloadPath: string | null;
    keepFiles: boolean;
    downloadLimit: number;
    uploadLimit: number;
    maxConnections: number;
    onboarded: boolean;
    titleLanguage: (typeof TITLE_LANGUAGES)[number];
    syncProgress: boolean;
};

export type SettingsPaths = {
    defaultDownloadPath: string;
    logFile: string;
};

export type FolderCheck =
    | { writable: true; freeBytes: number; inMemory: boolean }
    | { writable: false; error: string };

export const HEALTHY_DHT_NODES = 8;

export type NetworkCheck = { trackersReached: number; trackersTotal: number; dhtNodes: number };

export type AnilistAccount = {
    id: number;
    name: string;
    avatar: string | null;
    scoreFormat: string;
    titleLanguage: string;
    expiresAt: number;
};

export type Accounts = {
    anilist: AnilistAccount | null;
};

export type CachedResult<T> = {
    data: T;
    age: number;
    fromCache: boolean;
};

export type AudioSupport = 'native' | 'decoded' | 'none';

export type AudioTrack = {
    lang: string;
    label: string;
    codec: string;
    channels: number;
    support: AudioSupport;
};

export type SubtitleBatch = Record<string, SubtitleEvent[]>;

export type StreamStats = {
    downloadSpeed: number;
    uploadSpeed: number;
    peers: number;
    progress: number;
    downloaded: number;
    size: number;
};

// single: the torrent has one video. fallback: none matched the episode, so the largest was used.
export type FileMatch = 'single' | 'episode' | 'fallback';

export type StreamStartResult = {
    torrentId: string;
    match: FileMatch;
    streamUrl: string;
    tracks: SubtitleTrack[];
    audioTracks: AudioTrack[];
};

export type RendererEventMap = {
    'stream:subtitles': [torrentId: string, batch: SubtitleBatch];
    'stream:fonts': [torrentId: string, fonts: Uint8Array[]];
    'stream:stats': [torrentId: string, stats: StreamStats];
    'accounts:changed': [accounts: Accounts];
};

export type RendererEventListener<K extends keyof RendererEventMap> = (
    ...args: RendererEventMap[K]
) => void;

export type AppApi = {
    startStream: (magnet: string, episode?: EpisodeNumbers) => Promise<StreamStartResult>;
    stopStream: (torrentId: string | null) => Promise<void>;
    checkNetwork: () => Promise<NetworkCheck>;
    on: <K extends keyof RendererEventMap>(
        channel: K,
        listener: RendererEventListener<K>
    ) => () => void;
    metadata: {
        anilist: (
            query: string,
            variables: unknown,
            maxAge: number
        ) => Promise<CachedResult<unknown>>;
        anilistUser: (
            query: string,
            variables: unknown,
            maxAge: number
        ) => Promise<CachedResult<unknown>>;
        anilistMutate: (query: string, variables: unknown) => Promise<unknown>;
        anizipEpisodes: (
            anilistId: number,
            maxAge: number
        ) => Promise<CachedResult<AniZipResponse | null>>;
        cacheCount: () => Promise<number>;
        clearCache: () => Promise<void>;
    };
    accounts: {
        get: () => Promise<Accounts>;
        loginAnilist: () => Promise<AnilistAccount>;
        logoutAnilist: () => Promise<void>;
    };
    settings: {
        get: () => Promise<AppSettings>;
        update: (patch: Partial<AppSettings>) => Promise<AppSettings>;
        paths: () => Promise<SettingsPaths>;
        chooseFolder: (current: string) => Promise<string | null>;
        checkFolder: (folder: string) => Promise<FolderCheck>;
        openDownloads: () => Promise<void>;
        openLogs: () => Promise<void>;
    };
    minimizeWindow: () => void;
    maximizeWindow: () => void;
    closeWindow: () => void;
    extensions: {
        list: () => Promise<InstalledExtension[]>;
        fetchRepository: (url: string) => Promise<ExtensionManifest[]>;
        install: (manifest: ExtensionManifest) => Promise<void>;
        uninstall: (id: string) => Promise<void>;
        toggle: (id: string, enabled: boolean) => Promise<void>;
        checkUpdates: () => Promise<UpdateInfo[]>;
        test: (id: string) => Promise<boolean>;
        update: (id: string, newVersion: string, codeUrl: string) => Promise<void>;
        search: (
            id: string,
            method: SearchMethod,
            params: SearchParams
        ) => Promise<TorrentResult[]>;
        searchAll: (method: SearchMethod, params: SearchParams) => Promise<ExtensionSearchResult[]>;
    };
};
