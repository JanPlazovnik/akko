<script setup lang="ts">
// The fill sweeps across over the duration in seconds; without one it's a plain button
defineProps<{ duration?: number | null }>();
</script>

<template>
    <button class="relative cursor-pointer overflow-hidden">
        <span
            v-if="duration"
            class="countdown-fill absolute inset-y-0 left-0 bg-white"
            :style="{ '--countdown': `${duration}s` }"
        />
        <span class="relative flex items-center justify-center gap-2">
            <slot />
        </span>
    </button>
</template>

<style>
.countdown-fill {
    animation: countdown-fill var(--countdown) linear forwards;
}

@keyframes countdown-fill {
    from {
        width: 0;
    }
    to {
        width: 100%;
    }
}
</style>
