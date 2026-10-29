<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Check, Copy, FolderOpen, RotateCcw, UserRound } from '@lucide/vue';
import { LOG_LEVELS, TITLE_LANGUAGES, type AppInfo, type AppSettings } from '@shared/ipc/api';
import { useSettingsStore } from '../stores/settings';
import { useAccountsStore } from '../stores/accounts';
import SettingsSection from '../components/settings/SettingsSection.vue';
import SettingRow from '../components/settings/SettingRow.vue';
import SectionSidebar from '../components/SectionSidebar.vue';
import ExtensionsSettings from '../components/settings/ExtensionsSettings.vue';
import SelectMenu from '../components/ui/SelectMenu.vue';
import Toggle from '../components/ui/Toggle.vue';
import NumberField from '../components/ui/NumberField.vue';
import { BUTTON } from '../components/ui/styles';
import { openShortcuts } from '../lib/shortcuts';
import { i18n, t, translateOr } from '../i18n';

const SECTION_IDS = [
    'accounts',
    'interface',
    'player',
    'torrents',
    'discord',
    'extensions',
    'application',
    'about',
];
const SECTIONS = computed(() =>
    SECTION_IDS.map((id) => ({ id, label: t(`settings.sections.${id}`) }))
);

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

const store = useSettingsStore();
const accounts = useAccountsStore();
const anilistExpiry = computed(() => accounts.anilistExpiry());
const formatDate = (date: Date) =>
    date.toLocaleDateString(i18n.global.locale.value, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
const settings = computed(() => store.settings);
const cacheCount = ref<number | null>(null);

const languageOptions = computed(() => {
    const locale = i18n.global.locale.value;
    const names = new Intl.DisplayNames([locale], { type: 'language' });
    return [
        { value: '', label: t('common.off') },
        ...SUBTITLE_LANGUAGES.map((code) => ({
            value: code,
            label: names.of(code) ?? code,
        })).sort((a, b) => a.label.localeCompare(b.label, locale)),
    ];
});
const logLevelOptions = computed(() =>
    LOG_LEVELS.map((level) => ({ value: level, label: t(`settings.app.logLevels.${level}`) }))
);

const openDownloads = () => window.api.settings.openDownloads();
const openLogs = () => window.api.settings.openLogs();

async function clearCache() {
    await window.api.metadata.clearCache();
    cacheCount.value = 0;
}
const setLogLevel = (level: string) => store.update({ logLevel: level as AppSettings['logLevel'] });

const titleLanguageLabel = (value: string) =>
    translateOr(`settings.interface.titleLanguages.${value}`, value);
const titleLanguageOptions = computed(() =>
    TITLE_LANGUAGES.map((value) => {
        if (value !== 'ANILIST') return { value, label: titleLanguageLabel(value) };
        const label = accounts.anilist
            ? t('settings.interface.titleLanguages.anilist', {
                  language: titleLanguageLabel(accounts.anilist.titleLanguage ?? 'ROMAJI'),
              })
            : t('settings.interface.titleLanguages.anilistDisconnected');
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

onMounted(async () => {
    window.api.metadata.cacheCount().then((count) => (cacheCount.value = count));
    window.api.appInfo().then((value) => (info.value = value));
    await Promise.all([store.load(), accounts.load()]);
});
</script>

<template>
    <div class="flex min-h-full">
        <SectionSidebar :title="$t('common.settings')" :sections="SECTIONS" />

        <div v-if="settings" class="min-w-0 flex-1 px-8 py-8 pb-24">
            <div class="max-w-3xl space-y-12">
                <SettingsSection
                    id="accounts"
                    :title="$t('settings.sections.accounts')"
                    :description="$t('settings.accounts.description')"
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
                                {{ accounts.anilist?.name ?? $t('settings.accounts.anilist') }}
                            </p>
                            <p class="mt-0.5 text-xs text-white/45">
                                <template v-if="accounts.anilist && anilistExpiry">
                                    {{ $t('settings.accounts.service') }}
                                    <span v-if="anilistExpiry.expired" class="text-red-400">
                                        {{ $t('settings.accounts.expired') }}
                                    </span>
                                    <span v-else-if="anilistExpiry.soon" class="text-amber-400">
                                        {{
                                            $t('settings.accounts.expires', {
                                                when: anilistExpiry.relative,
                                            })
                                        }}
                                    </span>
                                    <template v-else>
                                        {{
                                            $t('settings.accounts.expires', {
                                                when: formatDate(anilistExpiry.date),
                                            })
                                        }}
                                    </template>
                                </template>
                                <template v-else>{{
                                    $t('settings.accounts.notConnected')
                                }}</template>
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
                                        ? $t('settings.accounts.waiting')
                                        : accounts.anilist
                                          ? $t('settings.accounts.reconnect')
                                          : $t('settings.accounts.connect')
                                }}
                            </button>
                            <button
                                v-if="accounts.anilist"
                                :class="BUTTON"
                                @click="accounts.disconnectAnilist"
                            >
                                {{ $t('settings.accounts.disconnect') }}
                            </button>
                        </div>
                    </div>
                    <SettingRow
                        v-if="accounts.anilist"
                        :title="$t('settings.accounts.sync')"
                        :description="$t('settings.accounts.syncDescription')"
                    >
                        <Toggle
                            :model-value="settings.syncProgress"
                            :label="$t('settings.accounts.sync')"
                            @update:model-value="store.update({ syncProgress: $event })"
                        />
                    </SettingRow>
                </SettingsSection>

                <SettingsSection
                    id="interface"
                    :title="$t('settings.sections.interface')"
                    :description="$t('settings.interface.description')"
                >
                    <SettingRow
                        :title="$t('settings.interface.titleLanguage')"
                        :description="$t('settings.interface.titleLanguageDescription')"
                    >
                        <SelectMenu
                            :model-value="settings.titleLanguage"
                            :options="titleLanguageOptions"
                            :placeholder="$t('settings.interface.titleLanguage')"
                            required
                            @update:model-value="setTitleLanguage"
                        />
                    </SettingRow>
                    <SettingRow
                        :title="$t('settings.interface.shortcuts')"
                        :description="$t('settings.interface.shortcutsDescription')"
                    >
                        <button :class="BUTTON" @click="openShortcuts">
                            {{ $t('settings.interface.view') }}
                        </button>
                    </SettingRow>
                    <SettingRow
                        :title="$t('settings.interface.holidays')"
                        :description="$t('settings.interface.holidaysDescription')"
                    >
                        <Toggle
                            :model-value="settings.holidayEffects"
                            :label="$t('settings.interface.holidays')"
                            @update:model-value="store.update({ holidayEffects: $event })"
                        />
                    </SettingRow>
                    <SettingRow
                        :title="$t('settings.interface.holidayCursor')"
                        :description="$t('settings.interface.holidayCursorDescription')"
                    >
                        <Toggle
                            :model-value="settings.holidayEffects && settings.holidayCursor"
                            :disabled="!settings.holidayEffects"
                            :label="$t('settings.interface.holidayCursor')"
                            @update:model-value="store.update({ holidayCursor: $event })"
                        />
                    </SettingRow>
                </SettingsSection>

                <SettingsSection
                    id="player"
                    :title="$t('settings.sections.player')"
                    :description="$t('settings.player.description')"
                >
                    <SettingRow
                        :title="$t('settings.player.subtitles')"
                        :description="$t('settings.player.subtitlesDescription')"
                    >
                        <SelectMenu
                            :model-value="settings.subtitleLanguage"
                            :options="languageOptions"
                            :placeholder="$t('common.off')"
                            scrollable
                            required
                            @update:model-value="store.update({ subtitleLanguage: $event })"
                        />
                    </SettingRow>
                    <SettingRow
                        :title="$t('settings.player.autoPick')"
                        :description="$t('settings.player.autoPickDescription')"
                    >
                        <Toggle
                            :model-value="settings.autoPickRelease"
                            :label="$t('settings.player.autoPick')"
                            @update:model-value="store.update({ autoPickRelease: $event })"
                        />
                    </SettingRow>
                    <SettingRow
                        :title="$t('settings.player.autoplay')"
                        :description="$t('settings.player.autoplayDescription')"
                    >
                        <Toggle
                            :model-value="settings.autoplayNext"
                            :label="$t('settings.player.autoplay')"
                            @update:model-value="store.update({ autoplayNext: $event })"
                        />
                    </SettingRow>
                    <SettingRow
                        :title="$t('settings.player.stats')"
                        :description="$t('settings.player.statsDescription')"
                    >
                        <Toggle
                            :model-value="settings.showStreamStats"
                            :label="$t('settings.player.stats')"
                            @update:model-value="store.update({ showStreamStats: $event })"
                        />
                    </SettingRow>
                </SettingsSection>

                <SettingsSection
                    id="torrents"
                    :title="$t('settings.sections.torrents')"
                    :description="$t('settings.torrents.description')"
                >
                    <SettingRow :title="$t('settings.torrents.location')">
                        <template #description>
                            <span class="font-mono text-[11px] break-all text-white/55">
                                {{ store.downloadPath }}
                            </span>
                            <span v-if="!settings.downloadPath" class="ml-1.5">{{
                                $t('common.default')
                            }}</span>
                        </template>
                        <button
                            v-if="settings.downloadPath"
                            :class="BUTTON"
                            :title="$t('common.resetDefault')"
                            @click="store.update({ downloadPath: null })"
                        >
                            <RotateCcw :size="14" />
                        </button>
                        <button
                            :class="BUTTON"
                            :title="$t('settings.torrents.openFolder')"
                            @click="openDownloads"
                        >
                            <FolderOpen :size="14" />
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
                            :model-value="settings.keepFiles"
                            :label="$t('settings.torrents.keepFiles')"
                            @update:model-value="store.update({ keepFiles: $event })"
                        />
                    </SettingRow>
                    <SettingRow
                        :title="$t('settings.torrents.downloadLimit')"
                        :description="$t('settings.torrents.noLimit')"
                    >
                        <NumberField
                            :model-value="toMegabytes(settings.downloadLimit)"
                            :suffix="$t('settings.torrents.speedUnit')"
                            :placeholder="$t('settings.torrents.unlimited')"
                            :step="0.5"
                            @update:model-value="
                                store.update({ downloadLimit: toKilobytes($event) })
                            "
                        />
                    </SettingRow>
                    <SettingRow
                        :title="$t('settings.torrents.uploadLimit')"
                        :description="$t('settings.torrents.noLimit')"
                    >
                        <NumberField
                            :model-value="toMegabytes(settings.uploadLimit)"
                            :suffix="$t('settings.torrents.speedUnit')"
                            :placeholder="$t('settings.torrents.unlimited')"
                            :step="0.5"
                            @update:model-value="store.update({ uploadLimit: toKilobytes($event) })"
                        />
                    </SettingRow>
                    <SettingRow
                        :title="$t('settings.torrents.connections')"
                        :description="$t('settings.torrents.connectionsDescription')"
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
                    id="discord"
                    :title="$t('settings.sections.discord')"
                    :description="$t('settings.discord.description')"
                >
                    <SettingRow
                        :title="$t('settings.discord.status')"
                        :description="$t('settings.discord.statusDescription')"
                    >
                        <Toggle
                            :model-value="settings.discordPresence"
                            :label="$t('settings.discord.status')"
                            @update:model-value="store.update({ discordPresence: $event })"
                        />
                    </SettingRow>
                    <SettingRow
                        v-if="settings.discordPresence"
                        :title="$t('settings.discord.details')"
                        :description="$t('settings.discord.detailsDescription')"
                    >
                        <Toggle
                            :model-value="settings.discordShowDetails"
                            :label="$t('settings.discord.details')"
                            @update:model-value="store.update({ discordShowDetails: $event })"
                        />
                    </SettingRow>
                </SettingsSection>

                <SettingsSection
                    id="extensions"
                    :title="$t('settings.sections.extensions')"
                    :description="$t('settings.extensions.description')"
                    bare
                >
                    <ExtensionsSettings />
                </SettingsSection>

                <SettingsSection
                    id="application"
                    :title="$t('settings.sections.application')"
                    :description="$t('settings.app.description')"
                >
                    <SettingRow
                        :title="$t('settings.app.logLevel')"
                        :description="$t('settings.app.logLevelDescription')"
                    >
                        <SelectMenu
                            :model-value="settings.logLevel"
                            :options="logLevelOptions"
                            :placeholder="$t('settings.app.logLevel')"
                            required
                            @update:model-value="setLogLevel"
                        />
                    </SettingRow>
                    <SettingRow
                        :title="$t('settings.app.logToFile')"
                        :description="$t('settings.app.logToFileDescription')"
                    >
                        <button :class="BUTTON" @click="openLogs">
                            <FolderOpen :size="14" /> {{ $t('settings.torrents.openFolder') }}
                        </button>
                        <Toggle
                            :model-value="settings.logToFile"
                            :label="$t('settings.app.logToFile')"
                            @update:model-value="store.update({ logToFile: $event })"
                        />
                    </SettingRow>
                    <SettingRow
                        :title="$t('settings.app.devTools')"
                        :description="
                            info?.packaged === false
                                ? $t('settings.app.devToolsDev')
                                : $t('settings.app.devToolsDescription')
                        "
                    >
                        <Toggle
                            :model-value="settings.devTools || info?.packaged === false"
                            :disabled="info?.packaged === false"
                            :label="$t('settings.app.devTools')"
                            @update:model-value="store.update({ devTools: $event })"
                        />
                    </SettingRow>
                    <SettingRow
                        :title="$t('settings.app.cache')"
                        :description="$t('settings.app.cacheDescription')"
                    >
                        <span v-if="cacheCount !== null" class="text-xs text-white/40 tabular-nums">
                            {{ $t('settings.app.cacheEntries', { n: cacheCount }, cacheCount) }}
                        </span>
                        <button :class="BUTTON" :disabled="!cacheCount" @click="clearCache">
                            {{ $t('common.clear') }}
                        </button>
                    </SettingRow>
                </SettingsSection>

                <SettingsSection id="about" :title="$t('settings.sections.about')">
                    <button
                        v-if="info"
                        class="group flex w-full cursor-pointer items-center gap-6 px-5 py-4 text-left"
                        :title="$t('settings.about.copyInfo')"
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
                            {{ copied ? $t('settings.about.copied') : $t('settings.about.copy') }}
                        </span>
                    </button>
                    <p class="px-5 py-4 text-xs leading-relaxed text-white/45">
                        {{ $t('settings.about.tmdb') }}
                    </p>
                </SettingsSection>
            </div>
        </div>
    </div>
</template>
