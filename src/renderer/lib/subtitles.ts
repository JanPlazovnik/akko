import { onUnmounted, watch } from 'vue';
import JASSUB from 'jassub';
import workerUrl from 'jassub/dist/worker/worker.js?worker&url';
import wasmUrl from 'jassub/dist/wasm/jassub-worker.wasm?url';
import modernWasmUrl from 'jassub/dist/wasm/jassub-worker-modern.wasm?url';
import type { SubtitleTrack } from '@shared/ipc/api';
import type { SubtitleEvent } from '@shared/subtitles';
import { usePlayerStore } from '../stores/player';
import { createLogger } from './logger';
import { DEFAULT_FAMILY, fallbackFont } from './fallback-fonts';

const log = createLogger('subtitles');

export function useSubtitleRenderer(getVideo: () => HTMLVideoElement | null) {
    const player = usePlayerStore();
    let jassub: JASSUB | null = null;
    let styles = new Map<string, number>();
    let loadedFallbacks = new Set<string>();
    let queue: Promise<unknown> = Promise.resolve();

    function enqueue(task: (renderer: JASSUB) => Promise<unknown>) {
        const renderer = jassub;
        if (!renderer) return;
        queue = queue
            .then(() => renderer.ready)
            .then(() => (renderer === jassub ? task(renderer) : undefined))
            .catch((err) => log.warn('Subtitle renderer task failed', err));
    }

    async function repaint(renderer: JASSUB) {
        const video = getVideo();
        if (!video?.paused) return;
        await renderer.manualRender({
            mediaTime: video.currentTime,
            width: video.videoWidth,
            height: video.videoHeight,
            expectedDisplayTime: performance.now(),
        });
    }

    async function loadTrack(renderer: JASSUB) {
        const list = await renderer.renderer.getStyles();
        styles = new Map(list.map((style, index) => [style.Name, index]));
        await repaint(renderer);
    }

    async function createEvents(renderer: JASSUB, events: SubtitleEvent[]) {
        await Promise.all(
            events.map((event) =>
                renderer.renderer.createEvent({
                    Start: event.start,
                    Duration: event.duration,
                    ReadOrder: 0,
                    Layer: event.layer,
                    Style: styles.get(event.style) ?? 0,
                    Name: event.name,
                    MarginL: event.marginL,
                    MarginR: event.marginR,
                    MarginV: event.marginV,
                    Effect: event.effect,
                    Text: event.text,
                })
            )
        );
        await repaint(renderer);
    }

    function destroy() {
        const renderer = jassub;
        if (!renderer) return;
        jassub = null;
        queue = queue.then(() => renderer.destroy()).catch(() => undefined);
    }

    async function useFallbackFont(renderer: JASSUB, lang: string) {
        const font = await fallbackFont(lang);
        if (font && !loadedFallbacks.has(font.family)) {
            loadedFallbacks.add(font.family);
            await renderer.renderer.addFonts(font.data);
        }
        await renderer.renderer.setDefaultFont(font?.family ?? DEFAULT_FAMILY);
        await repaint(renderer);
    }

    function show(track: SubtitleTrack | null) {
        const video = getVideo();
        if (!track || !video) return destroy();

        const content = player.trackContent(track);
        if (jassub) {
            enqueue(async (r) => {
                await r.renderer.setTrack(content);
                await loadTrack(r);
            });
            enqueue((r) => useFallbackFont(r, track.lang));
            return;
        }

        jassub = new JASSUB({
            video,
            subContent: content,
            fonts: [...player.fonts],
            workerUrl,
            wasmUrl,
            modernWasmUrl,
        });
        loadedFallbacks = new Set();
        enqueue(loadTrack);
        enqueue((r) => useFallbackFont(r, track.lang));
    }

    watch(() => player.activeTrack, show, { flush: 'post' });

    watch(
        () => player.fonts,
        (fonts) => {
            if (fonts.length > 0) enqueue((r) => r.renderer.addFonts([...fonts]));
        }
    );

    const offCues = player.onCues((trackId, events) => {
        if (trackId === player.activeTrackId) enqueue((r) => createEvents(r, events));
    });

    onUnmounted(() => {
        offCues();
        destroy();
    });
}
