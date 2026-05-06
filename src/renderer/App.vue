<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { DragDropProvider } from '@dnd-kit/vue';
import Header from './components/Header.vue';
import BottomBar from './components/BottomBar.vue';
import PersistentPlayer from './components/PersistentPlayer.vue';
import { usePlayerStore } from './stores/player';

const route = useRoute();
const player = usePlayerStore();
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
        <div class="flex flex-col h-screen bg-black text-white select-none">
            <Header />
            <main
                ref="mainEl"
                class="flex-1 overflow-auto bg-neutral-900 mx-2 rounded-md"
                :class="{ 'mb-2': !player.streamUrl }"
            >
                <RouterView :class="route.path === '/player' ? 'h-full' : ''" />
            </main>
            <BottomBar v-if="player.streamUrl" />
            <PersistentPlayer />
        </div>
    </DragDropProvider>
</template>
