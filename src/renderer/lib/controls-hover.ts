import { onMounted, onUnmounted } from 'vue';

const POLL_MS = 250;
const TOASTS = '[data-toasts]';

// The player hides its controls when the pointer leaves it, which also happens over things that
// are part of it to the user: the toasts on top of it, and drag regions, which Electron hands to
// the OS so the page stops seeing the pointer. Over either, this keeps the controls awake.
export function useControlsHover(getContainer: () => HTMLElement | null) {
    let timer: ReturnType<typeof setInterval> | undefined;
    let attached: HTMLElement | null = null;

    function overDragRegion(container: HTMLElement, x: number, y: number) {
        const target = document.elementFromPoint(x, y);
        return Boolean(target && container.contains(target) && target.closest('.drag'));
    }

    function stop() {
        clearInterval(timer);
        timer = undefined;
    }

    // The page can't see the cursor over a drag region, so ask the main process where it is
    function followCursor(container: HTMLElement) {
        stop();
        timer = setInterval(async () => {
            const cursor = await window.api.cursorPosition();
            if (!timer) return;
            if (cursor && overDragRegion(container, cursor.x, cursor.y)) {
                container.dispatchEvent(new PointerEvent('pointermove'));
                return;
            }
            stop();
            // Back on the page its own events take over; out of the window the controls can hide
            if (!cursor) container.dispatchEvent(new MouseEvent('mouseleave'));
        }, POLL_MS);
    }

    function onLeave(event: MouseEvent) {
        const container = getContainer();
        if (!event.isTrusted || !container) return;
        if ((event.relatedTarget as Element | null)?.closest(TOASTS)) {
            event.stopImmediatePropagation();
        } else if (overDragRegion(container, event.clientX, event.clientY)) {
            event.stopImmediatePropagation();
            followCursor(container);
        }
    }

    function onToastsMove(event: PointerEvent) {
        if ((event.target as Element | null)?.closest(TOASTS)) {
            attached?.dispatchEvent(new PointerEvent('pointermove'));
        }
    }

    onMounted(() => {
        attached = getContainer();
        // Capture runs before the player's own listener on the same element
        attached?.addEventListener('mouseleave', onLeave, { capture: true });
        document.addEventListener('pointermove', onToastsMove);
    });

    onUnmounted(() => {
        stop();
        attached?.removeEventListener('mouseleave', onLeave, { capture: true });
        document.removeEventListener('pointermove', onToastsMove);
    });
}
