<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
    ChevronLeft,
    Loader2,
    Maximize,
    Minimize,
    Pause,
    Play,
    RotateCcw,
    RotateCw,
    SkipBack,
    SkipForward,
    Volume2,
    VolumeX,
} from '@lucide/vue';
import { usePlayerStore } from '../../stores/player';
import { useQueueStore } from '../../stores/queue';
import type { Episode } from '@shared/anizip/types';
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
const queue = useQueueStore();

const EPISODE_BUTTON = 'disabled:cursor-default disabled:opacity-35';
const finding = (episode: Episode | null) => Boolean(episode && queue.finding === episode);

const RATE_BUTTON =
    "w-auto px-3 text-sm font-semibold tabular-nums after:content-[attr(data-rate)_'×']";
const BAR = 'pointer-events-none group-data-visible/controls:pointer-events-auto';

type Section = { start: number; end: number; title?: string };

// Shorter sections would only show up as a sliver between two gaps
const MIN_SECTION_SECONDS = 2;

// Without chapters, AniSkip's openings and endings still split the bar
const sections = computed<Section[]>(() => {
    const duration = player.duration;
    const marks = player.chapters.length ? player.chapters : player.skipSegments;
    if (!duration || !marks.length) return [{ start: 0, end: duration }];

    const bounds = [...new Set([0, ...marks.flatMap((c) => [c.start, c.end]), duration])]
        .filter((t) => t >= 0 && t <= duration)
        .sort((a, b) => a - b)
        .filter((t, i, all) => t === duration || all[i + 1] - t >= MIN_SECTION_SECONDS);
    return bounds.slice(0, -1).map((start, i) => {
        const end = bounds[i + 1];
        const middle = (start + end) / 2;
        const title = marks.find((c) => middle >= c.start && middle < c.end)?.title;
        return { start, end, title };
    });
});

const sectionStyles = computed(() =>
    sections.value.map((section, index, all) => {
        const left = (section.start / player.duration) * 100 || 0;
        const width = ((section.end - section.start) / player.duration) * 100 || 100;
        const last = index === all.length - 1;
        return {
            outer: {
                left: `${left}%`,
                width: `${width}%`,
                clipPath: `inset(0 ${last ? 0 : 1}px 0 ${index ? 1 : 0}px)`,
            },
            // Stretched to the whole track, so the slider's fill and buffer widths apply as they are
            inner: { left: `${(-left / width) * 100}%`, width: `${(100 / width) * 100}%` },
        };
    })
);

const hoverIndex = ref(-1);
const hoverChapter = computed(() => sections.value[hoverIndex.value]?.title);

function onSliderPointer(event: PointerEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const fraction = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    const time = fraction * player.duration;
    hoverIndex.value = sections.value.findIndex((s) => time >= s.start && time <= s.end);
}
</script>

<template>
    <media-controls
        class="group/controls absolute inset-0 z-20 flex flex-col justify-between opacity-0 transition-opacity duration-300 will-change-[opacity] data-visible:opacity-100"
    >
        <div
            class="pointer-events-none bg-linear-to-b from-black/75 via-black/30 to-transparent pb-24"
        >
            <div :class="[BAR, 'drag grid grid-cols-[1fr_auto_1fr] items-start gap-3 pb-2']">
                <div class="flex min-w-0 items-start gap-3 pl-3">
                    <button
                        :class="[CONTROL_BUTTON, 'no-drag mt-3']"
                        title="Back"
                        @click="goBack(router)"
                    >
                        <ChevronLeft :size="24" />
                    </button>
                    <div class="mt-3 min-w-0 flex-1">
                        <p class="truncate text-xs font-medium text-white/60">{{ player.title }}</p>
                        <h1 class="truncate font-display text-xl font-semibold">
                            <EpisodeLabel />
                        </h1>
                    </div>
                </div>
                <!-- Wrapped so the window controls keep the last column when the stats are hidden -->
                <div class="mt-4">
                    <StreamStats class="no-drag" />
                </div>
                <div class="flex justify-end">
                    <WindowControls v-if="!fullscreen" class="h-11" />
                </div>
            </div>
        </div>

        <div
            :class="[
                BAR,
                'bg-linear-to-t from-black/85 via-black/45 to-transparent px-5 pt-28 pb-3',
            ]"
        >
            <media-time-slider
                class="group/slider relative flex h-5 cursor-pointer items-center outline-none"
                @pointermove="onSliderPointer"
                @pointerleave="hoverIndex = -1"
            >
                <media-slider-track class="relative block h-full w-full">
                    <div
                        v-for="(section, index) in sections"
                        :key="section.start"
                        :class="[
                            'absolute top-1/2 h-1 -translate-y-1/2 overflow-hidden transition-[height] duration-150 group-hover/slider:h-1.5',
                            index === 0 && 'rounded-l-full',
                            index === sections.length - 1 && 'rounded-r-full',
                            sections.length > 1 &&
                                index === hoverIndex &&
                                'group-hover/slider:h-2!',
                        ]"
                        :style="sectionStyles[index].outer"
                    >
                        <div
                            class="absolute inset-y-0 bg-white/20"
                            :style="sectionStyles[index].inner"
                        >
                            <span
                                class="absolute inset-y-0 left-0 block w-(--media-slider-buffer) bg-white/25"
                            />
                            <span
                                class="absolute inset-y-0 left-0 block w-(--media-slider-fill) bg-accent"
                            />
                        </div>
                    </div>
                </media-slider-track>
                <media-slider-thumb
                    class="absolute top-1/2 left-(--media-slider-fill) block size-3.5 -translate-1/2 scale-0 rounded-full bg-white shadow-md transition-transform group-hover/slider:scale-100 group-data-dragging/slider:scale-100"
                />
                <div
                    class="pointer-events-none absolute bottom-full left-(--media-slider-pointer) mb-2 -translate-x-1/2 opacity-0 transition-opacity group-hover/slider:opacity-100 group-data-dragging/slider:opacity-100"
                >
                    <div class="rounded-md bg-black/85 px-2 py-1 text-center text-xs">
                        <span
                            v-if="hoverChapter"
                            class="block max-w-48 truncate font-medium text-white/60"
                        >
                            {{ hoverChapter }}
                        </span>
                        <media-slider-value type="pointer" class="block font-medium tabular-nums" />
                    </div>
                </div>
            </media-time-slider>

            <div class="mt-1 flex items-center gap-1">
                <button
                    :class="[CONTROL_BUTTON, EPISODE_BUTTON]"
                    title="Previous episode (Shift+P)"
                    :disabled="!queue.previous || !!queue.finding"
                    @click="queue.previous && queue.play(queue.previous)"
                >
                    <Loader2 v-if="finding(queue.previous)" :size="18" class="animate-spin" />
                    <SkipBack v-else :size="18" fill="currentColor" />
                </button>
                <media-play-button :class="[CONTROL_BUTTON, 'group/play']" title="Play/Pause (k)">
                    <Play
                        :size="20"
                        fill="currentColor"
                        class="hidden group-data-paused/play:block"
                    />
                    <Pause :size="20" fill="currentColor" class="group-data-paused/play:hidden" />
                </media-play-button>
                <button
                    :class="[CONTROL_BUTTON, EPISODE_BUTTON]"
                    title="Next episode (Shift+N)"
                    :disabled="!queue.next || !!queue.finding"
                    @click="queue.next && queue.play(queue.next)"
                >
                    <Loader2 v-if="finding(queue.next)" :size="18" class="animate-spin" />
                    <SkipForward v-else :size="18" fill="currentColor" />
                </button>
                <!-- Bound, so the element gets a number rather than a string it would concatenate -->
                <media-seek-button :seconds="-10" :class="CONTROL_BUTTON" title="Back 10s (j)">
                    <RotateCcw :size="18" />
                </media-seek-button>
                <media-seek-button :seconds="10" :class="CONTROL_BUTTON" title="Forward 10s (l)">
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
