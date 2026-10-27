<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { AlertTriangle, Loader2 } from '@lucide/vue';
import { usePlayerStore } from '../../stores/player';
import EpisodeLabel from './EpisodeLabel.vue';
import { formatSpeed } from '../../lib/format';
import { goBack } from '../../lib/navigation';
import WindowControls from '../WindowControls.vue';

const router = useRouter();
const player = usePlayerStore();

const backdrop = computed(
    () =>
        player.selection?.episode.thumbnail ??
        player.selection?.media.bannerImage ??
        player.selection?.media.coverImage ??
        null
);

function leave() {
    void player.stopStream();
    goBack(router);
}

function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && !player.streamUrl) leave();
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onUnmounted(() => document.removeEventListener('keydown', onKeydown));

const idle = computed(() => !player.loading && !player.error);
</script>

<template>
    <div
        v-if="!player.streamUrl"
        class="absolute inset-0 z-30 grid place-items-center overflow-hidden bg-canvas"
    >
        <img
            v-if="backdrop"
            :src="backdrop"
            class="absolute inset-0 size-full scale-110 object-cover opacity-25 blur-2xl"
        />
        <div class="drag absolute inset-x-0 top-0 flex h-12 justify-end">
            <WindowControls class="h-11" />
        </div>
        <div v-if="idle" class="relative flex flex-col items-center px-6 text-center">
            <p class="font-display text-5xl text-white/25 select-none">(&gt;へ&lt;)</p>
            <h2 class="mt-6 font-display text-2xl font-semibold">Nothing is playing</h2>
            <div class="mt-6 flex gap-2">
                <button
                    class="no-drag cursor-pointer rounded-lg bg-white/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-white/20"
                    @click="leave"
                >
                    Go back
                </button>
                <button
                    class="no-drag cursor-pointer rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110"
                    @click="router.push('/')"
                >
                    Browse anime
                </button>
            </div>
        </div>
        <div v-else class="relative flex max-w-lg flex-col items-center gap-5 px-6 text-center">
            <Loader2 v-if="player.loading" :size="30" class="animate-spin text-accent" />
            <AlertTriangle v-else :size="30" class="text-red-400" />
            <div class="space-y-1">
                <p v-if="player.title" class="text-sm font-medium text-white/50">
                    {{ player.title }}
                </p>
                <h2 class="font-display text-3xl font-semibold text-balance">
                    <EpisodeLabel />
                </h2>
            </div>
            <p :class="['text-sm', player.error ? 'text-red-300/90' : 'text-white/50']">
                {{ player.error ?? 'Connecting to peers and fetching torrent metadata…' }}
            </p>
            <button
                class="no-drag cursor-pointer rounded-lg bg-white/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-white/20"
                @click="leave"
            >
                {{ player.loading ? 'Cancel' : 'Go back' }}
            </button>
        </div>
    </div>

    <media-buffering-indicator
        class="pointer-events-none absolute inset-0 z-25 hidden place-items-center data-visible:grid"
    >
        <div
            class="flex flex-col items-center gap-3 rounded-2xl bg-black/55 px-6 py-4 backdrop-blur-md"
        >
            <Loader2 :size="28" class="animate-spin" />
            <p v-if="player.stats" class="text-xs text-white/70 tabular-nums">
                {{ formatSpeed(player.stats.downloadSpeed) }} · {{ player.stats.peers }} peers
            </p>
            <p v-if="player.stalled" class="max-w-64 text-center text-xs text-amber-200/90">
                The download has stalled, peers may be missing part of this release.
                <button
                    v-if="player.pickerContext"
                    class="pointer-events-auto cursor-pointer text-white/80 underline decoration-white/30 underline-offset-4 transition-colors hover:text-white hover:decoration-white"
                    @click="player.pickAnotherRelease()"
                >
                    Pick another release
                </button>
            </p>
        </div>
    </media-buffering-indicator>
</template>
