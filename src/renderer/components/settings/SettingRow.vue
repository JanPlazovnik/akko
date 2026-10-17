<script setup lang="ts">
defineProps<{ title: string; description?: string; disabled?: boolean }>();
</script>

<template>
    <div :class="['flex items-center gap-6 px-5 py-4', disabled && 'opacity-50']">
        <div class="min-w-0 flex-1">
            <p class="text-sm font-medium">
                {{ title }}
                <slot name="badge" />
            </p>
            <p
                v-if="description || $slots.description"
                class="mt-0.5 text-xs leading-relaxed text-white/45"
            >
                <slot name="description">{{ description }}</slot>
            </p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
            <slot />
        </div>
    </div>
</template>
