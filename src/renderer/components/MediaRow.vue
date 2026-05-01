<script setup lang="ts">
import MediaCard from './MediaCard.vue';
import type { Media } from '@shared/graphql/queries';

defineProps<{ title: string; items: Media[] }>();
</script>

<template>
    <div v-if="items.length" class="px-6 pt-6">
        <div class="flex items-baseline justify-between mb-3">
            <h3 class="text-sm font-semibold">{{ title }}</h3>
        </div>
        <div class="grid grid-flow-col auto-cols-[160px] gap-3.5 overflow-visible">
            <MediaCard v-for="item in items" :key="item.id" :item="item" />
        </div>
    </div>
</template>
