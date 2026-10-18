import { defineStore } from 'pinia';
import { ref } from 'vue';
import { toast } from 'vue3-toastify';
import type { AnilistAccount } from '@shared/ipc/api';
import { mediaTitle } from '@shared/media/types';
import { errorMessage, formatRelativeDate } from '../lib/format';
import router from '../router';

const EXPIRY_WARNING_MS = 14 * 24 * 60 * 60 * 1000;

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

    const titleOf = (media: Parameters<typeof mediaTitle>[0]) =>
        mediaTitle(media, anilist.value?.titleLanguage);

    async function warnIfExpiring() {
        await load();
        const expiry = anilistExpiry();
        const options = { onClick: () => void router.push('/settings') };
        if (expiry?.expired) {
            toast.error('Your AniList login expired. Reconnect it in Settings to keep syncing.', {
                ...options,
                autoClose: false,
            });
        } else if (expiry?.soon) {
            toast.warning(
                `Your AniList login expires ${expiry.relative}. Reconnect it in Settings to renew it.`,
                options
            );
        }
    }

    async function connectAnilist() {
        connecting.value = true;
        try {
            anilist.value = await window.api.accounts.loginAnilist();
            toast.success(`Connected to AniList as ${anilist.value.name}`);
        } catch (err) {
            const message = errorMessage(err);
            if (message !== 'Login cancelled') toast.error(`Couldn't connect AniList: ${message}`);
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
        warnIfExpiring,
        connectAnilist,
        disconnectAnilist,
    };
});
