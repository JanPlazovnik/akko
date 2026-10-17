<script setup lang="ts">
defineProps<{ id: string; title: string; description?: string; bare?: boolean }>();
</script>

<template>
    <section :id="id" class="scroll-mt-6">
        <h2 class="text-lg font-semibold">{{ title }}</h2>
        <p v-if="description" class="mt-1 text-sm text-white/45">{{ description }}</p>
        <div v-if="bare" class="mt-4"><slot /></div>
        <div v-else class="mt-4 divide-y divide-line rounded-xl bg-raised/60 ring-1 ring-line">
            <slot />
        </div>
    </section>
</template>
