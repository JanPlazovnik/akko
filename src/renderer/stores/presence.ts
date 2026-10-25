import { defineStore } from 'pinia';
import { toRaw, watch } from 'vue';
import type { PresenceState } from '@shared/ipc/api';
import { mediaTitle, type PlaybackActivity } from '@shared/media/types';
import { useMediaStore } from './media';
import { usePlayerStore } from './player';

// How far the end time Discord counts down to may drift before it's corrected, so only seeks
// and stalls send an update rather than every tick of playback
const DRIFT_MS = 3000;

export const usePresenceStore = defineStore('presence', () => {
    const player = usePlayerStore();
    const mediaStore = useMediaStore();

    let lastKey: string | null = null;
    let lastEnd = 0;

    function toPresence({ media: summary, episode, playback }: PlaybackActivity): PresenceState {
        const media = mediaStore.mediaFor(summary.anilistId);
        return {
            anilistId: summary.anilistId,
            // Always English, since anyone can see it
            title: media ? mediaTitle(toRaw(media), 'ENGLISH') : summary.title,
            cover: summary.coverImage ?? media?.coverImage?.large ?? null,
            isAdult: media?.isAdult ?? false,
            episode: episode.number,
            episodeCount: summary.episodeCount ?? media?.episodes ?? null,
            episodeTitle: episode.title ?? null,
            status: !playback.duration ? 'loading' : playback.isPlaying ? 'playing' : 'paused',
            position: playback.currentTime,
            duration: playback.duration,
        };
    }

    watch(
        () => player.activity,
        (activity) => {
            const presence = activity && toPresence(activity);
            const key = presence && `${presence.anilistId}:${presence.episode}:${presence.status}`;
            const end =
                presence?.status === 'playing'
                    ? Date.now() + (presence.duration - presence.position) * 1000
                    : 0;
            if (key === lastKey && Math.abs(end - lastEnd) < DRIFT_MS) return;
            lastKey = key;
            lastEnd = end;
            window.api.setPresence(presence);
        }
    );
});
