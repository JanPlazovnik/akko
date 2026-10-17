export type SubtitleEvent = {
    start: number;
    duration: number;
    layer: number;
    style: string;
    name: string;
    marginL: number;
    marginR: number;
    marginV: number;
    effect: string;
    text: string;
};

function assTime(ms: number): string {
    const cs = Math.max(0, Math.round(ms / 10));
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${Math.floor(cs / 360000)}:${pad(Math.floor(cs / 6000) % 60)}:${pad(Math.floor(cs / 100) % 60)}.${pad(cs % 100)}`;
}

export function dialogueLine(event: SubtitleEvent): string {
    return [
        `Dialogue: ${event.layer}`,
        assTime(event.start),
        assTime(event.start + event.duration),
        event.style,
        event.name,
        event.marginL,
        event.marginR,
        event.marginV,
        event.effect,
        event.text,
    ].join(',');
}
