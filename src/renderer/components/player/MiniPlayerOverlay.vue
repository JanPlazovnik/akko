<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Maximize2, Pause, Play, X } from '@lucide/vue';
import { usePlayerStore } from '../../stores/player';
import EpisodeLabel from './EpisodeLabel.vue';

const router = useRouter();
const player = usePlayerStore();

const progress = computed(() =>
    player.duration ? `${(player.currentTime / player.duration) * 100}%` : '0%'
);

const BUTTON =
    'grid cursor-pointer place-items-center rounded-full bg-black/40 text-white/85 backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-white';
</script>

<template>
    <div
        class="absolute inset-0 z-20 flex flex-col justify-between rounded-xl bg-linear-to-t from-black/80 via-black/10 to-black/50 opacity-0 transition-opacity duration-200 group-hover/mini:opacity-100"
    >
        <div class="flex justify-end gap-1.5 p-2">
            <button
                :class="[BUTTON, 'size-7']"
                :title="$t('player.expand')"
                @mousedown.stop
                @click.stop="router.push('/player')"
            >
                <Maximize2 :size="13" />
            </button>
            <button
                :class="[BUTTON, 'size-7']"
                :title="$t('player.stop')"
                @mousedown.stop
                @click.stop="player.stopStream()"
            >
                <X :size="14" />
            </button>
        </div>

        <media-play-button
            :class="[BUTTON, 'group/play size-11 self-center']"
            @mousedown.stop
            @click.stop
        >
            <Play :size="18" fill="currentColor" class="hidden group-data-paused/play:block" />
            <Pause :size="18" fill="currentColor" class="group-data-paused/play:hidden" />
        </media-play-button>

        <div class="min-w-0 px-3 pb-3">
            <p class="truncate text-xs font-semibold">{{ player.title }}</p>
            <p class="truncate text-[11px] text-white/60"><EpisodeLabel /></p>
        </div>
    </div>

    <div class="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-xl">
        <div class="absolute inset-x-0 bottom-0 h-0.5 bg-white/15">
            <div class="h-full bg-accent" :style="{ width: progress }" />
        </div>
    </div>
</template>
