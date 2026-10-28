import { createI18n } from 'vue-i18n';
import en from '@shared/locales/en.json';

export const i18n = createI18n({
    legacy: false,
    locale: 'en',
    fallbackLocale: 'en',
    messages: { en },
});

// For stores and helpers outside components
export const t = i18n.global.t;

// For values that only sometimes have a translation, like enums AniList adds later
export const translateOr = (key: string, fallback: string) =>
    i18n.global.te(key) ? t(key) : fallback;
