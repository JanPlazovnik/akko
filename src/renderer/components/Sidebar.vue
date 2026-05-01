<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router';

const router = useRouter();
const route = useRoute();

const allRoutes = router.getRoutes().filter((r) => r.meta?.icon);
const topRoutes = allRoutes.filter((r) => r.meta.sidebarPosition === 'top');
const bottomRoutes = allRoutes.filter((r) => r.meta.sidebarPosition === 'bottom');
</script>

<template>
    <nav class="flex flex-col h-full w-14 items-center justify-between py-4 bg-black">
        <div class="flex flex-col items-center gap-2">
            <button
                v-for="r in topRoutes"
                :key="r.path"
                @click="router.push(r.path)"
                :class="[
                    'p-3 rounded-lg',
                    route.path === r.path ? 'bg-white/10' : 'hover:bg-white/5',
                ]"
            >
                <component :is="r.meta.icon" :size="20" color="white" />
            </button>
        </div>
        <div class="flex flex-col items-center gap-2">
            <button
                v-for="r in bottomRoutes"
                :key="r.path"
                @click="router.push(r.path)"
                :class="[
                    'p-3 rounded-lg',
                    route.path === r.path ? 'bg-white/10' : 'hover:bg-white/5',
                ]"
            >
                <component :is="r.meta.icon" :size="20" color="white" />
            </button>
        </div>
    </nav>
</template>
