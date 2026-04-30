interface Window {
    api: {
        startStream: (magnet: string) => Promise<{ torrentId: string; streamUrl: string }>;
        stopStream: (torrentId: string) => Promise<void>;
    };
}
