<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Check, Copy, FolderOpen, RotateCcw, UserRound } from '@lucide/vue';
import { LOG_LEVELS, TITLE_LANGUAGES, type AppInfo, type AppSettings } from '@shared/ipc/api';
import { useSettingsStore } from '../stores/settings';
import { useAccountsStore } from '../stores/accounts';
import SettingsSection from '../components/settings/SettingsSection.vue';
import SettingRow from '../components/settings/SettingRow.vue';
import ExtensionsSettings from '../components/settings/ExtensionsSettings.vue';
import SelectMenu from '../components/ui/SelectMenu.vue';
import Toggle from '../components/ui/Toggle.vue';
import NumberField from '../components/ui/NumberField.vue';

const SECTIONS = [
    { id: 'accounts', label: 'Accounts' },
    { id: 'client', label: 'Client' },
    { id: 'playback', label: 'Playback' },
    { id: 'torrents', label: 'Torrents' },
    { id: 'extensions', label: 'Extensions' },
    { id: 'advanced', label: 'Advanced' },
    { id: 'about', label: 'About' },
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
const accounts = useAccountsStore();
const anilistExpiry = computed(() => accounts.anilistExpiry());
const formatDate = (date: Date) =>
    date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
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

const openDownloads = () => window.api.settings.openDownloads();
const openLogs = () => window.api.settings.openLogs();

async function clearCache() {
    await window.api.metadata.clearCache();
    cacheCount.value = 0;
}
const setLogLevel = (level: string) => store.update({ logLevel: level as AppSettings['logLevel'] });

const TITLE_LANGUAGE_LABELS: Record<string, string> = {
    ROMAJI: 'Romaji',
    ENGLISH: 'English',
    NATIVE: 'Native',
};
const titleLanguageOptions = computed(() =>
    TITLE_LANGUAGES.map((value) => {
        const fromAccount = TITLE_LANGUAGE_LABELS[accounts.anilist?.titleLanguage ?? 'ROMAJI'];
        const label =
            value === 'ANILIST'
                ? `AniList (${accounts.anilist ? fromAccount : 'romaji when not connected'})`
                : TITLE_LANGUAGE_LABELS[value];
        return { value, label };
    })
);
const setTitleLanguage = (value: string) =>
    store.update({ titleLanguage: value as AppSettings['titleLanguage'] });

const info = ref<AppInfo | null>(null);
const copied = ref(false);
const infoLines = computed(() => {
    const i = info.value;
    if (!i) return [];
    return [
        `akko ${i.version} (${i.commit})`,
        `${i.platform} ${i.os} ${i.arch}`,
        `Electron ${i.electron}, Chromium ${i.chrome}`,
    ];
});
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

async function copyInfo() {
    await navigator.clipboard.writeText(infoLines.value.join('\n'));
    copied.value = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (copied.value = false), 1500);
}

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
    window.api.appInfo().then((value) => (info.value = value));
    await Promise.all([store.load(), accounts.load()]);
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
                <SettingsSection
                    id="accounts"
                    title="Accounts"
                    description="Sync your lists and watch progress with a tracking site."
                >
                    <div class="flex items-center gap-4 px-5 py-4">
                        <img
                            v-if="accounts.anilist?.avatar"
                            :src="accounts.anilist.avatar"
                            :class="[
                                'size-10 shrink-0 rounded-full object-cover',
                                anilistExpiry?.expired && 'opacity-50 grayscale',
                            ]"
                            alt=""
                        />
                        <div
                            v-else
                            class="grid size-10 shrink-0 place-items-center rounded-full bg-white/8 text-white/40"
                        >
                            <UserRound :size="18" />
                        </div>
                        <div class="min-w-0 flex-1">
                            <p class="truncate text-sm font-medium">
                                {{ accounts.anilist?.name ?? 'AniList' }}
                            </p>
                            <p class="mt-0.5 text-xs text-white/45">
                                <template v-if="accounts.anilist && anilistExpiry">
                                    AniList ·
                                    <span v-if="anilistExpiry.expired" class="text-red-400">
                                        login expired
                                    </span>
                                    <span v-else-if="anilistExpiry.soon" class="text-amber-400">
                                        login expires {{ anilistExpiry.relative }}
                                    </span>
                                    <template v-else>
                                        login expires {{ formatDate(anilistExpiry.date) }}
                                    </template>
                                </template>
                                <template v-else>Not connected</template>
                            </p>
                        </div>
                        <div class="flex shrink-0 items-center gap-2">
                            <button
                                v-if="
                                    !accounts.anilist ||
                                    anilistExpiry?.expired ||
                                    anilistExpiry?.soon
                                "
                                :class="BUTTON"
                                :disabled="accounts.connecting"
                                @click="accounts.connectAnilist"
                            >
                                {{
                                    accounts.connecting
                                        ? 'Waiting for AniList…'
                                        : accounts.anilist
                                          ? 'Reconnect'
                                          : 'Connect'
                                }}
                            </button>
                            <button
                                v-if="accounts.anilist"
                                :class="BUTTON"
                                @click="accounts.disconnectAnilist"
                            >
                                Disconnect
                            </button>
                        </div>
                    </div>
                    <SettingRow
                        v-if="accounts.anilist"
                        title="Sync watch progress"
                        description="Marks episodes as watched near the end, and puts a show on Watching once you've watched it for 5 minutes."
                    >
                        <Toggle
                            :model-value="settings.syncProgress"
                            label="Sync watch progress"
                            @update:model-value="store.update({ syncProgress: $event })"
                        />
                    </SettingRow>
                </SettingsSection>

                <SettingsSection id="client" title="Client">
                    <SettingRow
                        title="Title language"
                        description="How anime titles are shown. AniList follows your account's setting."
                    >
                        <SelectMenu
                            :model-value="settings.titleLanguage"
                            :options="titleLanguageOptions"
                            placeholder="Title language"
                            required
                            @update:model-value="setTitleLanguage"
                        />
                    </SettingRow>
                </SettingsSection>

                <SettingsSection id="playback" title="Playback">
                    <SettingRow
                        title="Preferred subtitles"
                        description="Selected automatically when an episode starts."
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
                    <SettingRow
                        title="Pick releases automatically"
                        description="Plays the top pick a few seconds after the search finishes, unless you start browsing the results."
                    >
                        <Toggle
                            :model-value="settings.autoPickRelease"
                            label="Pick releases automatically"
                            @update:model-value="store.update({ autoPickRelease: $event })"
                        />
                    </SettingRow>
                    <SettingRow
                        title="Autoplay next episode"
                        description="Counts down when an episode ends, then plays the next one."
                    >
                        <Toggle
                            :model-value="settings.autoplayNext"
                            label="Autoplay next episode"
                            @update:model-value="store.update({ autoplayNext: $event })"
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
                                {{ store.downloadPath }}
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
                        <button :class="BUTTON" @click="store.chooseDownloadPath">Change</button>
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

                <SettingsSection id="about" title="About">
                    <button
                        v-if="info"
                        class="group flex w-full cursor-pointer items-center gap-6 px-5 py-4 text-left"
                        title="Copy version info"
                        @click="copyInfo"
                    >
                        <div class="min-w-0 flex-1">
                            <p class="text-sm font-medium">
                                akko {{ info.version }}
                                <span class="ml-1 font-mono text-xs font-normal text-white/40">
                                    {{ info.commit }}
                                </span>
                            </p>
                            <p
                                class="mt-0.5 text-xs leading-relaxed text-white/45 [font-feature-settings:'calt'_0]"
                            >
                                {{ infoLines[1] }} · {{ infoLines[2] }}
                            </p>
                        </div>
                        <span
                            :class="[
                                'flex shrink-0 items-center gap-1.5 text-xs transition-colors',
                                copied
                                    ? 'text-white/70'
                                    : 'text-white/30 group-hover:text-white/60',
                            ]"
                        >
                            <component :is="copied ? Check : Copy" :size="14" />
                            {{ copied ? 'Copied' : 'Copy' }}
                        </span>
                    </button>
                    <p class="px-5 py-4 text-xs leading-relaxed text-white/45">
                        Title logos come from TMDB. This product uses the TMDB API but is not
                        endorsed or certified by TMDB.
                    </p>
                </SettingsSection>
            </div>
        </div>
    </div>
</template>
