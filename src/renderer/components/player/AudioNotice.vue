<script setup lang="ts">
import { computed } from 'vue';
import { usePlayerStore } from '../../stores/player';

const player = usePlayerStore();

const codecs = computed(() => [...new Set(player.audioTracks.map((t) => t.codec))].join('/'));
</script>

<template>
    <p v-if="player.unsupportedAudio" class="text-sm text-amber-200/90">
        {{
            $t(player.audioBridgeFailed ? 'player.noSoundFailed' : 'player.noSoundUnsupported', {
                codecs,
            })
        }}
        <button
            v-if="player.pickerContext"
            class="cursor-pointer text-white/80 underline decoration-white/30 underline-offset-4 transition-colors hover:text-white hover:decoration-white"
            @click="player.pickAnotherRelease()"
        >
            {{ $t('player.pickAnother') }}
        </button>
    </p>
</template>
