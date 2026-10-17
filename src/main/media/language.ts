const languageNames = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });

function language(code: string): { lang: string; name?: string } {
    try {
        const name = languageNames.of(code);
        return name ? { lang: Intl.getCanonicalLocales(code)[0], name } : { lang: 'und' };
    } catch {
        return { lang: 'und' };
    }
}

export function describeLanguage(code: string, label: string | undefined, fallback: string) {
    const { lang, name } = language(code);
    return { lang, label: label || name || fallback };
}
