<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { CloudOff } from '@lucide/vue';

const outage = ref<string | null>(null);
let unsubscribe: (() => void) | undefined;

onMounted(async () => {
    unsubscribe = window.api.on('anilist:outage', (message) => (outage.value = message));
    outage.value = await window.api.metadata.anilistOutage();
});
onUnmounted(() => unsubscribe?.());
</script>

<template>
    <div
        v-if="outage"
        role="status"
        class="mx-2 mb-2 flex items-center gap-2.5 rounded-xl bg-amber-400/8 px-4 py-2 text-[13px] ring-1 ring-amber-400/15"
    >
        <CloudOff :size="15" class="shrink-0 text-amber-400" />
        <span class="font-medium text-amber-100">{{ $t('anilistBanner.title') }}</span>
        <span class="min-w-0 truncate text-white/45" :title="outage">
            {{ $t('anilistBanner.detail', { reason: outage }) }}
        </span>
    </div>
</template>
