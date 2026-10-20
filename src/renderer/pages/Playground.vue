<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { FlaskConical, RefreshCw } from '@lucide/vue';
import { episodeToSummary, mediaToSummary, type WatchSelection } from '@shared/media/types';
import { formatTimestamp, finishedAt } from '../lib/watching';
import { errorMessage } from '../lib/format';
import { toast, toasts } from '../lib/toast';
import { useAccountsStore } from '../stores/accounts';
import { useExtensionStore } from '../stores/extensions';
import { useLoadingStore } from '../stores/loading';
import { useMediaStore } from '../stores/media';
import { usePlayerStore } from '../stores/player';
import { useSettingsStore } from '../stores/settings';
import SectionSidebar from '../components/SectionSidebar.vue';
import SettingsSection from '../components/settings/SettingsSection.vue';
import SettingRow from '../components/settings/SettingRow.vue';
import SelectMenu from '../components/ui/SelectMenu.vue';
import MultiSelectMenu from '../components/ui/MultiSelectMenu.vue';
import Toggle from '../components/ui/Toggle.vue';
import NumberField from '../components/ui/NumberField.vue';
import CountdownButton from '../components/ui/CountdownButton.vue';
import Badge from '../components/ui/Badge.vue';
import { BUTTON } from '../components/ui/styles';
import LogoMark from '../components/LogoMark.vue';
import appIcon from '../../../assets/icon.svg?url';

const SECTIONS = [
    { id: 'player', label: 'Player' },
    { id: 'feedback', label: 'Toasts and loading' },
    { id: 'components', label: 'Components' },
    { id: 'extensions', label: 'Extensions' },
    { id: 'logo', label: 'Logo' },
    { id: 'general', label: 'App' },
];

const router = useRouter();
const player = usePlayerStore();
const mediaStore = useMediaStore();
const accounts = useAccountsStore();
const settingsStore = useSettingsStore();
const extensions = useExtensionStore();
const loadingBar = useLoadingStore();

onMounted(() => {
    void extensions.refresh();
    if (!mediaStore.dashboard) void mediaStore.fetchDashboard();
});

// ─── test clip ────────────────────────────────────────────────────────────────
const showId = ref('');
const episodeNumber = ref(1);
const clipName = ref<string | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
let clipUrl: string | null = null;

const showOptions = computed(() =>
    (mediaStore.dashboard?.trending?.media ?? [])
        .filter((media) => media !== null)
        .map((media) => ({ value: String(media.id), label: accounts.titleOf(media) }))
);

async function selectionFor(fileName: string): Promise<WatchSelection> {
    const torrent = { title: fileName, magnet: 'playground' };
    const media = showId.value ? mediaStore.mediaFor(Number(showId.value)) : null;
    if (!media) {
        return {
            media: { anilistId: 0, title: 'Test clip' },
            episode: {
                key: 'playground',
                number: episodeNumber.value,
                season: null,
                seasonEpisode: null,
                absoluteNumber: null,
                source: 'anizip',
            },
            torrent,
        };
    }
    await mediaStore.preloadMedia(media.id);
    const episode = mediaStore
        .episodesFor(media.id)
        .find((ep) => ep.number === episodeNumber.value);
    if (!episode)
        throw new Error(`${accounts.titleOf(media)} has no episode ${episodeNumber.value}`);
    return {
        media: mediaToSummary(media, accounts.titleOf(media)),
        episode: episodeToSummary(episode),
        torrent,
    };
}

async function playClip(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
        const selection = await selectionFor(file.name);
        await player.stopStream();
        if (clipUrl) URL.revokeObjectURL(clipUrl);
        clipUrl = URL.createObjectURL(file);
        player.selection = selection;
        // Treated like a release whose file didn't match the episode, so watch progress isn't
        // saved and nothing is synced to AniList
        player.fileMatch = 'fallback';
        player.streamUrl = clipUrl;
        clipName.value = file.name;
    } catch (err) {
        toast.error(`Couldn't play the clip: ${errorMessage(err)}`);
    }
}

async function stopClip() {
    await player.stopStream();
    clipName.value = null;
    fakeStats.value = false;
}

const nowPlaying = computed(() => {
    if (!player.selection) return 'Nothing is playing.';
    const { media, episode } = player.selection;
    const position = player.duration
        ? ` · ${formatTimestamp(player.currentTime)} of ${formatTimestamp(player.duration)}`
        : '';
    return `${media.title}, episode ${episode.number}${position}`;
});

// The player's own video element, which keeps playing in the mini player on this page
function seekTo(time: number) {
    const video = document.querySelector<HTMLVideoElement>('media-container video');
    if (video) video.currentTime = Math.max(0, time);
}

// ─── fake torrent stats ───────────────────────────────────────────────────────
const FAKE_SIZE = 1.4e9;
const fakeStats = ref(false);
let statsTimer: ReturnType<typeof setInterval> | undefined;

function tickStats() {
    const progress = Math.min(1, (player.stats?.progress ?? 0.08) + 0.012);
    player.stats = {
        downloadSpeed: 1.5e6 + Math.random() * 7e6,
        uploadSpeed: 8e4 + Math.random() * 6e5,
        peers: 18 + Math.floor(Math.random() * 40),
        progress,
        downloaded: FAKE_SIZE * progress,
        size: FAKE_SIZE,
    };
}

watch(fakeStats, (on) => {
    clearInterval(statsTimer);
    if (!on) {
        player.stats = null;
        return;
    }
    tickStats();
    statsTimer = setInterval(tickStats, 1000);
});

onUnmounted(() => clearInterval(statsTimer));

function showStatus(state: 'loading' | 'error' | null) {
    player.loading = state === 'loading';
    player.error = state === 'error' ? 'No peers found for this release after 60 seconds.' : null;
}

// ─── toasts and loading ───────────────────────────────────────────────────────
const SAMPLE_TOASTS = [
    () => toast.success('Marked Frieren as watching'),
    () => toast.info('All extensions up to date'),
    () => toast.warn('Your AniList login expires in 3 days. Reconnect it to renew it.'),
    () => toast.error("Couldn't update your list: Network request failed"),
];

function toastWithAction() {
    toast.success('Updated progress to episode 7', {
        action: { label: 'Undo', onClick: () => toast.info('Undone') },
    });
}

function burst() {
    SAMPLE_TOASTS.concat(SAMPLE_TOASTS.slice(0, 2)).forEach((show, i) => setTimeout(show, i * 150));
}

async function simulateLoad() {
    loadingBar.start();
    await new Promise((resolve) => setTimeout(resolve, 2000));
    loadingBar.finish();
}

// ─── components ───────────────────────────────────────────────────────────────
const DEMO_OPTIONS = [
    { value: 'sub', label: 'Subbed' },
    { value: 'dub', label: 'Dubbed' },
    { value: 'raw', label: 'Raw' },
];
const DEMO_GENRES = ['Action', 'Comedy', 'Drama', 'Fantasy', 'Romance'].map((genre) => ({
    value: genre,
    label: genre,
}));
const selectValue = ref('sub');
const genres = ref<string[]>(['Fantasy']);
const toggleValue = ref(true);
const numberValue = ref(12);
const countdownKey = ref(0);

// ─── extensions ───────────────────────────────────────────────────────────────
type CheckState = 'checking' | 'current' | { version: string } | { error: string };
type TestState = 'running' | 'passed' | 'failed' | { error: string };

const updates = ref<Record<string, CheckState>>({});
const tests = ref<Record<string, TestState>>({});
const checking = computed(() => Object.values(updates.value).includes('checking'));

async function checkUpdates() {
    for (const ext of extensions.installed) updates.value[ext.id] = 'checking';
    try {
        const found = new Map(
            (await window.api.extensions.checkUpdates()).map((u) => [u.id, u.newVersion])
        );
        for (const ext of extensions.installed) {
            const version = found.get(ext.id);
            updates.value[ext.id] = version ? { version } : 'current';
        }
        await extensions.refresh();
    } catch (err) {
        for (const ext of extensions.installed)
            updates.value[ext.id] = { error: errorMessage(err) };
    }
}

async function runTest(id: string) {
    tests.value[id] = 'running';
    try {
        tests.value[id] = (await window.api.extensions.test(id)) ? 'passed' : 'failed';
    } catch (err) {
        tests.value[id] = { error: errorMessage(err) };
    }
}

function extensionStatus(id: string): { text: string; tone: string } | null {
    const test = tests.value[id];
    const update = updates.value[id];
    if (test === 'running') return { text: 'Testing…', tone: 'text-white/45' };
    if (test === 'passed') return { text: 'Test passed', tone: 'text-emerald-400' };
    if (test === 'failed') return { text: 'Test failed', tone: 'text-red-400' };
    if (test) return { text: `Test failed: ${test.error}`, tone: 'text-red-400' };
    if (update === 'checking') return { text: 'Checking for updates…', tone: 'text-white/45' };
    if (update === 'current') return { text: 'Up to date', tone: 'text-emerald-400' };
    if (update && 'version' in update) {
        return { text: `Version ${update.version} available`, tone: 'text-amber-400' };
    }
    if (update) return { text: `Update check failed: ${update.error}`, tone: 'text-red-400' };
    return null;
}

// ─── logo ─────────────────────────────────────────────────────────────────────
const LOGO_SIZES = [16, 20, 28, 48, 96];
const LOGO_BACKGROUNDS = [
    { label: 'On dark', class: 'bg-canvas text-white' },
    { label: 'On light', class: 'bg-neutral-200 text-neutral-900' },
];

// ─── app ──────────────────────────────────────────────────────────────────────
async function restartOnboarding() {
    await settingsStore.update({ onboarded: false });
    await router.push('/setup');
}
</script>

<template>
    <div class="flex min-h-full">
        <SectionSidebar title="Playground" :sections="SECTIONS" />

        <div class="min-w-0 flex-1 px-8 py-8 pb-24">
            <div class="max-w-3xl space-y-12">
                <SettingsSection
                    id="player"
                    title="Player"
                    description="Play a video from your computer to try the player without a torrent. It keeps playing in the mini player while you're on this page."
                >
                    <SettingRow
                        title="Test clip"
                        description="Pick a show to try Up next and episode titles, or leave it empty. Nothing from a test clip is saved to watch progress or synced to AniList."
                    >
                        <SelectMenu
                            v-model="showId"
                            :options="showOptions"
                            placeholder="No show"
                            scrollable
                        />
                        <NumberField v-model="episodeNumber" :min="1" placeholder="Ep" />
                        <button :class="BUTTON" @click="fileInput?.click()">Choose video…</button>
                        <input
                            ref="fileInput"
                            type="file"
                            accept="video/*,.mkv"
                            class="hidden"
                            @change="playClip"
                        />
                    </SettingRow>
                    <SettingRow title="Now playing" :description="nowPlaying">
                        <button
                            :class="BUTTON"
                            :disabled="!player.streamUrl"
                            @click="router.push('/player')"
                        >
                            Open player
                        </button>
                        <button :class="BUTTON" :disabled="!player.selection" @click="stopClip">
                            Stop
                        </button>
                    </SettingRow>
                    <SettingRow
                        title="Skip ahead"
                        description="Jump to where the episode counts as watched, or to a few seconds before the end to see Up next."
                    >
                        <button
                            :class="BUTTON"
                            :disabled="!player.duration"
                            @click="seekTo(finishedAt(player.duration))"
                        >
                            Watched point
                        </button>
                        <button
                            :class="BUTTON"
                            :disabled="!player.duration"
                            @click="seekTo(player.duration - 5)"
                        >
                            Near the end
                        </button>
                    </SettingRow>
                    <SettingRow
                        title="Fake torrent stats"
                        description="Fills the stats at the top of the player with made-up numbers that change every second."
                    >
                        <Toggle v-model="fakeStats" label="Fake torrent stats" />
                    </SettingRow>
                    <SettingRow
                        title="Status screen"
                        description="What the player shows while a torrent connects, or when it fails."
                    >
                        <button :class="BUTTON" @click="showStatus('loading')">Connecting</button>
                        <button :class="BUTTON" @click="showStatus('error')">Error</button>
                        <button
                            :class="BUTTON"
                            :disabled="!player.loading && !player.error"
                            @click="showStatus(null)"
                        >
                            Clear
                        </button>
                    </SettingRow>
                    <SettingRow
                        v-if="settingsStore.settings"
                        title="Autoplay next episode"
                        description="The same switch as in Settings, here for convenience."
                    >
                        <Toggle
                            :model-value="settingsStore.settings.autoplayNext"
                            label="Autoplay next episode"
                            @update:model-value="settingsStore.update({ autoplayNext: $event })"
                        />
                    </SettingRow>
                </SettingsSection>

                <SettingsSection id="feedback" title="Toasts and loading">
                    <SettingRow title="Kinds" description="One of each, with real messages.">
                        <button
                            v-for="(show, i) in SAMPLE_TOASTS"
                            :key="i"
                            :class="BUTTON"
                            @click="show()"
                        >
                            {{ ['Success', 'Info', 'Warning', 'Error'][i] }}
                        </button>
                    </SettingRow>
                    <SettingRow
                        title="With a button"
                        description="Stays up longer, and closes when the button is used."
                    >
                        <button :class="BUTTON" @click="toastWithAction">Show</button>
                    </SettingRow>
                    <SettingRow title="Stays open" description="Only closes when dismissed.">
                        <button
                            :class="BUTTON"
                            @click="
                                toast.error(
                                    'Your AniList login expired. Reconnect it to keep syncing.',
                                    {
                                        duration: false,
                                    }
                                )
                            "
                        >
                            Show
                        </button>
                    </SettingRow>
                    <SettingRow
                        title="Burst"
                        description="Six in a row, so the oldest fold into the stack."
                    >
                        <button :class="BUTTON" @click="burst">Show</button>
                        <button
                            :class="BUTTON"
                            :disabled="!toasts.length"
                            @click="toasts.splice(0)"
                        >
                            Clear all
                        </button>
                    </SettingRow>
                    <SettingRow
                        title="Loading bar"
                        :description="
                            loadingBar.visible
                                ? `Loading, ${Math.round(loadingBar.progress)}%`
                                : 'The bar along the top while a page loads.'
                        "
                    >
                        <button :class="BUTTON" @click="simulateLoad">Two seconds</button>
                        <button :class="BUTTON" @click="loadingBar.start()">Start</button>
                        <button :class="BUTTON" @click="loadingBar.finish()">Finish</button>
                    </SettingRow>
                </SettingsSection>

                <SettingsSection id="components" title="Components">
                    <SettingRow
                        title="Select menu"
                        :description="`Selected: ${selectValue || 'nothing'}`"
                    >
                        <SelectMenu
                            v-model="selectValue"
                            :options="DEMO_OPTIONS"
                            placeholder="Audio"
                        />
                    </SettingRow>
                    <SettingRow
                        title="Multi-select menu"
                        :description="`Selected: ${genres.join(', ') || 'nothing'}`"
                    >
                        <MultiSelectMenu
                            v-model="genres"
                            :options="DEMO_GENRES"
                            placeholder="Genres"
                        />
                    </SettingRow>
                    <SettingRow title="Toggle" :description="toggleValue ? 'On' : 'Off'">
                        <Toggle v-model="toggleValue" label="Toggle" />
                    </SettingRow>
                    <SettingRow title="Number field" :description="`Value: ${numberValue}`">
                        <NumberField v-model="numberValue" suffix="MB/s" :min="0" />
                    </SettingRow>
                    <SettingRow
                        title="Countdown button"
                        description="The fill Up next uses while it counts down."
                    >
                        <CountdownButton
                            :key="countdownKey"
                            :duration="5"
                            class="h-9 rounded-full bg-white/70 px-4 text-sm font-semibold text-black"
                            @click="countdownKey++"
                        >
                            Restart
                        </CountdownButton>
                    </SettingRow>
                    <SettingRow
                        title="Badges"
                        description="Genre pills and tags on the media page."
                    >
                        <Badge>Fantasy</Badge>
                        <Badge variant="tag">Time skip</Badge>
                    </SettingRow>
                </SettingsSection>

                <SettingsSection
                    id="extensions"
                    title="Extensions"
                    description="Check sources for updates and run their self-tests."
                >
                    <SettingRow
                        title="Updates"
                        :description="
                            extensions.error ??
                            `${extensions.installed.length} installed, ${extensions.updates.length} with updates`
                        "
                    >
                        <button
                            :class="BUTTON"
                            :disabled="!extensions.installed.length || checking"
                            @click="checkUpdates"
                        >
                            <RefreshCw :size="14" :class="{ 'animate-spin': checking }" />
                            Check updates
                        </button>
                    </SettingRow>
                    <SettingRow
                        v-for="ext in extensions.installed"
                        :key="ext.id"
                        :title="ext.name"
                        :disabled="!ext.enabled"
                    >
                        <template #badge>
                            <span class="ml-1.5 font-mono text-xs text-white/35">
                                {{ ext.version }}
                            </span>
                        </template>
                        <template #description>
                            <span
                                v-if="extensionStatus(ext.id)"
                                :class="extensionStatus(ext.id)?.tone"
                            >
                                {{ extensionStatus(ext.id)?.text }}
                            </span>
                            <span v-else class="font-mono">{{ ext.id }}</span>
                        </template>
                        <button
                            :class="BUTTON"
                            :disabled="!ext.enabled || tests[ext.id] === 'running'"
                            @click="runTest(ext.id)"
                        >
                            <FlaskConical :size="14" />
                            Test
                        </button>
                    </SettingRow>
                </SettingsSection>

                <SettingsSection id="logo" title="Logo" bare>
                    <div class="grid gap-3 sm:grid-cols-2">
                        <div
                            v-for="background in LOGO_BACKGROUNDS"
                            :key="background.label"
                            :class="['rounded-xl p-5 ring-1 ring-line', background.class]"
                        >
                            <p class="text-xs opacity-50">{{ background.label }}</p>
                            <div class="mt-4 flex items-end gap-5">
                                <div
                                    v-for="size in LOGO_SIZES"
                                    :key="size"
                                    class="flex flex-col items-center gap-2"
                                >
                                    <LogoMark
                                        :style="{ width: `${size}px`, height: `${size}px` }"
                                    />
                                    <span class="text-[10px] tabular-nums opacity-50">{{
                                        size
                                    }}</span>
                                </div>
                            </div>
                        </div>
                        <div class="rounded-xl bg-neutral-200 p-5 text-neutral-900 sm:col-span-2">
                            <p class="text-xs opacity-50">App icon</p>
                            <div class="mt-4 flex items-end gap-5">
                                <div
                                    v-for="size in [...LOGO_SIZES, 192]"
                                    :key="size"
                                    class="flex flex-col items-center gap-2"
                                >
                                    <img :src="appIcon" :width="size" :height="size" alt="" />
                                    <span class="text-[10px] tabular-nums opacity-50">{{
                                        size
                                    }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </SettingsSection>

                <SettingsSection id="general" title="App">
                    <SettingRow
                        title="Setup"
                        description="Go through first-run setup again. Your current settings are kept."
                    >
                        <button :class="BUTTON" @click="restartOnboarding">Start setup</button>
                    </SettingRow>
                </SettingsSection>
            </div>
        </div>
    </div>
</template>
