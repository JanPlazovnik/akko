import en from '../shared/locales/en.json';

export const LOCALE = 'en';

type Messages = { [key: string]: string | Messages };

// The few strings the main process shows itself, from the same file as the renderer's
export function t(key: string, params: Record<string, string | number> = {}): string {
    const message = key
        .split('.')
        .reduce<
            Messages | string | undefined
        >((node, part) => (typeof node === 'object' ? node[part] : undefined), en);
    if (typeof message !== 'string') return key;
    return message.replace(/\{(\w+)\}/g, (match, name) => String(params[name] ?? match));
}
