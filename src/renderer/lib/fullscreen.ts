import { onMounted, onUnmounted, ref } from 'vue';

// Only the fullscreen element renders while fullscreen, so dialogs and toasts move into it
export function useFullscreenElement() {
    const element = ref<HTMLElement | null>(document.fullscreenElement as HTMLElement | null);
    const update = () => (element.value = document.fullscreenElement as HTMLElement | null);
    onMounted(() => document.addEventListener('fullscreenchange', update));
    onUnmounted(() => document.removeEventListener('fullscreenchange', update));
    return element;
}
