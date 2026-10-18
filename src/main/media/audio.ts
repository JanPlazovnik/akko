import type { AudioSupport, AudioTrack } from '../../shared/ipc/api';
import { describeLanguage } from './language';
import { TrackType, type MatroskaTrack } from './matroska';

// Chromium can't decode these; AC-3 and E-AC-3 are played through the renderer's audio bridge
const FOREIGN_CODECS: [prefix: string, name: string, support: AudioSupport][] = [
    ['A_EAC3', 'E-AC3', 'decoded'],
    ['A_AC3', 'AC3', 'decoded'],
    ['A_DTS', 'DTS', 'none'],
    ['A_TRUEHD', 'TrueHD', 'none'],
    ['A_MLP', 'TrueHD', 'none'],
];

export function audioTracks(tracks: MatroskaTrack[]): AudioTrack[] {
    return tracks
        .filter((track) => track.type === TrackType.Audio)
        .map((track, i) => {
            const foreign = FOREIGN_CODECS.find(([prefix]) => track.codecId.startsWith(prefix));
            return {
                ...describeLanguage(track.language, track.name, `Track ${i + 1}`),
                codec: foreign?.[1] ?? track.codecId.replace(/^A_/, ''),
                channels: track.channels ?? 2,
                support: foreign?.[2] ?? 'native',
            };
        });
}
