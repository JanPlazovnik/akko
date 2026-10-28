import { i18n } from '../i18n';

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatBytes(bytes: number): string {
    if (!bytes || bytes < 1) return '0 B';
    const i = Math.min(Math.floor(Math.log10(bytes) / 3), UNITS.length - 1);
    const value = bytes / 1000 ** i;
    return `${value.toFixed(i === 0 || value >= 100 ? 0 : 1)} ${UNITS[i]}`;
}

export function formatSpeed(bytesPerSecond: number): string {
    return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatPercent(fraction: number): string {
    return `${Math.floor(Math.min(1, Math.max(0, fraction)) * 100)}%`;
}

const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
];

export function formatRelativeDate(value: string): string | null {
    const time = Date.parse(value);
    if (Number.isNaN(time)) return null;
    const seconds = (time - Date.now()) / 1000;
    const [unit, size] = RELATIVE_STEPS.find(([, s]) => Math.abs(seconds) >= s) ?? ['minute', 60];
    const relativeTime = new Intl.RelativeTimeFormat(i18n.global.locale.value, { numeric: 'auto' });
    return relativeTime.format(Math.round(seconds / size), unit);
}

export function errorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
}
