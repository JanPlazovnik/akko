<script setup lang="ts">
import { computed } from 'vue';
import { ArrowDown, ArrowUp, Users } from '@lucide/vue';
import { usePlayerStore } from '../../stores/player';
import { useSettingsStore } from '../../stores/settings';
import { formatBytes, formatPercent, formatSpeed } from '../../lib/format';

const player = usePlayerStore();
const settingsStore = useSettingsStore();

const items = computed(() => {
    const stats = player.stats;
    if (!stats) return [];
    return [
        { icon: ArrowDown, label: formatSpeed(stats.downloadSpeed), title: 'Download speed' },
        { icon: ArrowUp, label: formatSpeed(stats.uploadSpeed), title: 'Upload speed' },
        { icon: Users, label: String(stats.peers), title: 'Connected peers' },
    ];
});
</script>

<template>
    <div
        v-if="player.stats && settingsStore.settings?.showStreamStats"
        class="flex items-center gap-4 rounded-full bg-black/40 px-4 py-2 text-xs tabular-nums text-white/75 backdrop-blur-md"
    >
        <span
            v-for="item in items"
            :key="item.title"
            :title="item.title"
            class="flex items-center gap-1.5"
        >
            <component :is="item.icon" :size="12" class="text-white/45" />
            {{ item.label }}
        </span>
        <span
            class="flex items-center gap-2"
            :title="`${formatBytes(player.stats.downloaded)} of ${formatBytes(player.stats.size)} downloaded`"
        >
            <span class="h-1 w-14 overflow-hidden rounded-full bg-white/15">
                <span
                    class="block h-full rounded-full bg-accent transition-[width] duration-700"
                    :style="{ width: formatPercent(player.stats.progress) }"
                />
            </span>
            {{ formatPercent(player.stats.progress) }}
        </span>
    </div>
</template>
