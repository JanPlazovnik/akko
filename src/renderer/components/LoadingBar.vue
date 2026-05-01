<script setup lang="ts">
import { useLoadingStore } from '../stores/loading';

const loading = useLoadingStore();
</script>

<template>
    <Transition name="bar-fade">
        <div
            v-if="loading.visible"
            class="w-32 h-[3px] rounded-full bg-white/10 overflow-hidden pointer-events-none"
        >
            <div
                class="h-full bg-white rounded-full transition-all duration-150 ease-out"
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
