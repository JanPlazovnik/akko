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
import { t } from '../i18n';

const STEPS = ['welcome', 'storage', 'network', 'sources'] as const;

const INTRO = [
    { icon: FolderDown, id: 'storage' },
    { icon: Radar, id: 'network' },
    { icon: Puzzle, id: 'sources' },
] as const;

const LOW_SPACE_BYTES = 10e9;

type Status = { state: CheckState; title: string; detail?: string };

const router = useRouter();
const store = useSettingsStore();
const extensions = useExtensionStore();

const step = ref(0);
const current = computed(() => STEPS[step.value]);
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

watch(() => store.downloadPath, checkFolder, { immediate: true });
onMounted(checkNetwork);

const folderStatus = computed<Status>(() => {
    if (!folder.value) return { state: 'running', title: t('setup.folder.checking') };
    if (!folder.value.writable) {
        return {
            state: 'fail',
            title: t('setup.folder.notWritable'),
            detail: t('setup.folder.notWritableDetail', { error: folder.value.error ?? '' }),
        };
    }
    const free = formatBytes(folder.value.freeBytes);
    if (folder.value.inMemory) {
        return {
            state: 'warn',
            title: t('setup.folder.inMemory'),
            detail: t('setup.folder.inMemoryDetail', { free }),
        };
    }
    if (folder.value.freeBytes < LOW_SPACE_BYTES) {
        return {
            state: 'warn',
            title: t('setup.folder.lowSpace', { free }),
            detail: t('setup.folder.lowSpaceDetail'),
        };
    }
    return {
        state: 'ok',
        title: t('setup.folder.ready'),
        detail: t('setup.folder.readyDetail', { free }),
    };
});

const networkStatus = computed<Status>(() => {
    if (!network.value) {
        return {
            state: 'running',
            title: t('setup.network.checking'),
            detail: t('setup.network.checkingDetail'),
        };
    }
    const { trackersReached, trackersTotal, dhtNodes } = network.value;
    const trackers = t(
        'setup.network.trackers',
        { reached: trackersReached, n: trackersTotal },
        trackersTotal
    );
    const dht = t('setup.network.dht', { n: dhtNodes }, dhtNodes);
    const title = t('setup.network.connected');
    if (trackersReached > 0 && dhtNodes >= HEALTHY_DHT_NODES) {
        return { state: 'ok', title, detail: t('setup.network.reachedBoth', { trackers, dht }) };
    }
    if (trackersReached > 0) {
        return {
            state: 'ok',
            title,
            detail: t('setup.network.reachedTrackers', { trackers, dht }),
        };
    }
    if (dhtNodes >= HEALTHY_DHT_NODES) {
        return {
            state: 'ok',
            title,
            detail: t('setup.network.reachedDht', { dht }),
        };
    }
    return {
        state: 'warn',
        title: t('setup.network.failed'),
        detail: t('setup.network.failedDetail'),
    };
});

const blocker = computed(() => {
    if (current.value === 'storage' && !folder.value?.writable) {
        return folder.value ? t('setup.blockers.folder') : '';
    }
    if (current.value === 'sources' && !extensions.installed.some((e) => e.enabled)) {
        return t('setup.blockers.sources');
    }
    return null;
});

const primaryLabel = computed(() => {
    if (step.value === 0) return t('setup.getStarted');
    return isLast.value ? t('setup.finish') : t('common.continue');
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
                <p class="text-xs font-medium tracking-wider text-white/40 uppercase">
                    {{ $t('setup.title') }}
                </p>
                <ol class="mt-5 space-y-1">
                    <li
                        v-for="(item, i) in STEPS"
                        :key="item"
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
                        {{ $t(`setup.steps.${item}`) }}
                    </li>
                </ol>
            </aside>

            <section class="flex min-w-0 flex-1 flex-col">
                <div class="min-h-0 flex-1 overflow-auto px-10 py-10">
                    <div class="max-w-2xl">
                        <template v-if="current === 'welcome'">
                            <h1 class="font-display text-3xl font-semibold tracking-tight">
                                {{ $t('setup.welcome.title') }}
                            </h1>
                            <p class="mt-3 max-w-lg leading-relaxed text-white/60">
                                {{ $t('setup.welcome.body') }}
                            </p>
                            <ul class="mt-8 space-y-4">
                                <li
                                    v-for="item in INTRO"
                                    :key="item.id"
                                    class="flex items-center gap-4 text-sm text-white/80"
                                >
                                    <span
                                        class="grid size-9 shrink-0 place-items-center rounded-lg bg-white/6 text-accent"
                                    >
                                        <component :is="item.icon" :size="17" />
                                    </span>
                                    {{ $t(`setup.intro.${item.id}`) }}
                                </li>
                            </ul>
                        </template>

                        <template v-else-if="current === 'storage'">
                            <h1 class="font-display text-2xl font-semibold tracking-tight">
                                {{ $t('setup.storage.title') }}
                            </h1>
                            <p class="mt-2 text-sm text-white/50">
                                {{ $t('setup.storage.body') }}
                            </p>
                            <div
                                v-if="store.settings"
                                class="mt-6 divide-y divide-line rounded-xl bg-raised/60 ring-1 ring-line"
                            >
                                <SettingRow :title="$t('settings.torrents.location')">
                                    <template #description>
                                        <span class="font-mono text-[11px] break-all text-white/55">
                                            {{ store.downloadPath }}
                                        </span>
                                        <span v-if="!store.settings.downloadPath" class="ml-1.5">
                                            {{ $t('common.default') }}
                                        </span>
                                    </template>
                                    <button
                                        v-if="store.settings.downloadPath"
                                        :class="BUTTON"
                                        :title="$t('common.resetDefault')"
                                        @click="store.update({ downloadPath: null })"
                                    >
                                        <RotateCcw :size="14" />
                                    </button>
                                    <button :class="BUTTON" @click="store.chooseDownloadPath">
                                        {{ $t('common.change') }}
                                    </button>
                                </SettingRow>
                                <SettingRow
                                    :title="$t('settings.torrents.keepFiles')"
                                    :description="$t('settings.torrents.keepFilesDescription')"
                                >
                                    <Toggle
                                        :model-value="store.settings.keepFiles"
                                        :label="$t('settings.torrents.keepFiles')"
                                        @update:model-value="store.update({ keepFiles: $event })"
                                    />
                                </SettingRow>
                            </div>
                            <CheckStatus class="mt-4" v-bind="folderStatus" @retry="checkFolder" />
                        </template>

                        <template v-else-if="current === 'network'">
                            <h1 class="font-display text-2xl font-semibold tracking-tight">
                                {{ $t('setup.networkStep.title') }}
                            </h1>
                            <p class="mt-2 text-sm text-white/50">
                                {{ $t('setup.networkStep.body') }}
                            </p>
                            <CheckStatus
                                class="mt-6"
                                v-bind="networkStatus"
                                @retry="checkNetwork"
                            />
                        </template>

                        <template v-else>
                            <h1 class="font-display text-2xl font-semibold tracking-tight">
                                {{ $t('setup.sources.title') }}
                            </h1>
                            <p class="mt-2 mb-6 text-sm text-white/50">
                                {{ $t('setup.sources.body') }}
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
                        {{ $t('common.back') }}
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
