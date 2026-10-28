<script setup lang="ts">
import { SkipForward } from '@lucide/vue';
import { usePlayerStore } from '../../stores/player';

const emit = defineEmits<{ seek: [time: number] }>();
const player = usePlayerStore();
</script>

<template>
    <Transition
        enter-from-class="opacity-0 translate-y-1"
        leave-to-class="opacity-0"
        enter-active-class="transition duration-200"
        leave-active-class="transition duration-150"
    >
        <button
            v-if="player.skippableChapter"
            class="absolute right-5 bottom-28 z-30 flex cursor-pointer items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20 backdrop-blur-sm transition-colors outline-none hover:bg-white hover:text-black focus-visible:ring-2 focus-visible:ring-accent"
            @click.stop="emit('seek', player.skippableChapter.end)"
        >
            <SkipForward :size="16" fill="currentColor" />
            {{ $t('player.skip', { chapter: player.skippableChapter.title }) }}
        </button>
    </Transition>
</template>
