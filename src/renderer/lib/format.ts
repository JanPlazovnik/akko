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
