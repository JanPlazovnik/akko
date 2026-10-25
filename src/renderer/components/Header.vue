<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { FlaskConical, Home, Library, Search, Settings, X } from '@lucide/vue';
import WindowControls from './WindowControls.vue';
import LogoMark from './LogoMark.vue';
import { dateOverride, useAmbientEffects, useHoliday } from '../lib/holidays';
import { celebrate, newYearShow, releaseBat } from '../lib/holiday-effects';

const route = useRoute();
const router = useRouter();
const isDev = import.meta.env.DEV;

const ICON_BUTTON =
    'grid size-9 shrink-0 cursor-pointer place-items-center rounded-full transition-colors hover:bg-white/10 hover:text-white';

const navLink = (active: boolean) => [
    'no-drag flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
    active ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white',
];

const searchInput = ref<HTMLInputElement | null>(null);
const query = ref('');
const onSearchPage = () => route.path === '/search';

watch(
    () => [route.path, route.query.search],
    () => (query.value = onSearchPage() ? String(route.query.search ?? '') : ''),
    { immediate: true }
);

function openSearch() {
    if (!onSearchPage())
        void router.push({ path: '/search', query: { search: query.value || undefined } });
}

function onSearchInput() {
    const search = query.value || undefined;
    if (onSearchPage()) void router.replace({ query: { ...route.query, search } });
    else void router.push({ path: '/search', query: { search } });
}

function clearSearch() {
    query.value = '';
    onSearchInput();
    searchInput.value?.focus();
}

function onSearchKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    if (query.value) clearSearch();
    else searchInput.value?.blur();
}

function onKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    const typing = target?.closest('input, textarea, [contenteditable]');
    if ((event.ctrlKey && event.key.toLowerCase() === 'k') || (event.key === '/' && !typing)) {
        event.preventDefault();
        searchInput.value?.focus();
    }
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onUnmounted(() => document.removeEventListener('keydown', onKeydown));

const holiday = useHoliday();
const ambient = useAmbientEffects();
let batTimer: ReturnType<typeof setTimeout> | undefined;
let celebrated = false;

function onLogoClick() {
    if (holiday.value) celebrate(holiday.value);
}

// A bat every so often at Halloween, and fireworks the first time the app shows New Year. A
// Playground preview has its own button for those, so picking the date doesn't set them off.
watch(
    ambient,
    (active) => {
        clearTimeout(batTimer);
        if (active === 'HALLOWEEN') {
            const next = (delay: number) =>
                (batTimer = setTimeout(() => {
                    releaseBat();
                    if (Math.random() < 0.3) setTimeout(releaseBat, 400 + Math.random() * 800);
                    next(8_000 + Math.random() * 12_000);
                }, delay));
            next(3_000);
        }
        if (active === 'NEW_YEAR' && !celebrated && !dateOverride.value) {
            celebrated = true;
            newYearShow(800);
        }
    },
    { immediate: true }
);
onUnmounted(() => clearTimeout(batTimer));
</script>

<template>
    <!-- Equal side columns keep the search centred, until a side needs more room than its share -->
    <header
        class="drag grid h-14 shrink-0 grid-cols-[minmax(max-content,1fr)_minmax(9rem,20rem)_minmax(max-content,1fr)] items-center gap-3"
    >
        <div class="flex items-center pl-4">
            <div class="flex items-center gap-2">
                <button data-holiday-logo class="no-drag" aria-label="akko" @click="onLogoClick">
                    <LogoMark class="size-7 text-white" />
                </button>
                <span class="font-display text-lg font-semibold tracking-tight">akko</span>
            </div>

            <RouterLink to="/" :class="['ml-6', navLink(route.path === '/')]">
                <Home :size="15" />
                Home
            </RouterLink>
            <RouterLink to="/library" :class="['ml-1', navLink(route.path === '/library')]">
                <Library :size="15" />
                Library
            </RouterLink>
        </div>

        <label
            :class="[
                'no-drag group flex h-9 cursor-text items-center gap-2.5 rounded-full px-4 text-sm ring-1 transition-colors focus-within:bg-white/10 focus-within:ring-white/20',
                onSearchPage()
                    ? 'bg-white/10 ring-white/15'
                    : 'bg-white/5 ring-line hover:bg-white/8',
            ]"
        >
            <Search :size="14" class="shrink-0 text-white/40" />
            <input
                ref="searchInput"
                v-model="query"
                type="text"
                spellcheck="false"
                placeholder="Search anime"
                class="w-0 min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/40"
                @focus="openSearch"
                @input="onSearchInput"
                @keydown="onSearchKeydown"
            />
            <button
                v-if="query"
                class="grid size-5 shrink-0 cursor-pointer place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
                title="Clear"
                @click.prevent="clearSearch"
            >
                <X :size="12" />
            </button>
            <kbd
                v-else
                class="shrink-0 rounded-md bg-white/8 px-1.5 py-0.5 font-sans text-[10px] font-medium text-white/40 group-focus-within:hidden"
            >
                Ctrl K
            </kbd>
        </label>

        <div class="flex items-center justify-end self-stretch">
            <div class="no-drag flex items-center gap-1 pr-2 text-white/55">
                <button
                    v-if="isDev"
                    :class="ICON_BUTTON"
                    title="Playground"
                    @click="router.push('/playground')"
                >
                    <FlaskConical :size="17" />
                </button>
                <button
                    :class="[ICON_BUTTON, route.path === '/settings' && 'bg-white/10 text-white']"
                    title="Settings"
                    @click="router.push('/settings')"
                >
                    <Settings :size="17" />
                </button>
            </div>
            <WindowControls />
        </div>
    </header>
</template>
