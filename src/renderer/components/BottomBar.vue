<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Maximize2, Square } from '@lucide/vue';
import { usePlayerStore } from '../stores/player';

const route = useRoute();
const router = useRouter();
const player = usePlayerStore();

const isPlayerRoute = computed(() => route.path === '/player');
const activity = computed(() => player.activity);
const artwork = computed(
    () => activity.value?.episode.thumbnail ?? activity.value?.media.coverImage
);
const title = computed(() => activity.value?.media.title ?? 'Unknown title');
const subtitle = computed(() => {
    const episode = activity.value?.episode;
    if (!episode) return activity.value?.playback.isPlaying ? 'Playing' : 'Paused';

    return [
        activity.value?.playback.isPlaying ? 'Playing' : 'Paused',
        `Episode ${episode.number}`,
        episode.title,
    ]
        .filter(Boolean)
        .join(' - ');
});
const progress = computed(() => {
    const playback = activity.value?.playback;
    if (!playback?.duration) return 0;
    return playback.currentTime / playback.duration;
});

function formatTime(s: number): string {
    const m = Math.floor(s / 60);
    return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

async function stop() {
    await player.stopStream();
    if (isPlayerRoute.value) void router.push('/');
}
</script>

<template>
    <div
        class="flex h-[74px] shrink-0 items-center gap-4 border-t border-white/10 bg-black px-4 sm:gap-[18px] sm:px-[18px]"
    >
        <div class="flex w-[180px] min-w-0 items-center gap-3 sm:w-[260px]">
            <img
                v-if="artwork"
                :src="artwork"
                class="h-11 w-11 shrink-0 rounded object-cover bg-white/[0.06]"
                alt=""
            />
            <div
                v-else
                class="h-11 w-11 shrink-0 rounded bg-white/[0.06] ring-1 ring-inset ring-white/[0.05]"
            />
            <div class="min-w-0">
                <p class="truncate text-[13px] font-semibold leading-tight text-white/90">
                    {{ title }}
                </p>
                <p class="mt-0.5 truncate text-[11px] leading-tight text-white/45">
                    {{ subtitle }}
                </p>
            </div>
        </div>

        <div
            class="hidden min-w-40 flex-1 items-center gap-2.5 text-[11px] text-white/40 tabular-nums sm:flex"
        >
            <span>{{ formatTime(activity?.playback.currentTime ?? 0) }}</span>
            <div class="relative h-1 flex-1 overflow-hidden rounded-full bg-white/15">
                <div
                    class="absolute inset-y-0 left-0 rounded-full bg-white/75"
                    :style="{ width: `${progress * 100}%` }"
                />
            </div>
            <span>{{ formatTime(activity?.playback.duration ?? 0) }}</span>
        </div>

        <div class="ml-auto flex items-center justify-end gap-2 sm:w-[260px]">
            <button
                v-if="!isPlayerRoute"
                class="grid h-8 w-8 place-items-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                title="Expand to player"
                @click="router.push('/player')"
            >
                <Maximize2 :size="15" />
            </button>

            <button
                class="grid h-8 w-8 place-items-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                title="Stop"
                @click="stop"
            >
                <Square :size="15" />
            </button>
        </div>
    </div>
</template>
