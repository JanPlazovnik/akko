<script setup lang="ts">
import { computed } from 'vue';
import {
    Camera,
    Captions,
    Keyboard,
    Layers,
    Maximize,
    Minimize,
    Pause,
    Play,
    SkipBack,
    SkipForward,
} from '@lucide/vue';
import {
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuPortal,
    ContextMenuRoot,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from 'reka-ui';
import { usePlayerStore } from '../../stores/player';
import { useQueueStore } from '../../stores/queue';
import { openShortcuts, shortcutsOpen } from '../../lib/shortcuts';

defineProps<{ enabled: boolean; container: HTMLElement | null; fullscreen: boolean }>();
const emit = defineEmits<{ togglePlay: []; screenshot: []; toggleFullscreen: [] }>();

const player = usePlayerStore();
const queue = useQueueStore();
// These are the dialogs that can open over the player; the menu would land behind their backdrop
const dialogOpen = computed(() => player.pickerOpen || shortcutsOpen.value);

const ITEM =
    'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/85 outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-35 data-highlighted:bg-white/10 data-highlighted:text-white';
const ICON = 'shrink-0 text-white/55';
const KEY = 'ml-auto pl-8 text-xs text-white/35';
const SEPARATOR = 'mx-2 my-1 h-px bg-line';
</script>

<template>
    <ContextMenuRoot>
        <ContextMenuTrigger as-child :disabled="!enabled || dialogOpen">
            <slot />
        </ContextMenuTrigger>
        <!-- Rendered inside the player, the only thing visible in fullscreen -->
        <ContextMenuPortal :to="container ?? 'body'">
            <ContextMenuContent
                class="z-50 min-w-60 rounded-xl border border-line bg-raised/95 p-1.5 text-white shadow-2xl shadow-black/60 backdrop-blur-xl"
            >
                <ContextMenuItem
                    :class="ITEM"
                    :disabled="!player.streamUrl"
                    @select="emit('togglePlay')"
                >
                    <component :is="player.isPlaying ? Pause : Play" :size="15" :class="ICON" />
                    {{ player.isPlaying ? $t('player.pause') : $t('player.play') }}
                    <span :class="KEY">{{ $t('shortcuts.keys.Space') }}</span>
                </ContextMenuItem>
                <ContextMenuItem
                    :class="ITEM"
                    :disabled="!player.streamUrl"
                    @select="emit('screenshot')"
                >
                    <Camera :size="15" :class="ICON" />
                    {{ $t('player.copyScreenshot') }}
                </ContextMenuItem>

                <ContextMenuSeparator :class="SEPARATOR" />
                <ContextMenuItem
                    :class="ITEM"
                    :disabled="!queue.previous || !!queue.finding"
                    @select="queue.previous && queue.play(queue.previous)"
                >
                    <SkipBack :size="15" :class="ICON" />
                    {{ $t('player.previousEpisode') }}
                    <span :class="KEY">{{ $t('shortcuts.combo.shiftP') }}</span>
                </ContextMenuItem>
                <ContextMenuItem
                    :class="ITEM"
                    :disabled="!queue.next || !!queue.finding"
                    @select="queue.next && queue.play(queue.next)"
                >
                    <SkipForward :size="15" :class="ICON" />
                    {{ $t('player.nextEpisode') }}
                    <span :class="KEY">{{ $t('shortcuts.combo.shiftN') }}</span>
                </ContextMenuItem>
                <ContextMenuItem
                    v-if="player.tracks.length"
                    :class="ITEM"
                    @select="player.toggleSubtitles()"
                >
                    <Captions :size="15" :class="ICON" />
                    {{
                        player.activeTrackId
                            ? $t('player.subtitlesTurnOff')
                            : $t('player.subtitlesTurnOn')
                    }}
                    <span :class="KEY">C</span>
                </ContextMenuItem>
                <ContextMenuItem
                    v-if="player.pickerContext"
                    :class="ITEM"
                    @select="player.pickAnotherRelease()"
                >
                    <Layers :size="15" :class="ICON" />
                    {{ $t('player.pickAnother') }}
                </ContextMenuItem>

                <ContextMenuSeparator :class="SEPARATOR" />
                <ContextMenuItem :class="ITEM" @select="emit('toggleFullscreen')">
                    <component :is="fullscreen ? Minimize : Maximize" :size="15" :class="ICON" />
                    {{ fullscreen ? $t('player.exitFullscreen') : $t('player.fullscreen') }}
                    <span :class="KEY">F</span>
                </ContextMenuItem>
                <ContextMenuItem :class="ITEM" @select="openShortcuts()">
                    <Keyboard :size="15" :class="ICON" />
                    {{ $t('player.shortcuts') }}
                    <span :class="KEY">?</span>
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenuPortal>
    </ContextMenuRoot>
</template>
