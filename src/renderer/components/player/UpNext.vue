<script setup lang="ts">
import { computed } from 'vue';
import { Loader2, Play } from '@lucide/vue';
import { usePlayerStore } from '../../stores/player';
import { COUNTDOWN_S, useQueueStore } from '../../stores/queue';
import CountdownButton from '../ui/CountdownButton.vue';
import { t } from '../../i18n';

const player = usePlayerStore();
const queue = useQueueStore();

const episode = computed(() => queue.next);
const finding = computed(() => Boolean(episode.value && queue.finding === episode.value));
const visible = computed(() => episode.value && (queue.upNext || finding.value));
const status = computed(() => {
    if (finding.value) return t('player.upNext.finding');
    return queue.countdown
        ? t('player.upNext.countdown', { n: queue.countdown })
        : t('player.upNext.title');
});
const thumbnail = computed(
    () => episode.value?.image ?? player.selection?.media.bannerImage ?? null
);
</script>

<template>
    <Transition
        enter-from-class="translate-y-3 opacity-0"
        leave-to-class="translate-y-3 opacity-0"
        enter-active-class="transition duration-300"
        leave-active-class="transition duration-200"
    >
        <div
            v-if="visible && episode"
            class="absolute right-6 bottom-28 z-30 w-80 overflow-hidden rounded-2xl bg-black/80 shadow-2xl ring-1 shadow-black/60 ring-white/10 backdrop-blur-md"
        >
            <div class="relative aspect-video bg-raised">
                <img v-if="thumbnail" :src="thumbnail" class="size-full object-cover" />
                <span
                    class="absolute bottom-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold"
                >
                    {{ $t('mediaCard.episodeShort', { episode: episode.number }) }}
                </span>
            </div>
            <div class="p-4">
                <p class="text-xs font-medium text-white/50">
                    {{ status }}
                </p>
                <p class="mt-0.5 truncate text-sm font-semibold">
                    {{ episode.title || $t('player.episode', { episode: episode.number }) }}
                </p>
                <div class="mt-3 flex gap-2">
                    <CountdownButton
                        :duration="finding ? null : COUNTDOWN_S"
                        :class="[
                            'h-9 flex-1 rounded-full text-sm font-semibold text-black disabled:cursor-default',
                            finding ? 'bg-white' : 'bg-white/70',
                        ]"
                        :disabled="finding"
                        @click="queue.play(episode)"
                    >
                        <Loader2 v-if="finding" :size="15" class="animate-spin" />
                        <Play v-else :size="14" fill="currentColor" />
                        {{ $t('player.upNext.playNow') }}
                    </CountdownButton>
                    <button
                        v-if="!finding"
                        class="h-9 cursor-pointer rounded-full bg-white/10 px-4 text-sm font-medium text-white/85 transition-colors hover:bg-white/20 hover:text-white"
                        @click="queue.dismissUpNext()"
                    >
                        {{ queue.countdown ? $t('common.cancel') : $t('common.close') }}
                    </button>
                </div>
            </div>
        </div>
    </Transition>
</template>
