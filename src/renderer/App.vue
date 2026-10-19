<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { DragDropProvider } from '@dnd-kit/vue';
import Header from './components/Header.vue';
import PersistentPlayer from './components/PersistentPlayer.vue';
import ShortcutsDialog from './components/ShortcutsDialog.vue';
import { useAccountsStore } from './stores/accounts';
import { useListStore } from './stores/list';
import { useTrackingStore } from './stores/tracking';
import { useProgressStore } from './stores/progress';
const route = useRoute();
const mainEl = ref<HTMLElement | null>(null);
const scrollMemory = new Map<string, number>();
const REMEMBER = new Set(['/', '/library']);
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
        const saved = REMEMBER.has(newPath) ? (scrollMemory.get(newPath) ?? 0) : 0;
        // Restore once the new page has rendered, or the old page's height clamps it
        void nextTick(() => mainEl.value?.scrollTo({ top: saved }));
    }
);
</script>

<template>
    <div v-if="route.meta.bare" class="h-screen bg-canvas text-white select-none">
        <RouterView />
    </div>
    <DragDropProvider v-else>
        <div class="flex h-screen flex-col bg-canvas text-white select-none">
            <Header />
            <main
                ref="mainEl"
                class="mx-2 mb-2 flex-1 overflow-auto rounded-xl bg-surface ring-1 ring-line"
            >
                <RouterView />
            </main>
            <PersistentPlayer />
            <ShortcutsDialog />
        </div>
    </DragDropProvider>
</template>
