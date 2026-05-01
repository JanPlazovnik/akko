<script setup lang="ts">
import { useRoute } from 'vue-router';
import Header from './components/Header.vue';
import BottomBar from './components/BottomBar.vue';

const route = useRoute();
</script>

<template>
    <div class="flex flex-col h-screen bg-black text-white">
        <Header v-if="route.path !== '/player'" />
        <main class="flex-1 overflow-auto bg-neutral-900 mx-2 mb-2 rounded-md">
            <RouterView />
        </main>
        <!-- <BottomBar v-if="route.path !== '/player'" /> -->
    </div>
</template>
