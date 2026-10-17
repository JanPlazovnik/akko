export interface ExtensionManifest {
    id: string;
    name: string;
    version: string;
    type: 'torrent' | 'stream';
    accuracy: 'high' | 'medium' | 'low';
    ratio?: number;
    media: 'sub' | 'dub' | 'both';
    languages: string[];
    icon?: string;
    description?: string;
    update: string;
    code: string;
}

export interface InstalledExtension extends Omit<ExtensionManifest, 'code'> {
    enabled: boolean;
    codeUrl: string;
    installedAt: string;
    updatedAt: string;
    hasUpdate?: boolean;
    pendingVersion?: string;
}

export interface SearchParams {
    media?: Record<string, unknown>;
    titles?: string[];
    episode?: number;
    anilistId?: number;
    anidbEid?: string;
    anidbAid?: string;
    resolution?: string;
    exclusions?: string[];
    episodeCount?: number;
}

export type SearchMethod = 'single' | 'batch' | 'movie';

export interface TorrentResult {
    extensionId: string;
    title: string;
    link: string;
    hash: string;
    seeders: number;
    leechers: number;
    downloads: number;
    size: number;
    date: string;
    verified?: boolean;
    type?: 'best' | 'alt' | 'batch';
    accuracy: 'high' | 'medium' | 'low';
}

export interface ExtensionSearchResult {
    extensionId: string;
    results: TorrentResult[];
    error?: string;
}

export interface UpdateInfo {
    id: string;
    currentVersion: string;
    newVersion: string;
}
