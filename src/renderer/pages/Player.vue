<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { usePlayerStore } from '../stores/player';
import '@videojs/html/video/player';
import '@videojs/html/video/minimal-skin';

const player = usePlayerStore();
const playerEl = ref<HTMLElement | null>(null);

function getVideoEl(): HTMLVideoElement | null {
    return playerEl.value?.querySelector('video') ?? null;
}

function handleKeydown(e: KeyboardEvent) {
    const video = getVideoEl();
    if (!video) return;
    if (e.code === 'Space') {
        e.preventDefault();
        video.paused ? video.play() : video.pause();
    } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        video.currentTime = Math.min(video.currentTime + 10, video.duration);
    } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        video.currentTime = Math.max(video.currentTime - 10, 0);
    } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        video.volume = Math.min(video.volume + 0.1, 1);
    } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        video.volume = Math.max(video.volume - 0.1, 0);
    }
}

function handleClick() {
    const video = getVideoEl();
    if (!video) return;
    video.paused ? video.play() : video.pause();
}

onMounted(() => {
    const video = getVideoEl();
    if (!video) return;
    video.addEventListener('play', () => {
        player.isPlaying = true;
    });
    video.addEventListener('pause', () => {
        player.isPlaying = false;
    });
    video.addEventListener('timeupdate', () => {
        player.currentTime = video.currentTime;
    });
    video.addEventListener('durationchange', () => {
        player.duration = video.duration;
    });
    document.addEventListener('keydown', handleKeydown);

    const skinEl = playerEl.value?.querySelector('video-minimal-skin');
    if (skinEl?.shadowRoot) {
        const style = document.createElement('style');
        style.textContent = '.media-minimal-skin::after { display: none !important; }';
        skinEl.shadowRoot.appendChild(style);
    }
});

watch(
    () => player.streamUrl,
    (url) => {
        const video = getVideoEl();
        if (!video) return;
        if (url) {
            video.play().catch(() => {});
        } else {
            video.pause();
        }
    },
    { flush: 'post' }
);

watch(
    () => player.subtitles,
    (tracks) => {
        const video = getVideoEl();
        if (!video) return;
        video.querySelectorAll('track').forEach((t) => t.remove());
        for (const t of tracks) {
            const track = document.createElement('track');
            track.kind = 'subtitles';
            track.src = t.url;
            track.srclang = t.lang;
            track.label = t.label;
            track.default = player.activeSubtitle === t.lang;
            video.appendChild(track);
        }
    }
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
            <
        </div>

        <video-player v-show="player.streamUrl" ref="playerEl" class="vjs-player">
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
