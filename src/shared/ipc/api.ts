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
import type { AniZipResponse } from '../anizip/types';

export type SubtitleTrack = {
    id: string;
    lang: string;
    label: string;
    header: string;
};

export const LOG_LEVELS = ['error', 'warn', 'info', 'verbose', 'debug', 'silly'] as const;

export type AppSettings = {
    logLevel: (typeof LOG_LEVELS)[number];
    logToFile: boolean;
    subtitleLanguage: string;
    downloadPath: string | null;
    keepFiles: boolean;
    downloadLimit: number;
    uploadLimit: number;
    maxConnections: number;
};

export type SettingsPaths = {
    defaultDownloadPath: string;
    logFile: string;
};

export type CachedResult<T> = {
    data: T;
    age: number;
    fromCache: boolean;
};

export type AudioTrack = {
    lang: string;
    label: string;
    codec: string;
    channels: number;
    supported: boolean;
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

export type StreamStartResult = {
    torrentId: string;
    streamUrl: string;
    tracks: SubtitleTrack[];
    audioTracks: AudioTrack[];
};

export type RendererEventMap = {
    'stream:subtitles': [torrentId: string, batch: SubtitleBatch];
    'stream:fonts': [torrentId: string, fonts: Uint8Array[]];
    'stream:stats': [torrentId: string, stats: StreamStats];
};

export type RendererEventListener<K extends keyof RendererEventMap> = (
    ...args: RendererEventMap[K]
) => void;

export type AppApi = {
    startStream: (magnet: string, episode?: number) => Promise<StreamStartResult>;
    stopStream: (torrentId: string | null) => Promise<void>;
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
        anizipEpisodes: (
            anilistId: number,
            maxAge: number
        ) => Promise<CachedResult<AniZipResponse | null>>;
        cacheCount: () => Promise<number>;
        clearCache: () => Promise<void>;
    };
    settings: {
        get: () => Promise<AppSettings>;
        update: (patch: Partial<AppSettings>) => Promise<AppSettings>;
        paths: () => Promise<SettingsPaths>;
        chooseFolder: (current: string) => Promise<string | null>;
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
