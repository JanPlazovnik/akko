<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import Header from './components/Header.vue';

const route = useRoute();
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
    <div class="flex flex-col h-screen bg-black text-white select-none">
        <Header />
        <main ref="mainEl" class="flex-1 overflow-auto bg-neutral-900 mx-2 mb-2 rounded-md">
            <RouterView :class="route.path === '/player' ? 'h-full' : ''" />
        </main>
    </div>
</template>
