<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { FolderOpen, RotateCcw } from '@lucide/vue';
import { LOG_LEVELS, type AppSettings } from '@shared/ipc/api';
import { useSettingsStore } from '../stores/settings';
import SettingsSection from '../components/settings/SettingsSection.vue';
import SettingRow from '../components/settings/SettingRow.vue';
import ExtensionsSettings from '../components/settings/ExtensionsSettings.vue';
import SelectMenu from '../components/ui/SelectMenu.vue';
import Toggle from '../components/ui/Toggle.vue';
import NumberField from '../components/ui/NumberField.vue';

const SECTIONS = [
    { id: 'playback', label: 'Playback' },
    { id: 'torrents', label: 'Torrents' },
    { id: 'extensions', label: 'Extensions' },
    { id: 'advanced', label: 'Advanced' },
];

const SUBTITLE_LANGUAGES = [
    'ar',
    'cs',
    'da',
    'de',
    'el',
    'en',
    'es',
    'fi',
    'fr',
    'he',
    'hi',
    'hu',
    'id',
    'it',
    'ja',
    'ko',
    'ms',
    'nl',
    'no',
    'pl',
    'pt',
    'ro',
    'ru',
    'sv',
    'th',
    'tr',
    'uk',
    'vi',
    'zh',
];

const BUTTON =
    'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-white/8 px-3 text-sm font-medium transition-colors hover:bg-white/14 disabled:cursor-default disabled:opacity-40';

const store = useSettingsStore();
const settings = computed(() => store.settings);
const activeSection = ref(SECTIONS[0].id);
const cacheCount = ref<number | null>(null);

const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });
const languageOptions = [
    { value: '', label: 'Off' },
    ...SUBTITLE_LANGUAGES.map((code) => ({
        value: code,
        label: languageNames.of(code) ?? code,
    })).sort((a, b) => a.label.localeCompare(b.label)),
];
const logLevelOptions = LOG_LEVELS.map((level) => ({
    value: level,
    label: level[0].toUpperCase() + level.slice(1),
}));

const downloadPath = computed(
    () => settings.value?.downloadPath ?? store.paths?.defaultDownloadPath ?? ''
);

async function chooseDownloadPath() {
    const folder = await window.api.settings.chooseFolder(downloadPath.value);
    if (folder) await store.update({ downloadPath: folder });
}

const openDownloads = () => window.api.settings.openDownloads();
const openLogs = () => window.api.settings.openLogs();

async function clearCache() {
    await window.api.metadata.clearCache();
    cacheCount.value = 0;
}
const setLogLevel = (level: string) => store.update({ logLevel: level as AppSettings['logLevel'] });

const toMegabytes = (kilobytes: number) => Math.round((kilobytes / 1024) * 10) / 10;
const toKilobytes = (megabytes: number) => Math.round(megabytes * 1024);

function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

let scroller: HTMLElement | null = null;

function updateActiveSection() {
    if (!scroller) return;
    if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) {
        activeSection.value = SECTIONS[SECTIONS.length - 1].id;
        return;
    }
    const threshold = scroller.getBoundingClientRect().top + 120;
    activeSection.value =
        SECTIONS.filter(
            ({ id }) => (document.getElementById(id)?.getBoundingClientRect().top ?? 0) <= threshold
        ).pop()?.id ?? SECTIONS[0].id;
}

onMounted(async () => {
    window.api.metadata.cacheCount().then((count) => (cacheCount.value = count));
    await store.load();
    scroller = document.querySelector('main');
    scroller?.addEventListener('scroll', updateActiveSection, { passive: true });
    updateActiveSection();
});

onUnmounted(() => scroller?.removeEventListener('scroll', updateActiveSection));
</script>

<template>
    <div class="flex min-h-full">
        <aside class="sticky top-0 w-56 shrink-0 self-start px-5 py-8">
            <h1 class="px-3 font-display text-2xl font-semibold tracking-tight">Settings</h1>
            <nav class="mt-6 space-y-0.5">
                <button
                    v-for="section in SECTIONS"
                    :key="section.id"
                    :class="[
                        'block w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm transition-colors',
                        activeSection === section.id
                            ? 'bg-white/8 font-medium text-white'
                            : 'text-white/50 hover:text-white',
                    ]"
                    @click="scrollTo(section.id)"
                >
                    {{ section.label }}
                </button>
            </nav>
        </aside>

        <div v-if="settings" class="min-w-0 flex-1 px-8 py-8 pb-24">
            <div class="max-w-3xl space-y-12">
                <SettingsSection id="playback" title="Playback">
                    <SettingRow
                        title="Preferred subtitles"
                        description="Selected automatically when an episode starts. Signs & songs tracks are skipped."
                    >
                        <SelectMenu
                            :model-value="settings.subtitleLanguage"
                            :options="languageOptions"
                            placeholder="Off"
                            scrollable
                            required
                            @update:model-value="store.update({ subtitleLanguage: $event })"
                        />
                    </SettingRow>
                </SettingsSection>

                <SettingsSection
                    id="torrents"
                    title="Torrents"
                    description="Where episodes are downloaded to and how much bandwidth streaming may use."
                >
                    <SettingRow title="Download location">
                        <template #description>
                            <span class="font-mono text-[11px] break-all text-white/55">
                                {{ downloadPath }}
                            </span>
                            <span v-if="!settings.downloadPath" class="ml-1.5">(default)</span>
                        </template>
                        <button
                            v-if="settings.downloadPath"
                            :class="BUTTON"
                            title="Reset to default"
                            @click="store.update({ downloadPath: null })"
                        >
                            <RotateCcw :size="14" />
                        </button>
                        <button :class="BUTTON" title="Open folder" @click="openDownloads">
                            <FolderOpen :size="14" />
                        </button>
                        <button :class="BUTTON" @click="chooseDownloadPath">Change</button>
                    </SettingRow>
                    <SettingRow
                        title="Keep downloaded episodes"
                        description="Leave files on disk after you stop watching, so replaying them starts instantly. When off, files are deleted as soon as playback stops."
                    >
                        <Toggle
                            :model-value="settings.keepFiles"
                            label="Keep downloaded episodes"
                            @update:model-value="store.update({ keepFiles: $event })"
                        />
                    </SettingRow>
                    <SettingRow title="Download limit" description="Leave empty for no limit.">
                        <NumberField
                            :model-value="toMegabytes(settings.downloadLimit)"
                            suffix="MB/s"
                            placeholder="Unlimited"
                            :step="0.5"
                            @update:model-value="
                                store.update({ downloadLimit: toKilobytes($event) })
                            "
                        />
                    </SettingRow>
                    <SettingRow title="Upload limit" description="Leave empty for no limit.">
                        <NumberField
                            :model-value="toMegabytes(settings.uploadLimit)"
                            suffix="MB/s"
                            placeholder="Unlimited"
                            :step="0.5"
                            @update:model-value="store.update({ uploadLimit: toKilobytes($event) })"
                        />
                    </SettingRow>
                    <SettingRow
                        title="Maximum connections"
                        description="Peers per torrent. More can be faster, but uses more resources."
                    >
                        <NumberField
                            :model-value="settings.maxConnections"
                            :min="1"
                            :max="500"
                            @update:model-value="store.update({ maxConnections: $event })"
                        />
                    </SettingRow>
                </SettingsSection>

                <SettingsSection
                    id="extensions"
                    title="Extensions"
                    description="Sources the release picker searches."
                    bare
                >
                    <ExtensionsSettings />
                </SettingsSection>

                <SettingsSection id="advanced" title="Advanced">
                    <SettingRow
                        title="Log level"
                        description="How much detail is written to the log."
                    >
                        <SelectMenu
                            :model-value="settings.logLevel"
                            :options="logLevelOptions"
                            placeholder="Log level"
                            required
                            @update:model-value="setLogLevel"
                        />
                    </SettingRow>
                    <SettingRow
                        title="Write logs to file"
                        description="Useful when reporting a bug."
                    >
                        <button :class="BUTTON" @click="openLogs">
                            <FolderOpen :size="14" /> Open folder
                        </button>
                        <Toggle
                            :model-value="settings.logToFile"
                            label="Write logs to file"
                            @update:model-value="store.update({ logToFile: $event })"
                        />
                    </SettingRow>
                    <SettingRow
                        title="Metadata cache"
                        description="Show info and episode lists are kept offline and refreshed in the background."
                    >
                        <span v-if="cacheCount !== null" class="text-xs text-white/40 tabular-nums">
                            {{ cacheCount }} entries
                        </span>
                        <button :class="BUTTON" :disabled="!cacheCount" @click="clearCache">
                            Clear
                        </button>
                    </SettingRow>
                </SettingsSection>
            </div>
        </div>
    </div>
</template>
