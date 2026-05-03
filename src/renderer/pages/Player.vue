<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue';
import { usePlayerStore } from '../stores/player';
import '@videojs/html/video/player';
import '@videojs/html/video/minimal-skin';

const player = usePlayerStore();

let videoEl: HTMLVideoElement | null = null;

function getVideo(): HTMLVideoElement | null {
    return videoEl ?? (videoEl = document.querySelector('video-player video'));
}

function handleKeydown(e: KeyboardEvent) {
    const v = getVideo();
    if (!v) return;
    if (e.code === 'Space') {
        e.preventDefault();
        v.paused ? v.play() : v.pause();
    } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        v.currentTime = Math.min(v.currentTime + 10, v.duration);
    } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        v.currentTime = Math.max(v.currentTime - 10, 0);
    } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        v.volume = Math.min(v.volume + 0.1, 1);
    } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        v.volume = Math.max(v.volume - 0.1, 0);
    }
}

function handleClick(e: MouseEvent) {
    const isControl = e
        .composedPath()
        .some(
            (el) =>
                el instanceof HTMLElement &&
                (el.tagName === 'BUTTON' ||
                    el.tagName === 'INPUT' ||
                    el.tagName === 'SELECT' ||
                    el.getAttribute('role') === 'button' ||
                    el.getAttribute('role') === 'slider')
        );
    if (isControl) return;
    const v = getVideo();
    if (!v) return;
    v.paused ? v.play() : v.pause();
}

onMounted(() => {
    const v = getVideo();
    if (v) {
        v.addEventListener('play', () => {
            player.isPlaying = true;
        });
        v.addEventListener('pause', () => {
            player.isPlaying = false;
        });
        v.addEventListener('timeupdate', () => {
            player.currentTime = v.currentTime;
        });
        v.addEventListener('durationchange', () => {
            player.duration = v.duration;
        });
    }
    document.addEventListener('keydown', handleKeydown);
});

watch(
    () => player.streamUrl,
    (url) => {
        const v = getVideo();
        if (!v) return;
        if (url) v.play().catch(() => {});
        else v.pause();
    },
    { flush: 'post' }
);

// Subtitles arrive as blob URLs — attach directly, no fetch needed
watch(
    () => player.subtitles,
    (tracks) => {
        const v = getVideo();
        if (!v) return;
        v.querySelectorAll('track').forEach((t) => t.remove());
        for (const t of tracks) {
            const track = document.createElement('track');
            track.kind = 'subtitles';
            track.src = t.blobUrl;
            track.srclang = t.lang;
            track.label = t.label;
            track.default = player.activeSubtitle === t.lang;
            v.appendChild(track);
            if (track.default) {
                track.track.mode = 'showing';
            }
        }
    },
    { flush: 'post' }
);

onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown);
    player.stopStream();
});
</script>

<template>
    <div class="relative w-full h-full overflow-hidden" @click="handleClick">
        <div
            v-if="!player.streamUrl"
            class="flex items-center justify-center h-full text-white/30 text-sm"
        >
            &lt;
        </div>

        <video-player v-show="player.streamUrl" class="vjs-player">
            <video-minimal-skin>
                <video playsinline :src="player.streamUrl!" />
            </video-minimal-skin>
        </video-player>
    </div>
</template>

<style>
.vjs-player,
.vjs-player video-minimal-skin,
.vjs-player video {
    display: block;
    width: 100%;
    height: 100%;
}

.vjs-player video {
    object-fit: contain;
}

.vjs-player {
    --media-border-radius: 0;
    --media-video-border-radius: 0;
}
</style>
