<script setup lang="ts">
import { useRouter } from 'vue-router';
import { Home, Search, Settings, Minus, Square, X, FlaskConical } from '@lucide/vue';
import LoadingBar from './LoadingBar.vue';

const router = useRouter();
const { minimizeWindow, maximizeWindow, closeWindow } = window.api;
</script>

<template>
    <header class="drag shrink-0">
        <div class="h-14 flex items-center justify-between pl-4">
            <div class="no-drag flex items-center gap-4">
                <button
                    @click="router.push('/')"
                    class="p-1.5 rounded-full hover:bg-white/10 text-white/60 hover:text-white shrink-0"
                >
                    <Home :size="18" />
                </button>

                <button
                    @click="router.push('/search')"
                    class="flex items-center gap-2 bg-neutral-900 hover:bg-white/15 rounded-full px-4 h-9 w-80 text-white/40 text-sm"
                >
                    <Search :size="14" class="shrink-0" />
                    <span>Search</span>
                </button>
            </div>

            <div class="no-drag flex items-center gap-2">
                <LoadingBar />

                <button
                    @click="router.push('/playground')"
                    class="no-drag p-1.5 rounded-full hover:bg-white/10 text-white/40 hover:text-white"
                    title="Playground"
                >
                    <FlaskConical :size="18" />
                </button>
                <button
                    @click="router.push('/settings')"
                    class="no-drag p-1.5 rounded-full hover:bg-white/10 text-white/60 hover:text-white"
                >
                    <Settings :size="18" />
                </button>
                <button class="w-8 h-8 rounded-full bg-neutral-900 hover:bg-white/30 mx-1" />
                <div class="flex items-stretch h-14 ml-1">
                    <button
                        @click="minimizeWindow()"
                        class="w-11 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10"
                    >
                        <Minus :size="14" />
                    </button>
                    <button
                        @click="maximizeWindow()"
                        class="w-11 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10"
                    >
                        <Square :size="12" />
                    </button>
                    <button
                        @click="closeWindow()"
                        class="w-11 flex items-center justify-center text-white/60 hover:text-white hover:bg-red-600"
                    >
                        <X :size="14" />
                    </button>
                </div>
            </div>
        </div>
    </header>
</template>
