import type { Episode } from '@shared/anizip/types';

// The last 3 minutes or 10% is usually just the ending. At least half has to
// play out, or short videos would count as finished right away.
export const finishedAt = (duration: number) =>
    Math.max(duration / 2, duration - Math.max(180, duration * 0.1));

export function isUnaired(ep: Episode) {
    if (!ep.airDate) return !ep.title;
    return Date.parse(ep.airDate) > Date.now();
}

export function formatTimestamp(seconds: number): string {
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = String(total % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
