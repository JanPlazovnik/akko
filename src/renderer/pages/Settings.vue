<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Download, RefreshCw, Trash2, AlertCircle, Globe } from '@lucide/vue';
import { toast } from 'vue3-toastify';
import { useExtensionStore } from '../stores/extensions';
import type { ExtensionManifest } from '../../main/extensions/types';

const store = useExtensionStore();

const repoUrl = ref('');
const repoManifests = ref<ExtensionManifest[]>([]);
const repoBusy = ref(false);
const checkingUpdates = ref(false);
const installingId = ref<string | null>(null);
const updatingId = ref<string | null>(null);

onMounted(() => store.refresh());

const ACCURACY_CLASS = {
    high: 'text-emerald-400 bg-emerald-400/10',
    medium: 'text-amber-400 bg-amber-400/10',
    low: 'text-red-400 bg-red-400/10',
};

function isInstalled(id: string) {
    return store.installed.some((e) => e.id === id);
}

async function browseRepo() {
    if (!repoUrl.value.trim()) return;
    repoBusy.value = true;
    try {
        repoManifests.value = await store.fetchRepository(repoUrl.value.trim());
    } catch (e) {
        toast.error('Failed to fetch repository');
    } finally {
        repoBusy.value = false;
    }
}

async function install(manifest: ExtensionManifest) {
    installingId.value = manifest.id;
    try {
        await store.install(manifest);
        toast.success(`${manifest.name} installed`);
    } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Install failed');
    } finally {
        installingId.value = null;
    }
}

async function uninstall(id: string, name: string) {
    try {
        await store.uninstall(id);
        toast.success(`${name} removed`);
    } catch {
        toast.error('Failed to remove extension');
    }
}

async function toggle(id: string, enabled: boolean) {
    try {
        await store.toggle(id, enabled);
    } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to toggle extension');
        await store.refresh();
    }
}

async function checkUpdates() {
    checkingUpdates.value = true;
    try {
        await store.checkUpdates();
        const count = store.updates.length;
        toast.info(
            count ? `${count} update${count > 1 ? 's' : ''} available` : 'All extensions up to date'
        );
    } catch {
        toast.error('Failed to check for updates');
    } finally {
        checkingUpdates.value = false;
    }
}

async function updateExtension(id: string) {
    updatingId.value = id;
    try {
        await store.update(id);
        toast.success('Extension updated');
    } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
        updatingId.value = null;
    }
}
</script>

<template>
    <div class="min-h-full bg-neutral-900 text-white">
        <div class="px-8 pt-8 pb-6 border-b border-white/8">
            <h1 class="text-xl font-semibold">Settings</h1>
        </div>

        <div class="px-8 py-8 max-w-3xl space-y-10">
            <!-- Extensions section -->
            <section class="space-y-5">
                <div class="flex items-center justify-between">
                    <div>
                        <h2 class="text-base font-semibold">Extensions</h2>
                        <p class="text-sm text-white/40 mt-0.5">Manage torrent sources</p>
                    </div>
                    <button
                        v-if="store.installed.length"
                        :disabled="checkingUpdates"
                        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/60 hover:text-white hover:bg-white/8 transition-colors disabled:opacity-40"
                        @click="checkUpdates"
                    >
                        <RefreshCw :size="13" :class="{ 'animate-spin': checkingUpdates }" />
                        Check for updates
                    </button>
                </div>

                <!-- Installed list -->
                <div v-if="store.installed.length" class="space-y-2">
                    <div
                        v-for="ext in store.installed"
                        :key="ext.id"
                        class="flex items-center gap-3 p-3.5 rounded-xl bg-neutral-800/60 border border-white/6"
                    >
                        <img
                            v-if="ext.icon"
                            :src="ext.icon"
                            class="w-7 h-7 rounded-md object-contain shrink-0 bg-white/5"
                            :alt="ext.name"
                            @error="($event.target as HTMLImageElement).style.display = 'none'"
                        />
                        <div
                            v-else
                            class="w-7 h-7 rounded-md bg-white/8 shrink-0 flex items-center justify-center"
                        >
                            <Globe :size="14" class="text-white/30" />
                        </div>

                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2">
                                <span class="text-sm font-medium">{{ ext.name }}</span>
                                <span class="text-[11px] text-white/30">v{{ ext.version }}</span>
                                <span
                                    v-if="ext.hasUpdate"
                                    class="text-[11px] px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-400 border border-blue-500/20"
                                >
                                    v{{ ext.pendingVersion }} available
                                </span>
                            </div>
                            <div class="flex items-center gap-1.5 mt-1">
                                <span
                                    :class="[
                                        'text-[11px] px-1.5 py-0.5 rounded',
                                        ACCURACY_CLASS[ext.accuracy],
                                    ]"
                                >
                                    {{ ext.accuracy }}
                                </span>
                                <span
                                    class="text-[11px] px-1.5 py-0.5 rounded bg-white/6 text-white/40"
                                >
                                    {{ ext.type }}
                                </span>
                                <span
                                    class="text-[11px] px-1.5 py-0.5 rounded bg-white/6 text-white/40"
                                >
                                    {{ ext.media }}
                                </span>
                            </div>
                        </div>

                        <div class="flex items-center gap-2 shrink-0">
                            <button
                                v-if="ext.hasUpdate"
                                :disabled="updatingId === ext.id"
                                class="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-blue-400 hover:bg-blue-500/10 transition-colors disabled:opacity-40"
                                @click="updateExtension(ext.id)"
                            >
                                <Download :size="12" />
                                Update
                            </button>

                            <!-- Toggle -->
                            <button
                                :class="[
                                    'relative w-9 h-5 rounded-full transition-colors shrink-0',
                                    ext.enabled ? 'bg-white/80' : 'bg-white/15',
                                ]"
                                @click="toggle(ext.id, !ext.enabled)"
                            >
                                <span
                                    :class="[
                                        'absolute top-0.5 w-4 h-4 rounded-full transition-all',
                                        ext.enabled
                                            ? 'left-[calc(100%-1.125rem)] bg-neutral-900'
                                            : 'left-0.5 bg-white/40',
                                    ]"
                                />
                            </button>

                            <button
                                class="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                                @click="uninstall(ext.id, ext.name)"
                            >
                                <Trash2 :size="14" />
                            </button>
                        </div>
                    </div>
                </div>

                <div
                    v-else
                    class="flex flex-col items-center justify-center py-10 rounded-xl border border-dashed border-white/10 text-white/30"
                >
                    <AlertCircle :size="20" class="mb-2" />
                    <span class="text-sm">No extensions installed</span>
                </div>

                <!-- Repository browser -->
                <div class="space-y-3 pt-2">
                    <h3 class="text-sm font-medium text-white/60">Browse repository</h3>
                    <div class="flex gap-2">
                        <input
                            v-model="repoUrl"
                            placeholder="https://raw.githubusercontent.com/..."
                            class="flex-1 h-9 px-3 rounded-lg bg-neutral-800 border border-white/8 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20 transition-colors"
                            @keydown.enter="browseRepo"
                        />
                        <button
                            :disabled="repoBusy || !repoUrl.trim()"
                            class="h-9 px-4 rounded-lg text-sm font-medium bg-white/10 hover:bg-white/15 transition-colors disabled:opacity-40 shrink-0"
                            @click="browseRepo"
                        >
                            {{ repoBusy ? 'Fetching…' : 'Browse' }}
                        </button>
                    </div>

                    <!-- Repo results -->
                    <div v-if="repoManifests.length" class="space-y-2">
                        <div
                            v-for="manifest in repoManifests"
                            :key="manifest.id"
                            class="flex items-center gap-3 p-3 rounded-xl bg-neutral-800/40 border border-white/6"
                        >
                            <img
                                v-if="manifest.icon"
                                :src="manifest.icon"
                                class="w-7 h-7 rounded-md object-contain shrink-0 bg-white/5"
                                :alt="manifest.name"
                                @error="($event.target as HTMLImageElement).style.display = 'none'"
                            />
                            <div
                                v-else
                                class="w-7 h-7 rounded-md bg-white/8 shrink-0 flex items-center justify-center"
                            >
                                <Globe :size="14" class="text-white/30" />
                            </div>

                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2">
                                    <span class="text-sm font-medium">{{ manifest.name }}</span>
                                    <span class="text-[11px] text-white/30"
                                        >v{{ manifest.version }}</span
                                    >
                                </div>
                                <div class="flex items-center gap-1.5 mt-1">
                                    <span
                                        :class="[
                                            'text-[11px] px-1.5 py-0.5 rounded',
                                            ACCURACY_CLASS[manifest.accuracy],
                                        ]"
                                    >
                                        {{ manifest.accuracy }}
                                    </span>
                                    <span
                                        class="text-[11px] px-1.5 py-0.5 rounded bg-white/6 text-white/40"
                                    >
                                        {{ manifest.type }}
                                    </span>
                                    <span
                                        class="text-[11px] px-1.5 py-0.5 rounded bg-white/6 text-white/40"
                                    >
                                        {{ manifest.media }}
                                    </span>
                                </div>
                            </div>

                            <button
                                v-if="!isInstalled(manifest.id)"
                                :disabled="installingId === manifest.id"
                                class="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/15 transition-colors disabled:opacity-40 shrink-0"
                                @click="install(manifest)"
                            >
                                <Download :size="12" />
                                {{ installingId === manifest.id ? 'Installing…' : 'Install' }}
                            </button>
                            <span
                                v-else
                                class="text-[11px] px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0"
                            >
                                Installed
                            </span>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    </div>
</template>
