interface Window {
    api: {
        startStream: (magnet: string) => Promise<{
            torrentId: string;
            streamUrl: string;
            mimeType: string;
            tracks: Array<{
                trackNumber: string;
                lang: string;
                label: string;
                format: 'vtt' | 'ass';
                header: string;
                fonts: string[];
            }>;
            sidecarTracks: Array<{
                lang: string;
                label: string;
                format: 'vtt';
                content: string;
            }>;
        }>;
        stopStream: (torrentId: string) => Promise<void>;
        onSubtitle: (
            cb: (
                sub: {
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
                },
                trackNumber: string
            ) => void
        ) => void;
        offSubtitle: () => void;
        minimizeWindow: () => void;
        maximizeWindow: () => void;
        closeWindow: () => void;

        extensions: {
            list: () => Promise<import('../../main/extensions/types').InstalledExtension[]>;
            fetchRepository: (
                url: string
            ) => Promise<import('../../main/extensions/types').ExtensionManifest[]>;
            install: (
                manifest: import('../../main/extensions/types').ExtensionManifest
            ) => Promise<void>;
            uninstall: (id: string) => Promise<void>;
            toggle: (id: string, enabled: boolean) => Promise<void>;
            checkUpdates: () => Promise<import('../../main/extensions/types').UpdateInfo[]>;
            test: (id: string) => Promise<boolean>;
            update: (id: string, newVersion: string, codeUrl: string) => Promise<void>;
            search: (
                id: string,
                method: import('../../main/extensions/types').SearchMethod,
                params: import('../../main/extensions/types').SearchParams
            ) => Promise<import('../../main/extensions/types').TorrentResult[]>;
            searchAll: (
                method: import('../../main/extensions/types').SearchMethod,
                params: import('../../main/extensions/types').SearchParams
            ) => Promise<import('../../main/extensions/types').ExtensionSearchResult[]>;
        };
    };
}
