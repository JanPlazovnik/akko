import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { AppSettings, SettingsPaths } from '@shared/ipc/api';
import { errorMessage } from '../lib/format';
import { t } from '../i18n';
import { toast } from '../lib/toast';

export const useSettingsStore = defineStore('settings', () => {
    const settings = ref<AppSettings | null>(null);
    const paths = ref<SettingsPaths | null>(null);

    const downloadPath = computed(
        () => settings.value?.downloadPath ?? paths.value?.defaultDownloadPath ?? ''
    );

    async function load() {
        [settings.value, paths.value] = await Promise.all([
            window.api.settings.get(),
            window.api.settings.paths(),
        ]);
    }

    async function update(patch: Partial<AppSettings>) {
        const previous = settings.value;
        if (previous) settings.value = { ...previous, ...patch };
        try {
            settings.value = await window.api.settings.update(patch);
        } catch (err) {
            settings.value = previous;
            toast.error(t('settings.saveFailed', { error: errorMessage(err) }));
        }
    }

    async function chooseDownloadPath() {
        const folder = await window.api.settings.chooseFolder(downloadPath.value);
        if (folder) await update({ downloadPath: folder });
    }

    return { settings, paths, downloadPath, load, update, chooseDownloadPath };
});
