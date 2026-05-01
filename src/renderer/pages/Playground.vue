<script setup lang="ts">
import { toast } from 'vue3-toastify';
import { useLoadingStore } from '../stores/loading';
import { useAnilistStore } from '../stores/anilist';

const loadingBar = useLoadingStore();
const anilist = useAnilistStore();

async function testLoadingBar() {
    loadingBar.start();
    await new Promise((r) => setTimeout(r, 2000));
    loadingBar.finish();
}
</script>

<template>
    <div class="min-h-full bg-neutral-900 text-white p-8 space-y-10">
        <div>
            <p class="text-[10px] uppercase tracking-[0.16em] text-white/30 mb-1">Dev</p>
            <h1 class="text-2xl font-bold">Playground</h1>
        </div>

        <!-- Toasts -->
        <section class="space-y-3">
            <h2 class="text-sm font-semibold text-white/60 uppercase tracking-wider">Toasts</h2>
            <div class="flex flex-wrap gap-2">
                <button
                    class="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm transition-colors"
                    @click="toast.success('Success')"
                >
                    Success
                </button>
                <button
                    class="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm transition-colors"
                    @click="toast.error('Error')"
                >
                    Error
                </button>
                <button
                    class="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm transition-colors"
                    @click="toast.warn('Warning')"
                >
                    Warning
                </button>
                <button
                    class="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm transition-colors"
                    @click="toast.info('Info')"
                >
                    Info
                </button>
            </div>
        </section>

        <!-- Loading bar -->
        <section class="space-y-3">
            <h2 class="text-sm font-semibold text-white/60 uppercase tracking-wider">
                Loading Bar
            </h2>
            <div class="flex gap-2">
                <button
                    class="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm transition-colors"
                    @click="testLoadingBar()"
                >
                    Simulate 2s load
                </button>
                <button
                    class="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm transition-colors"
                    @click="loadingBar.start()"
                >
                    Start
                </button>
                <button
                    class="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm transition-colors"
                    @click="loadingBar.finish()"
                >
                    Finish
                </button>
            </div>
        </section>

        <!-- Store state -->
        <section class="space-y-3">
            <h2 class="text-sm font-semibold text-white/60 uppercase tracking-wider">
                Store State
            </h2>
            <div class="grid grid-cols-2 gap-3">
                <div class="bg-neutral-800 rounded-lg p-4 space-y-1.5 text-xs">
                    <p class="font-semibold text-white/80">Anilist</p>
                    <p class="text-white/40">dashboardLoading: {{ anilist.dashboardLoading }}</p>
                    <p class="text-white/40">
                        dashboardError: {{ anilist.dashboardError?.message ?? 'null' }}
                    </p>
                    <p class="text-white/40">
                        selectedMedia: {{ anilist.selectedMedia?.id ?? 'null' }}
                    </p>
                    <p class="text-white/40">
                        trending: {{ anilist.dashboard?.trending?.media?.length ?? 0 }} items
                    </p>
                </div>
                <div class="bg-neutral-800 rounded-lg p-4 space-y-1.5 text-xs">
                    <p class="font-semibold text-white/80">Loading Bar</p>
                    <p class="text-white/40">visible: {{ loadingBar.visible }}</p>
                    <p class="text-white/40">progress: {{ loadingBar.progress.toFixed(1) }}%</p>
                </div>
            </div>
        </section>
    </div>
</template>
