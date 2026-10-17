<script setup lang="ts">
import { useRouter } from 'vue-router';
import {
    ChevronLeft,
    Maximize,
    Minimize,
    Pause,
    Play,
    RotateCcw,
    RotateCw,
    Volume2,
    VolumeX,
} from '@lucide/vue';
import { usePlayerStore } from '../../stores/player';
import EpisodeLabel from './EpisodeLabel.vue';
import { goBack } from '../../lib/navigation';
import WindowControls from '../WindowControls.vue';
import StreamStats from './StreamStats.vue';
import SubtitleMenu from './SubtitleMenu.vue';
import AudioNotice from './AudioNotice.vue';
import { CONTROL_BUTTON } from './styles';

defineProps<{ fullscreen: boolean }>();

const router = useRouter();
const player = usePlayerStore();

const RATE_BUTTON =
    "w-auto px-3 text-sm font-semibold tabular-nums after:content-[attr(data-rate)_'×']";
const BAR = 'pointer-events-none group-data-visible/controls:pointer-events-auto';
</script>

<template>
    <media-controls
        class="group/controls absolute inset-0 z-20 flex flex-col justify-between opacity-0 transition-opacity duration-300 data-visible:opacity-100"
    >
        <div
            :class="[
                BAR,
                'drag flex items-start gap-3 bg-linear-to-b from-black/75 via-black/30 to-transparent pb-24 pl-3',
            ]"
        >
            <button :class="[CONTROL_BUTTON, 'no-drag mt-3']" title="Back" @click="goBack(router)">
                <ChevronLeft :size="24" />
            </button>
            <div class="mt-3 min-w-0">
                <p class="truncate text-xs font-medium text-white/60">{{ player.title }}</p>
                <h1 class="truncate font-display text-xl font-semibold">
                    <EpisodeLabel />
                </h1>
            </div>
            <StreamStats class="no-drag mt-4 ml-auto shrink-0" />
            <WindowControls v-if="!fullscreen" class="h-11" />
        </div>

        <div
            :class="[
                BAR,
                'bg-linear-to-t from-black/85 via-black/45 to-transparent px-5 pt-28 pb-3',
            ]"
        >
            <media-time-slider
                class="group/slider relative flex h-5 cursor-pointer items-center outline-none"
            >
                <media-slider-track
                    class="relative block h-1 w-full overflow-hidden rounded-full bg-white/20 transition-[height] duration-150 group-hover/slider:h-1.5"
                >
                    <media-slider-buffer
                        class="absolute inset-y-0 left-0 block w-(--media-slider-buffer) bg-white/25"
                    />
                    <media-slider-fill
                        class="absolute inset-y-0 left-0 block w-(--media-slider-fill) bg-accent"
                    />
                </media-slider-track>
                <media-slider-thumb
                    class="absolute top-1/2 left-(--media-slider-fill) block size-3.5 -translate-1/2 scale-0 rounded-full bg-white shadow-md transition-transform group-hover/slider:scale-100 group-data-dragging/slider:scale-100"
                />
                <div
                    class="pointer-events-none absolute bottom-full left-(--media-slider-pointer) mb-2 -translate-x-1/2 opacity-0 transition-opacity group-hover/slider:opacity-100 group-data-dragging/slider:opacity-100"
                >
                    <media-slider-value
                        type="pointer"
                        class="block rounded-md bg-black/85 px-2 py-1 text-xs font-medium tabular-nums"
                    />
                </div>
            </media-time-slider>

            <div class="mt-1 flex items-center gap-1">
                <media-play-button :class="[CONTROL_BUTTON, 'group/play']" title="Play/Pause (k)">
                    <Play
                        :size="20"
                        fill="currentColor"
                        class="hidden group-data-paused/play:block"
                    />
                    <Pause :size="20" fill="currentColor" class="group-data-paused/play:hidden" />
                </media-play-button>
                <media-seek-button seconds="-10" :class="CONTROL_BUTTON" title="Back 10s (j)">
                    <RotateCcw :size="18" />
                </media-seek-button>
                <media-seek-button seconds="10" :class="CONTROL_BUTTON" title="Forward 10s (l)">
                    <RotateCw :size="18" />
                </media-seek-button>

                <div class="group/volume flex items-center">
                    <media-mute-button :class="[CONTROL_BUTTON, 'group/mute']" title="Mute (m)">
                        <VolumeX :size="20" class="hidden group-data-muted/mute:block" />
                        <Volume2 :size="20" class="group-data-muted/mute:hidden" />
                    </media-mute-button>
                    <media-volume-slider
                        class="relative flex h-8 w-0 cursor-pointer items-center overflow-hidden opacity-0 transition-all duration-200 group-focus-within/volume:w-24 group-focus-within/volume:opacity-100 group-hover/volume:w-24 group-hover/volume:opacity-100"
                    >
                        <media-slider-track
                            class="relative block h-1 w-full rounded-full bg-white/25"
                        >
                            <media-slider-fill
                                class="absolute inset-y-0 left-0 block w-(--media-slider-fill) rounded-full bg-white"
                            />
                        </media-slider-track>
                    </media-volume-slider>
                </div>

                <div class="ml-3 text-sm text-white/85 tabular-nums">
                    <media-time type="current" />
                    <span class="mx-1 text-white/35">/</span>
                    <media-time type="duration" class="text-white/50" />
                </div>

                <AudioNotice class="ml-5" />

                <div class="ml-auto flex items-center gap-1">
                    <SubtitleMenu />
                    <media-playback-rate-button
                        :class="[CONTROL_BUTTON, RATE_BUTTON]"
                        title="Playback speed"
                    />
                    <media-fullscreen-button
                        :class="[CONTROL_BUTTON, 'group/fs']"
                        title="Fullscreen (f)"
                    >
                        <Maximize :size="19" class="group-data-fullscreen/fs:hidden" />
                        <Minimize :size="19" class="hidden group-data-fullscreen/fs:block" />
                    </media-fullscreen-button>
                </div>
            </div>
        </div>
    </media-controls>
</template>
