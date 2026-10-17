<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { createLogger } from '../lib/logger';

const log = createLogger('picker');
import { useRouter } from 'vue-router';
import { Loader2, Users, HardDrive, X } from '@lucide/vue';
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
import SelectMenu from './ui/SelectMenu.vue';
import type { AniZipEpisode } from '@shared/anizip/types';
import { episodeToSummary, mediaToSummary } from '@shared/media/types';
import type { TorrentResult } from '../../main/extensions/types';

const props = defineProps<{
    open: boolean;
    episode: AniZipEpisode;
    anilistId: number;
    titles: string[];
    episodeCount: number | null;
    anidbAid: number | null;
}>();

const emit = defineEmits<{ 'update:open': [value: boolean] }>();

const router = useRouter();
const player = usePlayerStore();
const mediaStore = useMediaStore();

const RESOLUTIONS = ['1080', '720', '480'] as const;
type Resolution = (typeof RESOLUTIONS)[number];

const loading = ref(false);
const results = ref<TorrentResult[]>([]);
const errors = ref<{ extensionId: string; error: string }[]>([]);
const selecting = ref(false);
const resolution = ref<Resolution>('1080');

const episodeName = computed(() => {
    const t = props.episode.title;
    const num = props.episode.absoluteEpisodeNumber ?? props.episode.episodeNumber;
    const title = t['en'] || t['x-jat'] || t['ja'] || `Episode ${num}`;
    return `Episode ${num} - ${title}`;
});

function episodeTitle(): string | null {
    const t = props.episode.title;
    return t['en'] || t['x-jat'] || t['ja'] || null;
}

function formatBytes(bytes: number): string {
    if (!bytes) return '-';
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
    return `${(bytes / 1e3).toFixed(0)} KB`;
}

function toMagnet(link: string, hash: string): string {
    if (link.startsWith('magnet:')) return link;
    const h = link || hash;
    return `magnet:?xt=urn:btih:${h}`;
}

async function triggerSearch() {
    loading.value = true;
    results.value = [];
    errors.value = [];

    const params = {
        anilistId: props.anilistId,
        anidbEid: props.episode.anidbEid?.toString() ?? undefined,
        anidbAid: props.anidbAid?.toString() ?? undefined,
        titles: props.titles,
        episode: props.episode.absoluteEpisodeNumber ?? props.episode.episodeNumber,
        episodeCount: props.episodeCount ?? undefined,
        resolution: resolution.value,
        exclusions: [] as string[],
    };

    log.debug('params:', JSON.stringify(params));

    let allExtensions: { id: string; enabled: boolean }[];
    try {
        allExtensions = await window.api.extensions.list();
    } catch (e) {
        errors.value = [
            { extensionId: 'search', error: e instanceof Error ? e.message : String(e) },
        ];
        loading.value = false;
        return;
    }

    const enabled = allExtensions.filter((e) => e.enabled);
    log.info(`searching ${enabled.length} extension(s)`);

    if (enabled.length === 0) {
        loading.value = false;
        return;
    }

    let remaining = enabled.length;

    for (const ext of enabled) {
        window.api.extensions
            .search(ext.id, 'single', params)
            .then((res) => {
                log.info(`${ext.id}: ${res.length} result(s)`);
                results.value = [...results.value, ...res].sort((a, b) => b.seeders - a.seeders);
            })
            .catch((e) => {
                const msg = e instanceof Error ? e.message : String(e);
                log.error(`${ext.id}: error - ${msg}`);
                errors.value = [...errors.value, { extensionId: ext.id, error: msg }];
            })
            .finally(() => {
                remaining--;
                if (remaining === 0) {
                    loading.value = false;
                    log.info(`done - ${results.value.length} total`);
                }
            });
    }
}

watch(
    () => props.open,
    (val) => {
        if (!val) {
            results.value = [];
            errors.value = [];
            return;
        }
        triggerSearch();
    },
    { immediate: true }
);

watch(resolution, () => {
    if (props.open) triggerSearch();
});

async function pick(result: TorrentResult) {
    if (selecting.value) return;
    selecting.value = true;
    try {
        const magnet = toMagnet(result.link, result.hash);
        const media = mediaStore.mediaFor(props.anilistId);
        void player.startStream({
            media: media
                ? mediaToSummary(media)
                : {
                      anilistId: props.anilistId,
                      title: props.titles[0] ?? 'Unknown title',
                      episodeCount: props.episodeCount,
                  },
            episode: {
                ...episodeToSummary(props.episode),
                title: episodeTitle(),
            },
            torrent: {
                title: result.title,
                infoHash: result.hash || undefined,
                magnet,
            },
        });
        emit('update:open', false);
        await router.push('/player');
    } finally {
        selecting.value = false;
    }
}

const ACCURACY_CLASS: Record<string, string> = {
    high: 'text-emerald-400 bg-emerald-400/10',
    medium: 'text-amber-400 bg-amber-400/10',
    low: 'text-red-400 bg-red-400/10',
};
</script>

<template>
    <DialogRoot :open="open" @update:open="emit('update:open', $event)">
        <DialogPortal>
            <DialogOverlay
                class="dialog-overlay fixed inset-0 bg-black/70 backdrop-blur-sm z-50 no-drag"
            />
            <DialogContent
                class="dialog-content fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[660px] max-h-[72vh] bg-neutral-900 border border-white/10 rounded-2xl flex flex-col outline-none shadow-2xl no-drag"
            >
                <DialogClose
                    class="absolute top-3.5 right-4 text-white/25 hover:text-white/60 transition-colors"
                >
                    <X :size="15" />
                </DialogClose>

                <!-- Header -->
                <div class="px-5 py-4 border-b border-white/8 shrink-0">
                    <DialogTitle class="text-sm font-semibold text-white truncate pr-6">
                        {{ episodeName }}
                    </DialogTitle>
                    <div class="flex items-center justify-between mt-0.5">
                        <DialogDescription class="text-xs text-white/40">
                            Select a torrent to stream
                        </DialogDescription>
                        <SelectMenu
                            v-model="resolution"
                            :options="RESOLUTIONS.map((r) => ({ value: r, label: r }))"
                            placeholder="Resolution"
                        />
                    </div>
                </div>

                <!-- Body -->
                <div class="flex-1 overflow-y-auto p-3 space-y-1.5 min-h-0">
                    <!-- Full-screen spinner while nothing has arrived yet -->
                    <div
                        v-if="loading && !results.length"
                        class="flex items-center justify-center gap-2 py-14 text-white/40 text-sm"
                    >
                        <Loader2 :size="16" class="animate-spin" />
                        Searching extensions…
                    </div>

                    <!-- Results (shown as they stream in) -->
                    <template v-if="results.length">
                        <button
                            v-for="result in results"
                            :key="result.hash || result.link"
                            class="w-full flex items-center gap-3 p-3 rounded-xl bg-neutral-800/60 hover:bg-neutral-800 transition-colors text-left disabled:opacity-40 cursor-pointer"
                            :disabled="selecting"
                            @click="pick(result)"
                        >
                            <div class="flex-1 min-w-0">
                                <p class="text-sm text-white/90 leading-snug truncate">
                                    {{ result.title }}
                                </p>
                                <div class="flex items-center gap-1.5 mt-1.5">
                                    <span
                                        :class="[
                                            'text-[11px] px-1.5 py-0.5 rounded',
                                            ACCURACY_CLASS[result.accuracy] ?? '',
                                        ]"
                                    >
                                        {{ result.accuracy }}
                                    </span>
                                    <span
                                        v-if="result.type"
                                        class="text-[11px] px-1.5 py-0.5 rounded bg-white/6 text-white/40"
                                    >
                                        {{ result.type }}
                                    </span>
                                    <span
                                        class="text-[11px] px-1.5 py-0.5 rounded bg-white/6 text-white/30"
                                    >
                                        {{ result.extensionId }}
                                    </span>
                                </div>
                            </div>
                            <div class="shrink-0 text-right space-y-1">
                                <div class="flex items-center justify-end gap-1 text-xs">
                                    <Users
                                        :size="11"
                                        :class="
                                            result.seeders > 0
                                                ? 'text-emerald-400'
                                                : 'text-white/25'
                                        "
                                    />
                                    <span
                                        :class="
                                            result.seeders > 0
                                                ? 'text-emerald-400'
                                                : 'text-white/30'
                                        "
                                    >
                                        {{ result.seeders }}
                                    </span>
                                </div>
                                <div
                                    class="flex items-center justify-end gap-1 text-[11px] text-white/30"
                                >
                                    <HardDrive :size="10" />
                                    {{ formatBytes(result.size) }}
                                </div>
                            </div>
                        </button>
                    </template>

                    <!-- Still searching indicator (results already visible) -->
                    <div
                        v-if="loading && results.length"
                        class="flex items-center justify-center gap-1.5 py-3 text-white/25 text-xs"
                    >
                        <Loader2 :size="12" class="animate-spin" />
                        Searching more…
                    </div>

                    <!-- Empty -->
                    <div
                        v-if="!loading && !results.length"
                        class="flex items-center justify-center py-14 text-white/30 text-sm"
                    >
                        No results found
                    </div>

                    <!-- Extension errors -->
                    <div v-if="errors.length && !loading" class="pt-1 space-y-1">
                        <p
                            v-for="e in errors"
                            :key="e.extensionId"
                            class="text-[11px] text-red-400/60 font-mono px-1"
                        >
                            {{ e.extensionId }}: {{ e.error }}
                        </p>
                    </div>
                </div>
            </DialogContent>
        </DialogPortal>
    </DialogRoot>
</template>
