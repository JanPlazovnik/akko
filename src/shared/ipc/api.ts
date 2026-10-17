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

export type SubtitleTrack = {
    id: string;
    lang: string;
    label: string;
    header: string;
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
