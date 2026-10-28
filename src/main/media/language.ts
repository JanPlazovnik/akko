import { LOCALE } from '../i18n';

const languageNames = new Intl.DisplayNames([LOCALE], { type: 'language', fallback: 'none' });

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
