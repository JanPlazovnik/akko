import type { AudioTrack } from '../../shared/ipc/api';
import { describeLanguage } from './language';
import { TrackType, type MatroskaTrack } from './matroska';

const UNSUPPORTED_CODECS: [prefix: string, name: string][] = [
    ['A_EAC3', 'E-AC3'],
    ['A_AC3', 'AC3'],
    ['A_DTS', 'DTS'],
    ['A_TRUEHD', 'TrueHD'],
    ['A_MLP', 'TrueHD'],
];

export function audioTracks(tracks: MatroskaTrack[]): AudioTrack[] {
    return tracks
        .filter((track) => track.type === TrackType.Audio)
        .map((track, i) => {
            const unsupported = UNSUPPORTED_CODECS.find(([prefix]) =>
                track.codecId.startsWith(prefix)
            );
            return {
                ...describeLanguage(track.language, track.name, `Track ${i + 1}`),
                codec: unsupported?.[1] ?? track.codecId.replace(/^A_/, ''),
                channels: track.channels ?? 2,
                supported: !unsupported,
            };
        });
}
