import type { AppApi } from '../shared/ipc/api';

declare global {
    interface Window {
        api: AppApi;
    }
}

export {};
