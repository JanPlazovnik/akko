<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { AlertCircle, ArrowUp, Loader2, Play, RefreshCw, X } from '@lucide/vue';
import {
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogOverlay,
    DialogPortal,
    DialogRoot,
    DialogTitle,
} from 'reka-ui';
import { usePlayerStore } from '../stores/player';
import { useMediaStore } from '../stores/media';
import { createLogger } from '../lib/logger';
import { errorMessage, formatBytes, formatRelativeDate } from '../lib/format';
import type { AniZipEpisode } from '@shared/anizip/types';
import { episodeToSummary, mediaToSummary } from '@shared/media/types';
import type { TorrentResult } from '../../main/extensions/types';

type Source = {
    id: string;
    name: string;
    icon?: string;
    status: 'loading' | 'done' | 'error';
    results: TorrentResult[];
    error?: string;
};

const props = defineProps<{
    open: boolean;
    episode: AniZipEpisode;
    anilistId: number;
    titles: string[];
    episodeCount: number | null;
    anidbAid: number | null;
}>();

const emit = defineEmits<{ 'update:open': [value: boolean] }>();

const log = createLogger('picker');
const router = useRouter();
const player = usePlayerStore();
const mediaStore = useMediaStore();

const RESOLUTIONS = ['1080', '720', '480'] as const;
const ACCURACY_DOT: Record<TorrentResult['accuracy'], string> = {
    high: 'bg-emerald-400',
    medium: 'bg-amber-400',
    low: 'bg-red-400',
};

const sources = ref<Source[]>([]);
const listError = ref<string | null>(null);
const listed = ref(false);
const resolution = ref<(typeof RESOLUTIONS)[number]>('1080');
const selecting = ref(false);
let searchId = 0;

const episodeNumber = computed(
    () => props.episode.absoluteEpisodeNumber ?? props.episode.episodeNumber
);
const episodeTitle = computed(() => {
    const t = props.episode.title;
    return t['en'] || t['x-jat'] || t['ja'] || null;
});
const STATUS_RANK = (s: Source) =>
    s.results.length ? 0 : s.status === 'loading' ? 1 : s.status === 'done' ? 2 : 3;
const orderedSources = computed(() =>
    [...sources.value].sort(
        (a, b) =>
            STATUS_RANK(a) - STATUS_RANK(b) ||
            (b.results[0]?.seeders ?? 0) - (a.results[0]?.seeders ?? 0)
    )
);
const searching = computed(() => sources.value.some((s) => s.status === 'loading'));
const totalResults = computed(() => sources.value.reduce((n, s) => n + s.results.length, 0));

function sortResults(results: TorrentResult[]): TorrentResult[] {
    return [...results].sort(
        (a, b) => b.seeders - a.seeders || Date.parse(b.date) - Date.parse(a.date)
    );
}

function parseTitle(title: string) {
    const group = title.match(/^\[([^\]]+)\]\s*/);
    return {
        group: group?.[1] ?? null,
        name: group ? title.slice(group[0].length) : title,
        resolution: title.match(/\b(\d{3,4})p\b/)?.[1] ?? null,
    };
}

function toMagnet(link: string, hash: string): string {
    if (link.startsWith('magnet:')) return link;
    return `magnet:?xt=urn:btih:${link || hash}`;
}

async function triggerSearch() {
    const current = ++searchId;
    listError.value = null;
    listed.value = false;
    sources.value = [];

    const media = mediaStore.mediaFor(props.anilistId);
    const params = {
        media: media ? JSON.parse(JSON.stringify(media)) : undefined,
        anilistId: props.anilistId,
        anidbEid: props.episode.anidbEid?.toString() ?? undefined,
        anidbAid: props.anidbAid?.toString() ?? undefined,
        titles: props.titles,
        episode: episodeNumber.value,
        episodeCount: props.episodeCount ?? undefined,
        resolution: resolution.value,
        exclusions: [] as string[],
    };
    log.debug('params:', JSON.stringify(params));

    let extensions;
    try {
        extensions = (await window.api.extensions.list()).filter((e) => e.enabled);
    } catch (e) {
        listError.value = errorMessage(e);
        return;
    }
    if (current !== searchId) return;

    listed.value = true;
    sources.value = extensions.map((e) => ({
        id: e.id,
        name: e.name,
        icon: e.icon,
        status: 'loading',
        results: [],
    }));

    const update = (id: string, patch: Partial<Source>) => {
        if (current !== searchId) return;
        sources.value = sources.value.map((s) => (s.id === id ? { ...s, ...patch } : s));
    };

    for (const ext of extensions) {
        window.api.extensions
            .search(ext.id, 'single', params)
            .then((results) => {
                log.info(`${ext.id}: ${results.length} result(s)`);
                update(ext.id, { status: 'done', results: sortResults(results) });
            })
            .catch((e) => {
                log.error(`${ext.id}: ${errorMessage(e)}`);
                update(ext.id, { status: 'error', error: errorMessage(e) });
            });
    }
}

watch(
    () => props.open,
    (open) => {
        if (open) void triggerSearch();
        else {
            searchId++;
            sources.value = [];
        }
    },
    { immediate: true }
);

watch(resolution, () => {
    if (props.open) void triggerSearch();
});

function manageExtensions() {
    emit('update:open', false);
    void router.push('/settings');
}

async function pick(result: TorrentResult) {
    if (selecting.value) return;
    selecting.value = true;
    try {
        const media = mediaStore.mediaFor(props.anilistId);
        void player.startStream({
            media: media
                ? mediaToSummary(media)
                : {
                      anilistId: props.anilistId,
                      title: props.titles[0] ?? 'Unknown title',
                      episodeCount: props.episodeCount,
                  },
            episode: { ...episodeToSummary(props.episode), title: episodeTitle.value },
            torrent: {
                title: result.title,
                infoHash: result.hash || undefined,
                magnet: toMagnet(result.link, result.hash),
            },
        });
        emit('update:open', false);
        await router.push('/player');
    } finally {
        selecting.value = false;
    }
}
</script>

<template>
    <DialogRoot :open="open" @update:open="emit('update:open', $event)">
        <DialogPortal>
            <DialogOverlay
                class="dialog-overlay no-drag fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            />
            <DialogContent
                class="dialog-content no-drag fixed top-1/2 left-1/2 z-50 flex max-h-[84vh] w-[min(880px,calc(100vw-48px))] -translate-1/2 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl shadow-black/70 outline-none"
            >
                <header class="flex gap-5 border-b border-line p-5">
                    <div
                        class="relative aspect-video w-44 shrink-0 overflow-hidden rounded-lg bg-raised"
                    >
                        <img
                            v-if="episode.image"
                            :src="episode.image"
                            class="absolute inset-0 size-full object-cover"
                        />
                        <span
                            class="absolute bottom-1.5 left-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-semibold"
                        >
                            EP {{ episode.episodeNumber ?? episodeNumber }}
                        </span>
                    </div>

                    <div class="flex min-w-0 flex-1 flex-col">
                        <p class="truncate pr-8 text-xs font-medium text-white/45">
                            {{ titles[0] }}
                        </p>
                        <DialogTitle class="truncate pr-8 font-display text-xl font-semibold">
                            Episode {{ episode.episodeNumber ?? episodeNumber }}
                            <span
                                v-if="
                                    episode.episodeNumber && episode.episodeNumber !== episodeNumber
                                "
                                class="ml-1 text-sm font-medium text-white/40"
                            >
                                #{{ episodeNumber }} overall
                            </span>
                        </DialogTitle>
                        <DialogDescription class="truncate text-sm text-white/55">
                            {{ episodeTitle ?? 'Choose a release to stream' }}
                        </DialogDescription>

                        <div class="mt-auto flex items-center gap-3 pt-3">
                            <div class="flex rounded-full bg-raised p-0.5">
                                <button
                                    v-for="r in RESOLUTIONS"
                                    :key="r"
                                    :class="[
                                        'cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors',
                                        resolution === r
                                            ? 'bg-white text-black'
                                            : 'text-white/55 hover:text-white',
                                    ]"
                                    @click="resolution = r"
                                >
                                    {{ r }}p
                                </button>
                            </div>
                            <span class="text-xs text-white/40">
                                {{ totalResults }} results · {{ sources.length }} sources
                            </span>
                            <button
                                class="ml-auto grid size-8 cursor-pointer place-items-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
                                title="Search again"
                                :disabled="searching"
                                @click="triggerSearch()"
                            >
                                <RefreshCw :size="14" :class="searching && 'animate-spin'" />
                            </button>
                        </div>
                    </div>

                    <DialogClose
                        class="absolute top-4 right-4 grid size-8 cursor-pointer place-items-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white"
                    >
                        <X :size="16" />
                    </DialogClose>
                </header>

                <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
                    <p v-if="listError" class="px-3 py-12 text-center text-sm text-red-300">
                        {{ listError }}
                    </p>

                    <div
                        v-else-if="listed && !sources.length"
                        class="flex flex-col items-center gap-3 px-3 py-14 text-center text-sm text-white/45"
                    >
                        No extensions are enabled.
                        <button
                            class="cursor-pointer rounded-full bg-white/10 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
                            @click="manageExtensions"
                        >
                            Manage extensions
                        </button>
                    </div>

                    <section v-for="source in orderedSources" :key="source.id" class="mt-1">
                        <header
                            class="sticky top-0 z-10 flex items-center gap-2.5 bg-surface/95 px-3 pt-4 pb-2 backdrop-blur"
                        >
                            <img
                                v-if="source.icon"
                                :src="source.icon"
                                class="size-5 rounded-md object-cover"
                            />
                            <span
                                v-else
                                class="grid size-5 place-items-center rounded-md bg-raised text-[10px] font-bold uppercase"
                            >
                                {{ source.name[0] }}
                            </span>
                            <h3 class="text-sm font-semibold">{{ source.name }}</h3>
                            <span
                                v-if="source.status === 'loading'"
                                class="flex items-center gap-1.5 text-xs text-white/40"
                            >
                                <Loader2 :size="12" class="animate-spin" /> Searching
                            </span>
                            <span
                                v-else-if="source.status === 'error'"
                                class="flex min-w-0 items-center gap-1.5 text-xs text-red-300/80"
                                :title="source.error"
                            >
                                <AlertCircle :size="12" class="shrink-0" />
                                <span class="truncate">{{ source.error }}</span>
                            </span>
                            <span v-else class="text-xs text-white/35">
                                {{ source.results.length || 'No' }} results
                            </span>
                        </header>

                        <div v-if="source.status === 'loading'" class="space-y-1 px-1">
                            <div
                                v-for="i in 2"
                                :key="i"
                                class="h-14 animate-pulse rounded-xl bg-white/3"
                            />
                        </div>

                        <button
                            v-for="result in source.results"
                            :key="result.hash || result.link"
                            class="group flex w-full cursor-pointer items-center gap-4 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/6 disabled:opacity-40"
                            :disabled="selecting"
                            @click="pick(result)"
                        >
                            <div class="min-w-0 flex-1">
                                <p class="truncate text-sm text-white/90">
                                    <span
                                        v-if="parseTitle(result.title).group"
                                        class="mr-1.5 font-semibold text-accent"
                                    >
                                        {{ parseTitle(result.title).group }}
                                    </span>
                                    {{ parseTitle(result.title).name }}
                                </p>
                                <div class="mt-1 flex items-center gap-2 text-[11px] text-white/45">
                                    <span
                                        class="flex items-center gap-1.5"
                                        :title="`${result.accuracy} accuracy`"
                                    >
                                        <span
                                            :class="[
                                                'size-1.5 rounded-full',
                                                ACCURACY_DOT[result.accuracy],
                                            ]"
                                        />
                                        {{ result.accuracy }}
                                    </span>
                                    <span
                                        v-if="parseTitle(result.title).resolution"
                                        class="rounded bg-white/8 px-1.5 py-px font-medium text-white/70"
                                    >
                                        {{ parseTitle(result.title).resolution }}p
                                    </span>
                                    <span
                                        v-if="result.type === 'best'"
                                        class="rounded bg-emerald-400/12 px-1.5 py-px font-medium text-emerald-300"
                                    >
                                        Best release
                                    </span>
                                    <span
                                        v-else-if="result.type === 'batch'"
                                        class="rounded bg-sky-400/12 px-1.5 py-px font-medium text-sky-300"
                                    >
                                        Batch
                                    </span>
                                    <span v-if="formatRelativeDate(result.date)">
                                        {{ formatRelativeDate(result.date) }}
                                    </span>
                                </div>
                            </div>

                            <div class="flex shrink-0 items-center gap-4 text-xs tabular-nums">
                                <span v-if="result.size" class="w-16 text-right text-white/50">
                                    {{ formatBytes(result.size) }}
                                </span>
                                <span
                                    v-if="result.seeders"
                                    :class="[
                                        'flex w-12 items-center justify-end gap-1',
                                        result.seeders >= 10 ? 'text-emerald-400' : 'text-white/50',
                                    ]"
                                    title="Seeders"
                                >
                                    <ArrowUp :size="11" />
                                    {{ result.seeders }}
                                </span>
                                <span
                                    class="grid size-8 place-items-center rounded-full bg-white text-black opacity-0 transition-opacity group-hover:opacity-100"
                                >
                                    <Play :size="13" fill="currentColor" />
                                </span>
                            </div>
                        </button>
                    </section>
                </div>
            </DialogContent>
        </DialogPortal>
    </DialogRoot>
</template>
