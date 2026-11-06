import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { AnilistAccount } from '@shared/ipc/api';
import { mediaTitle } from '@shared/media/types';
import { errorMessage, formatRelativeDate } from '../lib/format';
import { t } from '../i18n';
import { toast } from '../lib/toast';
import router from '../router';
import { useSettingsStore } from './settings';

const EXPIRY_WARNING_MS = 14 * 24 * 60 * 60 * 1000;

const SCORE_SCALES: Record<string, { max: number; step: number }> = {
    POINT_100: { max: 100, step: 1 },
    POINT_10_DECIMAL: { max: 10, step: 0.1 },
    POINT_10: { max: 10, step: 1 },
    POINT_5: { max: 5, step: 1 },
    POINT_3: { max: 3, step: 1 },
};

export type Expiry = { expired: boolean; soon: boolean; date: Date; relative: string | null };

function expiryOf(account: AnilistAccount): Expiry {
    const left = account.expiresAt - Date.now();
    const date = new Date(account.expiresAt);
    return {
        expired: left <= 0,
        soon: left > 0 && left <= EXPIRY_WARNING_MS,
        date,
        relative: formatRelativeDate(date.toISOString()),
    };
}

export const useAccountsStore = defineStore('accounts', () => {
    const settings = useSettingsStore();
    const anilist = ref<AnilistAccount | null>(null);
    const connecting = ref(false);
    let loading: Promise<void> | null = null;

    window.api.on('accounts:changed', (accounts) => {
        anilist.value = accounts.anilist;
    });

    function load() {
        loading ??= window.api.accounts.get().then((accounts) => {
            anilist.value = accounts.anilist;
        });
        return loading;
    }

    const anilistExpiry = () => (anilist.value ? expiryOf(anilist.value) : null);

    const titleLanguage = () => {
        const chosen = settings.settings?.titleLanguage ?? 'ANILIST';
        return chosen === 'ANILIST' ? anilist.value?.titleLanguage : chosen;
    };

    const scoreScale = () =>
        SCORE_SCALES[anilist.value?.scoreFormat ?? ''] ?? SCORE_SCALES.POINT_10;

    const titleOf = (media: Parameters<typeof mediaTitle>[0]) => mediaTitle(media, titleLanguage());

    async function warnIfExpiring() {
        await load();
        const expiry = anilistExpiry();
        const action = {
            label: t('accounts.reconnect'),
            onClick: () => void router.push('/settings'),
        };
        if (expiry?.expired) {
            toast.error(t('accounts.expired'), {
                action,
                duration: false,
            });
        } else if (expiry?.soon) {
            toast.warn(t('accounts.expiring', { when: expiry.relative ?? '' }), {
                action,
            });
        }
    }

    async function connectAnilist() {
        connecting.value = true;
        try {
            anilist.value = await window.api.accounts.loginAnilist();
            toast.success(t('accounts.connected', { name: anilist.value.name }));
        } catch (err) {
            const message = errorMessage(err);
            if (message !== 'Login cancelled') {
                toast.error(t('accounts.connectFailed', { error: message }));
            }
        } finally {
            connecting.value = false;
        }
    }

    async function disconnectAnilist() {
        await window.api.accounts.logoutAnilist();
        anilist.value = null;
    }

    return {
        anilist,
        connecting,
        load,
        anilistExpiry,
        titleOf,
        scoreScale,
        warnIfExpiring,
        connectAnilist,
        disconnectAnilist,
    };
});
