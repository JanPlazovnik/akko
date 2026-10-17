import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { AppSettings, SettingsPaths } from '@shared/ipc/api';
import { toast } from 'vue3-toastify';
import { errorMessage } from '../lib/format';

export const useSettingsStore = defineStore('settings', () => {
    const settings = ref<AppSettings | null>(null);
    const paths = ref<SettingsPaths | null>(null);

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
            toast.error(`Couldn't save setting: ${errorMessage(err)}`);
        }
    }

    return { settings, paths, load, update };
});
