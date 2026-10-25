<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Search, X } from '@lucide/vue';
import type { Media } from '@shared/graphql/queries';
import MediaCard from '../components/MediaCard.vue';
import { LIST_STATUS_LABELS } from '../lib/media-labels';
import { LIST_STATUSES, entryMedia, useListStore, type ListStatus } from '../stores/list';
import { useAccountsStore } from '../stores/accounts';

const route = useRoute();
const router = useRouter();
const list = useListStore();
const accounts = useAccountsStore();

const query = ref('');
const normalize = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
const words = computed(() => normalize(query.value).split(/\s+/).filter(Boolean));

function matches(media: Media) {
    const { english, romaji, native } = media.title ?? {};
    const titles = normalize([english, romaji, native].filter(Boolean).join(' '));
    return words.value.every((word) => titles.includes(word));
}

const filtered = computed(
    () =>
        Object.fromEntries(
            LIST_STATUSES.map((status) => [
                status,
                list.byStatus[status].map(entryMedia).filter(matches),
            ])
        ) as Record<ListStatus, Media[]>
);

// While searching, the counts show where the matches are
const tabs = computed(() =>
    LIST_STATUSES.map((status) => ({
        status,
        label: LIST_STATUS_LABELS[status],
        count: filtered.value[status].length,
    })).filter(
        (tab) =>
            tab.count ||
            tab.status === active.value ||
            (tab.status !== 'REPEATING' && !words.value.length)
    )
);

const active = computed<ListStatus>(() => {
    const status = route.query.status as ListStatus;
    return LIST_STATUSES.includes(status) ? status : 'CURRENT';
});

const items = computed(() => filtered.value[active.value]);

const select = (status: ListStatus) => void router.replace({ query: { status } });
</script>

<template>
    <div class="min-h-full">
        <div
            v-if="accounts.anilist"
            class="sticky top-0 z-50 flex flex-wrap items-center gap-1 border-b border-line bg-surface/85 px-8 py-4 backdrop-blur-md"
        >
            <button
                v-for="tab in tabs"
                :key="tab.status"
                :class="[
                    'flex cursor-pointer items-baseline gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                    active === tab.status
                        ? 'bg-white/10 text-white'
                        : 'text-white/50 hover:text-white',
                ]"
                @click="select(tab.status)"
            >
                {{ tab.label }}
                <span class="text-xs text-white/35 tabular-nums">{{ tab.count }}</span>
            </button>

            <label
                class="ml-auto flex h-8 w-60 cursor-text items-center gap-2 rounded-full bg-white/5 px-3.5 text-sm ring-1 ring-line transition-colors focus-within:bg-white/10 focus-within:ring-white/20 hover:bg-white/8"
            >
                <Search :size="13" class="shrink-0 text-white/40" />
                <input
                    v-model="query"
                    type="text"
                    spellcheck="false"
                    placeholder="Search your list"
                    class="w-0 min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/40"
                    @keydown.esc="query = ''"
                />
                <button
                    v-if="query"
                    class="grid size-5 shrink-0 cursor-pointer place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
                    title="Clear"
                    @click.prevent="query = ''"
                >
                    <X :size="12" />
                </button>
            </label>
        </div>

        <div class="px-8 py-6">
            <div
                v-if="!accounts.anilist"
                class="flex flex-col items-center gap-3 py-24 text-center"
            >
                <p class="font-display text-xl font-semibold">Your lists live on AniList</p>
                <p class="max-w-sm text-sm text-white/45">
                    Connect your account to see what you're watching, planning and have finished.
                </p>
                <RouterLink
                    to="/settings"
                    class="mt-2 inline-flex h-9 items-center rounded-lg bg-white/8 px-3 text-sm font-medium transition-colors hover:bg-white/14"
                >
                    Connect AniList
                </RouterLink>
            </div>

            <p v-else-if="list.error && !list.entries.length" class="py-24 text-center text-sm">
                <span class="text-red-400">Couldn't load your list:</span>
                <span class="text-white/45"> {{ list.error }}</span>
            </p>

            <div
                v-else-if="list.loading || items.length"
                class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-4 gap-y-6"
            >
                <MediaCard v-for="item in items" :key="item.id" :item="item" />
                <template v-if="list.loading">
                    <div v-for="i in 12" :key="`skeleton-${i}`" class="animate-pulse">
                        <div class="aspect-2/3 rounded-xl bg-raised" />
                        <div class="mt-2.5 h-3 w-3/4 rounded bg-raised" />
                        <div class="mt-1.5 h-2.5 w-1/2 rounded bg-raised" />
                    </div>
                </template>
            </div>

            <p v-else-if="words.length" class="py-24 text-center text-sm text-white/40">
                Nothing in {{ LIST_STATUS_LABELS[active].toLowerCase() }} matches “{{
                    query.trim()
                }}”.
            </p>
            <p v-else class="py-24 text-center text-sm text-white/40">
                Nothing in {{ LIST_STATUS_LABELS[active].toLowerCase() }} yet.
            </p>
        </div>
    </div>
</template>
