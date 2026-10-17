<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { DragDropProvider } from '@dnd-kit/vue';
import Header from './components/Header.vue';
import PersistentPlayer from './components/PersistentPlayer.vue';
import { useSettingsStore } from './stores/settings';
const route = useRoute();
const settings = useSettingsStore();
onMounted(() => void settings.load());
const mainEl = ref<HTMLElement | null>(null);
const scrollMemory = new Map<string, number>();
const REMEMBER = new Set(['/']);

watch(
    () => route.path,
    (newPath, oldPath) => {
        if (REMEMBER.has(oldPath) && mainEl.value) {
            scrollMemory.set(oldPath, mainEl.value.scrollTop);
        }
        const saved = REMEMBER.has(newPath) ? (scrollMemory.get(newPath) ?? 0) : 0;
        mainEl.value?.scrollTo({ top: saved });
    }
);
</script>

<template>
    <DragDropProvider>
        <div class="flex h-screen flex-col bg-canvas text-white select-none">
            <Header />
            <main
                ref="mainEl"
                class="mx-2 mb-2 flex-1 overflow-auto rounded-xl bg-surface ring-1 ring-line"
            >
                <RouterView />
            </main>
            <PersistentPlayer />
        </div>
    </DragDropProvider>
</template>
