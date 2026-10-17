import type { AppApi } from '../shared/ipc/api';

declare global {
    interface FontData {
        family: string;
        style: string;
        blob(): Promise<Blob>;
    }

    interface Window {
        api: AppApi;
        queryLocalFonts?: () => Promise<FontData[]>;
    }
}

export {};
