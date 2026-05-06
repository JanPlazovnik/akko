import type {
    ExtensionManifest,
    ExtensionSearchResult,
    InstalledExtension,
    SearchMethod,
    SearchParams,
    TorrentResult,
    UpdateInfo,
} from '../../main/extensions/types';

export type StreamTrackInfo = {
    trackNumber: string;
    lang: string;
    label: string;
    format: 'vtt' | 'ass';
    header: string;
    fonts: string[];
};

export type StreamSidecarTrack = {
    lang: string;
    label: string;
    format: 'vtt';
    content: string;
};

export type StreamSubtitleCue = {
    text: string;
    time: number;
    duration: number;
    readOrder?: string;
    layer?: string;
    style?: string;
    name?: string;
    marginL?: string;
    marginR?: string;
    marginV?: string;
    effect?: string;
};

export type StreamStartResult = {
    torrentId: string;
    streamUrl: string;
    mimeType: string;
    tracks: StreamTrackInfo[];
    sidecarTracks: StreamSidecarTrack[];
};

export type RendererEventMap = {
    'stream:subtitle': [StreamSubtitleCue, string];
};

export type AppApi = {
    startStream: (magnet: string) => Promise<StreamStartResult>;
    stopStream: (torrentId: string) => Promise<void>;
    onSubtitle: (cb: (sub: StreamSubtitleCue, trackNumber: string) => void) => void;
    offSubtitle: () => void;
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
