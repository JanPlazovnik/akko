import { defineStore } from 'pinia';
import { ref, toRaw } from 'vue';
import type {
    InstalledExtension,
    ExtensionManifest,
    UpdateInfo,
} from '../../main/extensions/types';

export const useExtensionStore = defineStore('extensions', () => {
    const installed = ref<InstalledExtension[]>([]);
    const updates = ref<UpdateInfo[]>([]);
    const loading = ref(false);
    const error = ref<string | null>(null);

    async function refresh() {
        installed.value = await window.api.extensions.list();
    }

    async function fetchRepository(url: string): Promise<ExtensionManifest[]> {
        return window.api.extensions.fetchRepository(url);
    }

    async function install(manifest: ExtensionManifest) {
        loading.value = true;
        error.value = null;
        try {
            await window.api.extensions.install(JSON.parse(JSON.stringify(toRaw(manifest))));
            await refresh();
        } catch (e) {
            error.value = String(e);
            throw e;
        } finally {
            loading.value = false;
        }
    }

    async function uninstall(id: string) {
        await window.api.extensions.uninstall(id);
        await refresh();
    }

    async function toggle(id: string, enabled: boolean) {
        await window.api.extensions.toggle(id, enabled);
        await refresh();
    }

    async function checkUpdates() {
        updates.value = await window.api.extensions.checkUpdates();
        installed.value = installed.value.map((ext) => {
            const update = updates.value.find((u) => u.id === ext.id);
            return update ? { ...ext, hasUpdate: true, pendingVersion: update.newVersion } : ext;
        });
    }

    async function update(id: string) {
        const u = updates.value.find((u) => u.id === id);
        if (!u) throw new Error('No pending update for ' + id);
        const ext = installed.value.find((e) => e.id === id);
        if (!ext) throw new Error('Extension not found: ' + id);
        await window.api.extensions.update(id, u.newVersion, ext.codeUrl);
        updates.value = updates.value.filter((u) => u.id !== id);
        await refresh();
    }

    return {
        installed,
        updates,
        loading,
        error,
        refresh,
        fetchRepository,
        install,
        uninstall,
        toggle,
        checkUpdates,
        update,
    };
});
