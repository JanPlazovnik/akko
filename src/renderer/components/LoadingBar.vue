<script setup lang="ts">
import { useLoadingStore } from '../stores/loading';

const loading = useLoadingStore();
</script>

<template>
    <Transition name="bar-fade">
        <div
            v-if="loading.visible"
            class="fixed top-0 left-0 right-0 z-[9999] h-[2px] bg-transparent pointer-events-none"
        >
            <div
                class="h-full bg-white transition-all duration-150 ease-out"
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
