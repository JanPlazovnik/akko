<script setup lang="ts">
import { useLoadingStore } from '../stores/loading';

const loading = useLoadingStore();
</script>

<template>
    <Transition name="bar-fade">
        <!-- Along the window's top edge, which stays straight where the panels below are rounded -->
        <div v-if="loading.visible" class="pointer-events-none fixed inset-x-0 top-0 z-100 h-0.5">
            <div
                class="h-full rounded-r-full bg-linear-to-r from-accent/30 via-accent to-[#c4b5fd] transition-[width] duration-150 ease-out"
                :style="{ width: loading.progress + '%' }"
            />
        </div>
    </Transition>
</template>

<style scoped>
.bar-fade-leave-active {
    transition: opacity 0.3s ease;
}
.bar-fade-leave-to {
    opacity: 0;
}
</style>
