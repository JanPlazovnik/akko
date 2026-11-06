export function accentStyle(color?: string | null): Record<string, string> | undefined {
    if (!color) return undefined;
    return { '--color-accent': `oklch(from ${color} max(l, 0.74) min(c, 0.18) h)` };
}

// AniList names its preset profile colours; supporters can pick any hex colour
const PROFILE_COLORS: Record<string, string> = {
    blue: '#3db4f2',
    purple: '#c063ff',
    pink: '#fc9dd6',
    orange: '#ef881a',
    red: '#e13333',
    green: '#4cca51',
    gray: '#677b94',
};

export function profileColor(value?: string | null): string | undefined {
    if (!value) return undefined;
    return PROFILE_COLORS[value] ?? (/^#[0-9a-f]{3,8}$/i.test(value) ? value : undefined);
}
