export function accentStyle(color?: string | null): Record<string, string> | undefined {
    if (!color) return undefined;
    return { '--color-accent': `oklch(from ${color} max(l, 0.74) min(c, 0.18) h)` };
}
