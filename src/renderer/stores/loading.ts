import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useLoadingStore = defineStore('loading', () => {
    const progress = ref(0);
    const visible = ref(false);
    let timer: ReturnType<typeof setInterval> | null = null;

    function start() {
        if (timer) clearInterval(timer);
        progress.value = 0;
        visible.value = true;
        timer = setInterval(() => {
            progress.value += (90 - progress.value) * 0.12;
        }, 80);
    }

    function finish() {
        if (timer) clearInterval(timer);
        timer = null;
        progress.value = 100;
        setTimeout(() => {
            visible.value = false;
            progress.value = 0;
        }, 350);
    }

    return { progress, visible, start, finish };
});
