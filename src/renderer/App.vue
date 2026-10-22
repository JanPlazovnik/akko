<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { DragDropProvider } from '@dnd-kit/vue';
import Header from './components/Header.vue';
import LoadingBar from './components/LoadingBar.vue';
import AnilistBanner from './components/AnilistBanner.vue';
import PersistentPlayer from './components/PersistentPlayer.vue';
import ShortcutsDialog from './components/ShortcutsDialog.vue';
import Toaster from './components/Toaster.vue';
import { useAccountsStore } from './stores/accounts';
import { useListStore } from './stores/list';
import { useTrackingStore } from './stores/tracking';
import { useProgressStore } from './stores/progress';
const route = useRoute();
const mainEl = ref<HTMLElement | null>(null);
const scrollMemory = new Map<string, number>();
const REMEMBER = new Set(['/', '/library']);
let pendingScroll = 0;
const accounts = useAccountsStore();
useListStore();
useTrackingStore();
useProgressStore();

onMounted(() => void accounts.warnIfExpiring());

watch(
    () => route.path,
    (newPath, oldPath) => {
        if (REMEMBER.has(oldPath) && mainEl.value) {
            scrollMemory.set(oldPath, mainEl.value.scrollTop);
        }
        pendingScroll = REMEMBER.has(newPath) ? (scrollMemory.get(newPath) ?? 0) : 0;
    }
);

// The new page mounts after the old one leaves, so its scroll waits until then
function restoreScroll() {
    mainEl.value?.scrollTo({ top: pendingScroll });
}
</script>

<template>
    <div v-if="route.meta.bare" class="h-screen bg-canvas text-white select-none">
        <RouterView />
    </div>
    <DragDropProvider v-else>
        <div class="flex h-screen flex-col bg-canvas text-white select-none">
            <LoadingBar />
            <Header />
            <AnilistBanner v-if="route.path !== '/player'" />
            <main
                ref="mainEl"
                class="mx-2 mb-2 flex-1 overflow-auto rounded-xl bg-surface ring-1 ring-line [scrollbar-width:none]!"
            >
                <RouterView v-slot="{ Component }">
                    <!-- Pages can have several root elements, which a transition can't animate -->
                    <Transition name="page" mode="out-in" @enter="restoreScroll">
                        <div :key="route.path" class="h-full">
                            <component :is="Component" />
                        </div>
                    </Transition>
                </RouterView>
            </main>
            <PersistentPlayer />
            <ShortcutsDialog />
        </div>
    </DragDropProvider>
    <Toaster />
</template>

<style>
.page-enter-active {
    transition: opacity 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}
.page-enter-from {
    opacity: 0;
}
</style>
