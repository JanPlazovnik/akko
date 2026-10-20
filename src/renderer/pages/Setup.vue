<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, Check, FolderDown, Puzzle, Radar, RotateCcw } from '@lucide/vue';
import { HEALTHY_DHT_NODES, type FolderCheck, type NetworkCheck } from '@shared/ipc/api';
import { useSettingsStore } from '../stores/settings';
import { useExtensionStore } from '../stores/extensions';
import { formatBytes } from '../lib/format';
import LogoMark from '../components/LogoMark.vue';
import WindowControls from '../components/WindowControls.vue';
import SettingRow from '../components/settings/SettingRow.vue';
import ExtensionsSettings from '../components/settings/ExtensionsSettings.vue';
import Toggle from '../components/ui/Toggle.vue';
import CheckStatus, { type CheckState } from '../components/setup/CheckStatus.vue';
import { BUTTON } from '../components/ui/styles';

const STEPS = [
    { id: 'welcome', label: 'Welcome' },
    { id: 'storage', label: 'Storage' },
    { id: 'network', label: 'Connection' },
    { id: 'sources', label: 'Sources' },
] as const;

const INTRO = [
    { icon: FolderDown, text: 'Choose where episodes are saved and whether to keep them' },
    { icon: Radar, text: 'Check that your connection can reach other peers' },
    { icon: Puzzle, text: 'Add a source extension to search for releases' },
];

const LOW_SPACE_BYTES = 10e9;

type Status = { state: CheckState; title: string; detail?: string };

const router = useRouter();
const store = useSettingsStore();
const extensions = useExtensionStore();

const step = ref(0);
const current = computed(() => STEPS[step.value].id);
const isLast = computed(() => step.value === STEPS.length - 1);

const folder = ref<FolderCheck | null>(null);
const network = ref<NetworkCheck | null>(null);

async function checkFolder() {
    const path = store.downloadPath;
    folder.value = null;
    const result = await window.api.settings.checkFolder(path);
    if (path === store.downloadPath) folder.value = result;
}

async function checkNetwork() {
    network.value = null;
    network.value = await window.api
        .checkNetwork()
        .catch(() => ({ trackersReached: 0, trackersTotal: 0, dhtNodes: 0 }));
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

watch(() => store.downloadPath, checkFolder, { immediate: true });
onMounted(checkNetwork);

const folderStatus = computed<Status>(() => {
    if (!folder.value) return { state: 'running', title: 'Checking folder…' };
    if (!folder.value.writable) {
        return {
            state: 'fail',
            title: "akko can't save files here",
            detail: `${folder.value.error}. Choose another folder to continue.`,
        };
    }
    const free = formatBytes(folder.value.freeBytes);
    if (folder.value.inMemory) {
        return {
            state: 'warn',
            title: 'This folder is stored in memory',
            detail: `It's a tmpfs with ${free} free, so downloads use RAM and are lost on restart. Choose a folder on disk.`,
        };
    }
    if (folder.value.freeBytes < LOW_SPACE_BYTES) {
        return {
            state: 'warn',
            title: `Only ${free} free on this drive`,
            detail: 'An episode is usually 0.3–1.5 GB, so kept episodes will fill it quickly.',
        };
    }
    return { state: 'ok', title: 'Folder is ready', detail: `${free} free on this drive.` };
});

const networkStatus = computed<Status>(() => {
    if (!network.value) {
        return {
            state: 'running',
            title: 'Looking for peers…',
            detail: 'This takes up to 10 seconds.',
        };
    }
    const { trackersReached, trackersTotal, dhtNodes } = network.value;
    const trackers = `${trackersReached} of ${plural(trackersTotal, 'tracker')}`;
    const dht = plural(dhtNodes, 'DHT node');
    const title = 'Connected to the BitTorrent network';
    if (trackersReached > 0 && dhtNodes >= HEALTHY_DHT_NODES) {
        return { state: 'ok', title, detail: `Reached ${trackers} and ${dht}.` };
    }
    if (trackersReached > 0) {
        return {
            state: 'ok',
            title,
            detail: `Reached ${trackers}. The DHT only found ${dht}, so akko will find peers through trackers, which works for most releases.`,
        };
    }
    if (dhtNodes >= HEALTHY_DHT_NODES) {
        return {
            state: 'ok',
            title,
            detail: `Reached ${dht}. Trackers didn't respond, so akko will find peers through the DHT.`,
        };
    }
    return {
        state: 'warn',
        title: "Couldn't reach the BitTorrent network",
        detail: 'Episodes may still load through trackers. If streams never start, a firewall, VPN or your network may be blocking BitTorrent.',
    };
});

const blocker = computed(() => {
    if (current.value === 'storage' && !folder.value?.writable) {
        return folder.value ? 'Choose a folder akko can write to' : '';
    }
    if (current.value === 'sources' && !extensions.installed.some((e) => e.enabled)) {
        return 'Install or enable at least one source to finish';
    }
    return null;
});

const primaryLabel = computed(() => {
    if (step.value === 0) return 'Get started';
    return isLast.value ? 'Finish setup' : 'Continue';
});

async function next() {
    if (blocker.value !== null) return;
    if (!isLast.value) {
        step.value++;
        return;
    }
    await store.update({ onboarded: true });
    await router.replace('/');
}
</script>

<template>
    <div class="flex h-full flex-col">
        <header class="drag flex h-14 shrink-0 items-center pl-4">
            <LogoMark class="size-7 text-white" />
            <span class="ml-2 font-display text-lg font-semibold tracking-tight">akko</span>
            <WindowControls class="ml-auto h-14" />
        </header>

        <div class="mx-2 mb-2 flex min-h-0 flex-1 rounded-xl bg-surface ring-1 ring-line">
            <aside class="w-60 shrink-0 border-r border-line px-6 py-8">
                <p class="text-xs font-medium tracking-wider text-white/40 uppercase">Setup</p>
                <ol class="mt-5 space-y-1">
                    <li
                        v-for="(item, i) in STEPS"
                        :key="item.id"
                        :class="[
                            'flex items-center gap-3 rounded-lg px-2 py-2 text-sm',
                            i === step ? 'bg-white/8 font-medium text-white' : 'text-white/45',
                        ]"
                    >
                        <span
                            :class="[
                                'grid size-6 shrink-0 place-items-center rounded-full text-xs tabular-nums',
                                i < step
                                    ? 'bg-accent text-black'
                                    : i === step
                                      ? 'bg-white text-black'
                                      : 'ring-1 ring-white/15',
                            ]"
                        >
                            <Check v-if="i < step" :size="13" :stroke-width="3" />
                            <template v-else>{{ i + 1 }}</template>
                        </span>
                        {{ item.label }}
                    </li>
                </ol>
            </aside>

            <section class="flex min-w-0 flex-1 flex-col">
                <div class="min-h-0 flex-1 overflow-auto px-10 py-10">
                    <div class="max-w-2xl">
                        <template v-if="current === 'welcome'">
                            <h1 class="font-display text-3xl font-semibold tracking-tight">
                                Welcome to akko
                            </h1>
                            <p class="mt-3 max-w-lg leading-relaxed text-white/60">
                                akko streams episodes straight from BitTorrent and plays them while
                                they download. Three things need setting up before you start
                                watching.
                            </p>
                            <ul class="mt-8 space-y-4">
                                <li
                                    v-for="item in INTRO"
                                    :key="item.text"
                                    class="flex items-center gap-4 text-sm text-white/80"
                                >
                                    <span
                                        class="grid size-9 shrink-0 place-items-center rounded-lg bg-white/6 text-accent"
                                    >
                                        <component :is="item.icon" :size="17" />
                                    </span>
                                    {{ item.text }}
                                </li>
                            </ul>
                        </template>

                        <template v-else-if="current === 'storage'">
                            <h1 class="font-display text-2xl font-semibold tracking-tight">
                                Where should episodes go?
                            </h1>
                            <p class="mt-2 text-sm text-white/50">
                                You can change both of these later in Settings.
                            </p>
                            <div
                                v-if="store.settings"
                                class="mt-6 divide-y divide-line rounded-xl bg-raised/60 ring-1 ring-line"
                            >
                                <SettingRow title="Download location">
                                    <template #description>
                                        <span class="font-mono text-[11px] break-all text-white/55">
                                            {{ store.downloadPath }}
                                        </span>
                                        <span v-if="!store.settings.downloadPath" class="ml-1.5">
                                            (default)
                                        </span>
                                    </template>
                                    <button
                                        v-if="store.settings.downloadPath"
                                        :class="BUTTON"
                                        title="Reset to default"
                                        @click="store.update({ downloadPath: null })"
                                    >
                                        <RotateCcw :size="14" />
                                    </button>
                                    <button :class="BUTTON" @click="store.chooseDownloadPath">
                                        Change
                                    </button>
                                </SettingRow>
                                <SettingRow
                                    title="Keep downloaded episodes"
                                    description="Leave files on disk after you stop watching, so replaying them starts instantly. When off, files are deleted as soon as playback stops."
                                >
                                    <Toggle
                                        :model-value="store.settings.keepFiles"
                                        label="Keep downloaded episodes"
                                        @update:model-value="store.update({ keepFiles: $event })"
                                    />
                                </SettingRow>
                            </div>
                            <CheckStatus class="mt-4" v-bind="folderStatus" @retry="checkFolder" />
                        </template>

                        <template v-else-if="current === 'network'">
                            <h1 class="font-display text-2xl font-semibold tracking-tight">
                                Checking your connection
                            </h1>
                            <p class="mt-2 text-sm text-white/50">
                                akko finds peers through trackers and the DHT, a shared directory of
                                BitTorrent users. If neither can be reached, streams can be slow or
                                never start.
                            </p>
                            <CheckStatus
                                class="mt-6"
                                v-bind="networkStatus"
                                @retry="checkNetwork"
                            />
                        </template>

                        <template v-else>
                            <h1 class="font-display text-2xl font-semibold tracking-tight">
                                Add a source
                            </h1>
                            <p class="mt-2 mb-6 text-sm text-white/50">
                                akko doesn't host anything itself. Sources are extensions that
                                search torrent sites for releases of an episode. Paste a repository
                                link to browse and install them.
                            </p>
                            <ExtensionsSettings />
                        </template>
                    </div>
                </div>

                <footer class="flex items-center gap-3 border-t border-line px-10 py-4">
                    <button
                        v-if="step > 0"
                        :class="[BUTTON, 'bg-transparent text-white/60 hover:text-white']"
                        @click="step--"
                    >
                        <ArrowLeft :size="15" />
                        Back
                    </button>
                    <p v-if="blocker" class="ml-auto text-xs text-white/45">{{ blocker }}</p>
                    <button
                        :disabled="blocker !== null"
                        :class="[
                            'inline-flex h-9 cursor-pointer items-center rounded-lg bg-white px-4 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-30',
                            !blocker && 'ml-auto',
                        ]"
                        @click="next"
                    >
                        {{ primaryLabel }}
                    </button>
                </footer>
            </section>
        </div>
    </div>
</template>
