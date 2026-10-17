import type Metadata from 'matroska-metadata';
import type { EbmlTag } from 'matroska-metadata';
import type { AudioTrack } from '../../shared/ipc/api';
import { describeLanguage } from './language';

const TAG = {
    TrackEntry: 0xae,
    TrackType: 0x83,
    CodecID: 0x86,
    Language: 0x22b59c,
    Name: 0x536e,
    Audio: 0xe1,
    Channels: 0x9f,
};
const AUDIO_TRACK_TYPE = 2;

const UNSUPPORTED_CODECS: [prefix: string, name: string][] = [
    ['A_EAC3', 'E-AC3'],
    ['A_AC3', 'AC3'],
    ['A_DTS', 'DTS'],
    ['A_TRUEHD', 'TrueHD'],
    ['A_MLP', 'TrueHD'],
];

function child(tag: EbmlTag | undefined, id: number): EbmlTag | undefined {
    return tag?.Children?.find((c) => c.id === id);
}

export async function readAudioTracks(metadata: Metadata): Promise<AudioTrack[]> {
    const tracks = await metadata.readSeekHeadTag('Tracks');
    return (tracks?.Children ?? [])
        .filter(
            (entry) =>
                entry.id === TAG.TrackEntry &&
                child(entry, TAG.TrackType)?.data === AUDIO_TRACK_TYPE
        )
        .map((entry, i) => {
            const codecId = String(child(entry, TAG.CodecID)?.data ?? '');
            const unsupported = UNSUPPORTED_CODECS.find(([prefix]) => codecId.startsWith(prefix));
            const name = child(entry, TAG.Name)?.data;
            return {
                ...describeLanguage(
                    String(child(entry, TAG.Language)?.data ?? 'eng'),
                    typeof name === 'string' ? name : undefined,
                    `Track ${i + 1}`
                ),
                codec: unsupported?.[1] ?? codecId.replace(/^A_/, ''),
                channels: Number(child(child(entry, TAG.Audio), TAG.Channels)?.data ?? 2),
                supported: !unsupported,
            };
        });
}
