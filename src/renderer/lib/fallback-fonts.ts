const FALLBACK_FAMILIES: Record<string, string[]> = {
    ja: [
        'yu gothic ui',
        'yu gothic',
        'meiryo',
        'ms gothic',
        'hiragino sans',
        'noto sans cjk jp',
        'noto sans jp',
    ],
    zh: [
        'microsoft yahei',
        'microsoft jhenghei',
        'pingfang sc',
        'noto sans cjk sc',
        'noto sans sc',
    ],
    ko: ['malgun gothic', 'apple sd gothic neo', 'noto sans cjk kr', 'noto sans kr'],
    th: ['leelawadee ui', 'leelawadee', 'tahoma', 'thonburi', 'noto sans thai'],
    ar: ['segoe ui', 'arial', 'geeza pro', 'noto sans arabic'],
    hi: ['nirmala ui', 'mangal', 'kohinoor devanagari', 'noto sans devanagari'],
};

export const DEFAULT_FAMILY = 'liberation sans';

export type FallbackFont = { family: string; data: Uint8Array[] };

const cache = new Map<string, Promise<FallbackFont | null>>();

async function loadSystemFont(families: string[]): Promise<FallbackFont | null> {
    const fonts = (await window.queryLocalFonts?.()) ?? [];
    for (const family of families) {
        const faces = fonts.filter(
            (f) => f.family.toLowerCase() === family && /^(regular|bold)$/i.test(f.style)
        );
        if (faces.length) {
            const data = await Promise.all(
                faces.map(async (f) => new Uint8Array(await (await f.blob()).arrayBuffer()))
            );
            return { family, data };
        }
    }
    return null;
}

export function fallbackFont(lang: string): Promise<FallbackFont | null> {
    const families = FALLBACK_FAMILIES[lang.split('-')[0]];
    if (!families) return Promise.resolve(null);
    let font = cache.get(lang);
    if (!font) {
        font = loadSystemFont(families).catch(() => null);
        cache.set(lang, font);
    }
    return font;
}
