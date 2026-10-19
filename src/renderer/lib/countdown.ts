import { ref } from 'vue';

export function useCountdown(onDone: () => void) {
    const remaining = ref<number | null>(null);
    let timer: ReturnType<typeof setInterval> | undefined;

    function start(seconds: number) {
        stop();
        remaining.value = seconds;
        timer = setInterval(() => {
            remaining.value = (remaining.value ?? 0) - 1;
            if (remaining.value > 0) return;
            stop();
            onDone();
        }, 1000);
    }

    function stop() {
        clearInterval(timer);
        remaining.value = null;
    }

    return { remaining, start, stop };
}
