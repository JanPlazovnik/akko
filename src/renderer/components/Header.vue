<script setup lang="ts">
import { nextTick, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Compass, FlaskConical, Home, Search, Settings } from '@lucide/vue';
import LoadingBar from './LoadingBar.vue';
import WindowControls from './WindowControls.vue';
import LogoMark from './LogoMark.vue';

const route = useRoute();
const router = useRouter();
const isDev = import.meta.env.DEV;

const NAV = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/search', label: 'Browse', icon: Compass },
];

const ICON_BUTTON =
    'grid size-9 cursor-pointer place-items-center rounded-full transition-colors hover:bg-white/10 hover:text-white';

async function openSearch() {
    await router.push('/search');
    await nextTick();
    document.querySelector<HTMLInputElement>('[data-search-input]')?.focus();
}

function onKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    const typing = target?.closest('input, textarea, [contenteditable]');
    if ((event.ctrlKey && event.key.toLowerCase() === 'k') || (event.key === '/' && !typing)) {
        event.preventDefault();
        void openSearch();
    }
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onUnmounted(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
    <header class="drag flex h-14 shrink-0 items-center pl-4">
        <button class="no-drag flex cursor-pointer items-center gap-2" @click="router.push('/')">
            <LogoMark class="size-7 text-white" />
            <span class="font-display text-lg font-semibold tracking-tight">akko</span>
        </button>

        <nav class="no-drag ml-6 flex items-center gap-1">
            <RouterLink
                v-for="item in NAV"
                :key="item.path"
                :to="item.path"
                :class="[
                    'flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                    route.path === item.path
                        ? 'bg-white/10 text-white'
                        : 'text-white/50 hover:text-white',
                ]"
            >
                <component :is="item.icon" :size="15" />
                {{ item.label }}
            </RouterLink>
        </nav>

        <button
            class="no-drag ml-4 flex h-9 w-72 cursor-pointer items-center gap-2.5 rounded-full bg-white/5 px-4 text-sm text-white/40 ring-1 ring-line transition-colors hover:bg-white/8 hover:text-white/60"
            @click="openSearch"
        >
            <Search :size="14" class="shrink-0" />
            <span>Search anime</span>
            <kbd
                class="ml-auto rounded-md bg-white/8 px-1.5 py-0.5 font-sans text-[10px] font-medium text-white/40"
            >
                Ctrl K
            </kbd>
        </button>

        <div class="no-drag ml-auto flex items-center gap-1 pr-2 text-white/55">
            <LoadingBar class="mr-2" />
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

        <WindowControls class="h-14" />
    </header>
</template>
