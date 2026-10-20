import { shallowReactive } from 'vue';

export type ToastKind = 'success' | 'error' | 'info' | 'warn';

export type ToastOptions = {
    action?: { label: string; onClick: () => void };
    // false keeps it open until dismissed
    duration?: number | false;
};

export type Toast = ToastOptions & { id: number; kind: ToastKind; message: string };

// Older ones wait behind the newest and come back as those close, if they haven't timed out
export const MAX_VISIBLE_TOASTS = 4;
const DURATION_MS = { success: 4000, info: 4000, warn: 6000, error: 6000 };
const ACTION_DURATION_MS = 8000;

export const toasts = shallowReactive<Toast[]>([]);
let nextId = 0;

function show(kind: ToastKind, message: string, options: ToastOptions = {}) {
    const duration = options.duration ?? (options.action ? ACTION_DURATION_MS : DURATION_MS[kind]);
    toasts.push({ ...options, id: nextId++, kind, message, duration });
}

export function dismissToast(id: number) {
    const index = toasts.findIndex((t) => t.id === id);
    if (index !== -1) toasts.splice(index, 1);
}

export const toast = {
    success: (message: string, options?: ToastOptions) => show('success', message, options),
    error: (message: string, options?: ToastOptions) => show('error', message, options),
    info: (message: string, options?: ToastOptions) => show('info', message, options),
    warn: (message: string, options?: ToastOptions) => show('warn', message, options),
};
