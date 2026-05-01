interface Window {
    api: {
        startStream: (magnet: string) => Promise<{ torrentId: string; streamUrl: string }>;
        stopStream: (torrentId: string) => Promise<void>;
        minimizeWindow: () => void;
        maximizeWindow: () => void;
        closeWindow: () => void;
    };
}
