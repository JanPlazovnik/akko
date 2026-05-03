import { TorrentFile } from '../fs/TorrentFile';
import type { FontAttachment } from '../fs/httpServer';

export type MatroskaSubtitleTrack = {
    lang: string;
    label: string;
    content: string;
    format: 'vtt' | 'ass';
    fonts?: string[];
};

export type MatroskaBootstrapResult = {
    tracks: MatroskaSubtitleTrack[];
    fontAttachments: FontAttachment[];
};

type HeaderInfo = {
    timecodeScaleNs: number;
    segmentDataOffset: number;
    segmentEnd: number;
    firstClusterOffset: number;
    tracks: ParsedSubtitleTrack[];
    attachments: ParsedAttachment[];
    topLevelPositions: Map<number, number>;
};

type ParsedSubtitleTrack = {
    trackNumber: number;
    lang: string;
    label: string;
    codecId: string;
    codecPrivate: string;
    attachmentLinks: number[];
};

type RawCue = {
    startMs: number;
    durationMs?: number;
    text: string;
};

type ParsedAttachment = {
    uid: number;
    name: string;
    mediaType: string;
    data: Uint8Array;
};

type ParsedHeader = {
    id: number;
    size: number;
    headerSize: number;
    dataOffset: number;
    endOffset: number;
};

type CueClusterRef = {
    trackNumber: number;
    clusterOffset: number;
    relativePosition: number | null;
};

type ClusterCueGroup = {
    clusterOffset: number;
    refs: CueClusterRef[];
};

type AssHeader = {
    preamble: string;
};

const HEADER_SCAN_LIMIT = 8 * 1024 * 1024;
const DEFAULT_CUE_DURATION_MS = 3_000;
const READER_WINDOW_SIZE = 256 * 1024;
const CLUSTER_PARSE_CONCURRENCY = 6;

const SEGMENT_ID = 0x18538067;
const INFO_ID = 0x1549a966;
const TRACKS_ID = 0x1654ae6b;
const CLUSTER_ID = 0x1f43b675;
const CUES_ID = 0x1c53bb6b;
const ATTACHMENTS_ID = 0x1941a469;
const SEEK_HEAD_ID = 0x114d9b74;
const TRACK_ENTRY_ID = 0xae;
const CODEC_PRIVATE_ID = 0x63a2;
const ATTACHMENT_LINK_ID = 0x7446;
const TIMECODE_SCALE_ID = 0x2ad7b1;
const TRACK_NUMBER_ID = 0xd7;
const TRACK_TYPE_ID = 0x83;
const CODEC_ID_ID = 0x86;
const TRACK_LANGUAGE_ID = 0x22b59c;
const TRACK_NAME_ID = 0x536e;
const CLUSTER_TIMECODE_ID = 0xe7;
const SIMPLE_BLOCK_ID = 0xa3;
const BLOCK_GROUP_ID = 0xa0;
const BLOCK_ID = 0xa1;
const BLOCK_DURATION_ID = 0x9b;
const ATTACHED_FILE_ID = 0x61a7;
const FILE_NAME_ID = 0x466e;
const FILE_MEDIA_TYPE_ID = 0x4660;
const FILE_DATA_ID = 0x465c;
const FILE_UID_ID = 0x46ae;
const SEEK_ID_ID = 0x53ab;
const SEEK_POSITION_ID = 0x53ac;
const CUE_POINT_ID = 0xbb;
const CUE_TRACK_POSITIONS_ID = 0xb7;
const CUE_TRACK_ID = 0xf7;
const CUE_CLUSTER_POSITION_ID = 0xf1;
const CUE_RELATIVE_POSITION_ID = 0xf0;
const CLUSTER_TIMECODE_SCAN_BYTES = 8 * 1024;
const TARGET_BLOCK_SCAN_BYTES = 64 * 1024;

const SUBTITLE_TRACK_TYPE = 0x11;
const TEXT_SUBTITLE_CODECS = new Set([
    'S_TEXT/UTF8',
    'S_TEXT/ASCII',
    'S_TEXT/ASS',
    'S_TEXT/SSA',
    'S_TEXT/WEBVTT',
]);

const FONT_MEDIA_TYPES = new Set([
    'font/sfnt',
    'font/ttf',
    'font/otf',
    'font/collection',
    'font/woff',
    'font/woff2',
    'application/x-truetype-font',
    'application/x-font-ttf',
    'application/vnd.ms-opentype',
    'application/font-sfnt',
    'application/font-woff',
    'application/octet-stream',
]);

const LANG_MAP: Record<string, string> = {
    en: 'English',
    eng: 'English',
    es: 'Spanish',
    spa: 'Spanish',
    fr: 'French',
    fre: 'French',
    de: 'German',
    ger: 'German',
    it: 'Italian',
    ita: 'Italian',
    pt: 'Portuguese',
    por: 'Portuguese',
    ru: 'Russian',
    rus: 'Russian',
    ja: 'Japanese',
    jpn: 'Japanese',
    ko: 'Korean',
    kor: 'Korean',
    zh: 'Chinese',
    chi: 'Chinese',
    nl: 'Dutch',
    nld: 'Dutch',
    pl: 'Polish',
    pol: 'Polish',
};

class BufferedTorrentReader {
    private windowStart = 0;
    private window = Buffer.alloc(0);

    constructor(private readonly file: TorrentFile) {}

    async read(offset: number, length: number): Promise<Buffer> {
        if (length <= 0) return Buffer.alloc(0);
        if (offset < 0 || offset >= this.file.length) return Buffer.alloc(0);

        const clampedLength = Math.min(length, this.file.length - offset);
        const windowEnd = this.windowStart + this.window.length;
        if (offset >= this.windowStart && offset + clampedLength <= windowEnd) {
            return this.window.subarray(
                offset - this.windowStart,
                offset - this.windowStart + clampedLength
            );
        }

        if (clampedLength > READER_WINDOW_SIZE) {
            return this.file.read(offset, clampedLength);
        }

        const loadLength = Math.min(
            Math.max(READER_WINDOW_SIZE, clampedLength),
            this.file.length - offset
        );
        this.windowStart = offset;
        this.window = Buffer.from(await this.file.read(offset, loadLength));
        return this.window.subarray(0, clampedLength);
    }
}

export async function bootstrapMatroskaSubtitles(
    torrentFile: TorrentFile,
    fontBaseUrl: string
): Promise<MatroskaBootstrapResult | null> {
    const reader = new BufferedTorrentReader(torrentFile);
    const header = await parseHeader(reader, torrentFile);
    if (!header) return null;

    logStream('Embedded subtitle streams found:', header.tracks.length);
    if (header.tracks.length === 0) {
        return { tracks: [], fontAttachments: header.attachments };
    }

    const startupTracks = selectStartupTracks(header.tracks);
    logStream(
        'Selected startup subtitle tracks:',
        startupTracks.map((track) => `${track.label}(${track.lang})`)
    );

    const cuesByTrack = createCueMap(startupTracks);
    const cueRefs = await findSubtitleCueClusters(
        reader,
        torrentFile,
        header,
        new Set(startupTracks.map((track) => track.trackNumber))
    );

    if (cueRefs.length > 0) {
        logStream('Bootstrapping subtitles from cue-indexed entries:', cueRefs.length);
        await extractCuesFromIndexedClusters(torrentFile, header, cueRefs, cuesByTrack);

        const tracks = buildTracks(startupTracks, cuesByTrack, header.attachments, fontBaseUrl);
        if (tracks.some((track) => hasSubtitleContent(track))) {
            logTrackSummary(tracks);
            return { tracks, fontAttachments: header.attachments };
        }

        logStream(
            'Cue-indexed subtitle bootstrap returned empty tracks, falling back to cluster scan'
        );
    } else {
        logStream('No subtitle cue index found, falling back to cluster scan');
    }

    await scanClustersSequentially(reader, torrentFile, header, cuesByTrack);
    const tracks = buildTracks(startupTracks, cuesByTrack, header.attachments, fontBaseUrl);
    logTrackSummary(tracks);
    return { tracks, fontAttachments: header.attachments };
}

function createCueMap(tracks: ParsedSubtitleTrack[]): Map<number, RawCue[]> {
    return new Map(tracks.map((track) => [track.trackNumber, []]));
}

function selectStartupTracks(tracks: ParsedSubtitleTrack[]): ParsedSubtitleTrack[] {
    if (tracks.length <= 1) return tracks;

    const scored = tracks.map((track) => ({
        track,
        score: scoreStartupTrack(track),
    }));
    scored.sort((a, b) => b.score - a.score);
    return [scored[0].track];
}

function scoreStartupTrack(track: ParsedSubtitleTrack): number {
    const label = track.label.toLowerCase();
    let score = 0;

    if (track.lang === 'en') score += 200;
    else if (track.lang === 'un' || track.lang === 'und') score += 20;

    if (label.includes('english')) score += 180;
    if (label.includes('eng')) score += 80;
    if (label.includes('commentary')) score -= 100;
    if (label.includes('forced')) score -= 30;
    if (label.includes('sign')) score -= 40;
    if (label.includes('songs')) score -= 20;

    return score;
}

async function parseHeader(
    reader: BufferedTorrentReader,
    file: TorrentFile
): Promise<HeaderInfo | null> {
    let cursor = 0;
    let segment: ParsedHeader | null = null;

    while (cursor < Math.min(file.length, HEADER_SCAN_LIMIT)) {
        const element = await readElementHeader(reader, file, cursor);
        if (!element) return null;
        if (element.id === SEGMENT_ID) {
            segment = element;
            break;
        }
        cursor = element.endOffset;
    }

    if (!segment) return null;

    let timecodeScaleNs = 1_000_000;
    const tracks: ParsedSubtitleTrack[] = [];
    const attachments: ParsedAttachment[] = [];
    let firstClusterOffset = segment.endOffset;
    const topLevelPositions = new Map<number, number>();
    cursor = segment.dataOffset;

    while (cursor < segment.endOffset && cursor - segment.dataOffset < HEADER_SCAN_LIMIT) {
        const element = await readElementHeader(reader, file, cursor);
        if (!element) break;

        if (element.id === SEEK_HEAD_ID) {
            const seekEntries = await parseSeekHead(reader, file, element);
            seekEntries.forEach((position, id) => topLevelPositions.set(id, position));
        } else if (element.id === INFO_ID) {
            timecodeScaleNs = await parseInfo(reader, file, element);
        } else if (element.id === TRACKS_ID) {
            tracks.push(...(await parseTracks(reader, file, element)));
        } else if (element.id === ATTACHMENTS_ID) {
            attachments.push(...(await parseAttachments(reader, file, element)));
        } else if (element.id === CLUSTER_ID) {
            firstClusterOffset = cursor;
            break;
        }

        cursor = element.endOffset;
    }

    const attachmentsPosition = topLevelPositions.get(ATTACHMENTS_ID);
    if (attachments.length === 0 && attachmentsPosition !== undefined) {
        const attachmentsElement = await readElementHeader(
            reader,
            file,
            segment.dataOffset + attachmentsPosition
        );
        if (attachmentsElement?.id === ATTACHMENTS_ID) {
            attachments.push(...(await parseAttachments(reader, file, attachmentsElement)));
        }
    }

    return {
        timecodeScaleNs,
        segmentDataOffset: segment.dataOffset,
        segmentEnd: segment.endOffset,
        firstClusterOffset,
        tracks,
        attachments,
        topLevelPositions,
    };
}

async function parseInfo(
    reader: BufferedTorrentReader,
    file: TorrentFile,
    info: ParsedHeader
): Promise<number> {
    let cursor = info.dataOffset;
    let timecodeScaleNs = 1_000_000;

    while (cursor < info.endOffset) {
        const element = await readElementHeader(reader, file, cursor);
        if (!element) break;
        if (element.id === TIMECODE_SCALE_ID) {
            timecodeScaleNs = await readUnsigned(reader, element);
        }
        cursor = element.endOffset;
    }

    return timecodeScaleNs;
}

async function parseTracks(
    reader: BufferedTorrentReader,
    file: TorrentFile,
    tracksElement: ParsedHeader
): Promise<ParsedSubtitleTrack[]> {
    const tracks: ParsedSubtitleTrack[] = [];
    let cursor = tracksElement.dataOffset;

    while (cursor < tracksElement.endOffset) {
        const element = await readElementHeader(reader, file, cursor);
        if (!element) break;
        if (element.id === TRACK_ENTRY_ID) {
            const track = await parseTrackEntry(reader, file, element);
            if (track) tracks.push(track);
        }
        cursor = element.endOffset;
    }

    return tracks;
}

async function parseTrackEntry(
    reader: BufferedTorrentReader,
    file: TorrentFile,
    trackEntry: ParsedHeader
): Promise<ParsedSubtitleTrack | null> {
    let cursor = trackEntry.dataOffset;
    let trackNumber: number | null = null;
    let trackType: number | null = null;
    let codecId = '';
    let codecPrivate = '';
    let lang = 'und';
    let label = '';
    const attachmentLinks: number[] = [];

    while (cursor < trackEntry.endOffset) {
        const element = await readElementHeader(reader, file, cursor);
        if (!element) break;

        if (element.id === TRACK_NUMBER_ID) {
            trackNumber = await readUnsigned(reader, element);
        } else if (element.id === TRACK_TYPE_ID) {
            trackType = await readUnsigned(reader, element);
        } else if (element.id === CODEC_ID_ID) {
            codecId = await readString(reader, element);
        } else if (element.id === CODEC_PRIVATE_ID) {
            codecPrivate = await readString(reader, element);
        } else if (element.id === TRACK_LANGUAGE_ID) {
            lang = (await readString(reader, element)).slice(0, 3) || 'und';
        } else if (element.id === TRACK_NAME_ID) {
            label = await readString(reader, element);
        } else if (element.id === ATTACHMENT_LINK_ID) {
            attachmentLinks.push(await readUnsigned(reader, element));
        }

        cursor = element.endOffset;
    }

    if (
        trackNumber === null ||
        trackType !== SUBTITLE_TRACK_TYPE ||
        !TEXT_SUBTITLE_CODECS.has(codecId)
    ) {
        return null;
    }

    const shortLang = lang.slice(0, 2) || 'und';
    return {
        trackNumber,
        codecId,
        codecPrivate,
        lang: shortLang,
        label: label || LANG_MAP[lang] || LANG_MAP[shortLang] || `Track ${trackNumber}`,
        attachmentLinks,
    };
}

async function parseSeekHead(
    reader: BufferedTorrentReader,
    file: TorrentFile,
    seekHead: ParsedHeader
): Promise<Map<number, number>> {
    const positions = new Map<number, number>();
    let cursor = seekHead.dataOffset;

    while (cursor < seekHead.endOffset) {
        const element = await readElementHeader(reader, file, cursor);
        if (!element) break;

        if (element.id === 0x4dbb) {
            let entryCursor = element.dataOffset;
            let targetId: number | null = null;
            let position: number | null = null;

            while (entryCursor < element.endOffset) {
                const child = await readElementHeader(reader, file, entryCursor);
                if (!child) break;

                if (child.id === SEEK_ID_ID) {
                    const data = await reader.read(child.dataOffset, child.size);
                    targetId = 0;
                    for (const byte of data) targetId = targetId * 256 + byte;
                } else if (child.id === SEEK_POSITION_ID) {
                    position = await readUnsigned(reader, child);
                }

                entryCursor = child.endOffset;
            }

            if (targetId !== null && position !== null) {
                positions.set(targetId, position);
            }
        }

        cursor = element.endOffset;
    }

    return positions;
}

async function parseAttachments(
    reader: BufferedTorrentReader,
    file: TorrentFile,
    attachmentsElement: ParsedHeader
): Promise<ParsedAttachment[]> {
    const attachments: ParsedAttachment[] = [];
    let cursor = attachmentsElement.dataOffset;

    while (cursor < attachmentsElement.endOffset) {
        const element = await readElementHeader(reader, file, cursor);
        if (!element) break;

        if (element.id === ATTACHED_FILE_ID) {
            const attachment = await parseAttachedFile(reader, file, element);
            if (attachment) attachments.push(attachment);
        }

        cursor = element.endOffset;
    }

    return attachments;
}

async function parseAttachedFile(
    reader: BufferedTorrentReader,
    file: TorrentFile,
    attachedFile: ParsedHeader
): Promise<ParsedAttachment | null> {
    let cursor = attachedFile.dataOffset;
    let uid: number | null = null;
    let name = '';
    let mediaType = '';
    let data = new Uint8Array(0);

    while (cursor < attachedFile.endOffset) {
        const element = await readElementHeader(reader, file, cursor);
        if (!element) break;

        if (element.id === FILE_UID_ID) {
            uid = await readUnsigned(reader, element);
        } else if (element.id === FILE_NAME_ID) {
            name = await readString(reader, element);
        } else if (element.id === FILE_MEDIA_TYPE_ID) {
            mediaType = await readString(reader, element);
        } else if (element.id === FILE_DATA_ID) {
            data = new Uint8Array(await reader.read(element.dataOffset, element.size));
        }

        cursor = element.endOffset;
    }

    if (uid === null || !name || !mediaType || !isFontAttachment(name, mediaType)) {
        return null;
    }

    return { uid, name, mediaType, data };
}

async function findSubtitleCueClusters(
    reader: BufferedTorrentReader,
    file: TorrentFile,
    header: HeaderInfo,
    subtitleTrackNumbers: Set<number>
): Promise<CueClusterRef[]> {
    const cuesPosition = header.topLevelPositions.get(CUES_ID);
    if (cuesPosition === undefined) return [];

    const cuesElement = await readElementHeader(
        reader,
        file,
        header.segmentDataOffset + cuesPosition
    );
    if (!cuesElement || cuesElement.id !== CUES_ID) return [];

    const cueRefs = await parseCues(
        reader,
        file,
        cuesElement,
        header.segmentDataOffset,
        subtitleTrackNumbers
    );

    return dedupeCueRefs(cueRefs);
}

async function parseCues(
    reader: BufferedTorrentReader,
    file: TorrentFile,
    cuesElement: ParsedHeader,
    segmentDataOffset: number,
    subtitleTrackNumbers: Set<number>
): Promise<CueClusterRef[]> {
    const refs: CueClusterRef[] = [];
    let cursor = cuesElement.dataOffset;

    while (cursor < cuesElement.endOffset) {
        const element = await readElementHeader(reader, file, cursor);
        if (!element) break;

        if (element.id === CUE_POINT_ID) {
            refs.push(
                ...(await parseCuePoint(
                    reader,
                    file,
                    element,
                    segmentDataOffset,
                    subtitleTrackNumbers
                ))
            );
        }

        cursor = element.endOffset;
    }

    return refs;
}

async function parseCuePoint(
    reader: BufferedTorrentReader,
    file: TorrentFile,
    cuePoint: ParsedHeader,
    segmentDataOffset: number,
    subtitleTrackNumbers: Set<number>
): Promise<CueClusterRef[]> {
    const refs: CueClusterRef[] = [];
    let cursor = cuePoint.dataOffset;

    while (cursor < cuePoint.endOffset) {
        const element = await readElementHeader(reader, file, cursor);
        if (!element) break;

        if (element.id === CUE_TRACK_POSITIONS_ID) {
            const ref = await parseCueTrackPosition(
                reader,
                file,
                element,
                segmentDataOffset,
                subtitleTrackNumbers
            );
            if (ref) refs.push(ref);
        }

        cursor = element.endOffset;
    }

    return refs;
}

async function parseCueTrackPosition(
    reader: BufferedTorrentReader,
    file: TorrentFile,
    cueTrackPosition: ParsedHeader,
    segmentDataOffset: number,
    subtitleTrackNumbers: Set<number>
): Promise<CueClusterRef | null> {
    let cursor = cueTrackPosition.dataOffset;
    let trackNumber: number | null = null;
    let clusterPosition: number | null = null;
    let relativePosition: number | null = null;

    while (cursor < cueTrackPosition.endOffset) {
        const element = await readElementHeader(reader, file, cursor);
        if (!element) break;

        if (element.id === CUE_TRACK_ID) {
            trackNumber = await readUnsigned(reader, element);
        } else if (element.id === CUE_CLUSTER_POSITION_ID) {
            clusterPosition = await readUnsigned(reader, element);
        } else if (element.id === CUE_RELATIVE_POSITION_ID) {
            relativePosition = await readUnsigned(reader, element);
        }

        cursor = element.endOffset;
    }

    if (
        trackNumber === null ||
        clusterPosition === null ||
        !subtitleTrackNumbers.has(trackNumber)
    ) {
        return null;
    }

    return {
        trackNumber,
        clusterOffset: segmentDataOffset + clusterPosition,
        relativePosition,
    };
}

async function extractCuesFromIndexedClusters(
    torrentFile: TorrentFile,
    header: HeaderInfo,
    cueRefs: CueClusterRef[],
    cuesByTrack: Map<number, RawCue[]>
): Promise<void> {
    const tracksByNumber = new Map(header.tracks.map((track) => [track.trackNumber, track]));
    const targetedRefs = cueRefs.filter((ref) => ref.relativePosition !== null);
    const refsToProcess = targetedRefs.length > 0 ? targetedRefs : cueRefs;
    const clusterGroups = groupCueRefsByCluster(refsToProcess);
    const priorityRanges = refsToProcess.flatMap((ref) =>
        ref.relativePosition !== null
            ? [
                  { start: ref.clusterOffset, length: CLUSTER_TIMECODE_SCAN_BYTES },
                  {
                      start: ref.clusterOffset + ref.relativePosition,
                      length: TARGET_BLOCK_SCAN_BYTES,
                  },
              ]
            : [{ start: ref.clusterOffset, length: TARGET_BLOCK_SCAN_BYTES }]
    );
    const coverage = torrentFile.describePieceCoverage(priorityRanges);
    if (coverage) {
        logStream(
            'Subtitle bootstrap piece coverage:',
            `pieces=${coverage.pieceCount}`,
            `estimatedBytes=${Math.round(coverage.estimatedBytes / (1024 * 1024))}MiB`
        );
    }
    const stopPrioritizing = torrentFile.prioritizeRanges(priorityRanges);

    try {
        await runWithConcurrency(clusterGroups, CLUSTER_PARSE_CONCURRENCY, async (group) => {
            const reader = new BufferedTorrentReader(torrentFile);
            const clusterHeader = await readElementHeader(reader, torrentFile, group.clusterOffset);
            if (!clusterHeader || clusterHeader.id !== CLUSTER_ID) return;

            if (group.refs.every((ref) => ref.relativePosition !== null)) {
                await parseCueTargetsInCluster(
                    reader,
                    torrentFile,
                    clusterHeader,
                    group.refs as Array<CueClusterRef & { relativePosition: number }>,
                    header.timecodeScaleNs,
                    tracksByNumber,
                    cuesByTrack
                );
                return;
            }

            await parseCluster(
                reader,
                torrentFile,
                clusterHeader,
                header.timecodeScaleNs,
                tracksByNumber,
                cuesByTrack
            );
        });
    } finally {
        stopPrioritizing();
    }
}

async function parseCueTargetsInCluster(
    reader: BufferedTorrentReader,
    file: TorrentFile,
    cluster: ParsedHeader,
    refs: Array<CueClusterRef & { relativePosition: number }>,
    timecodeScaleNs: number,
    tracksByNumber: Map<number, ParsedSubtitleTrack>,
    cuesByTrack: Map<number, RawCue[]>
): Promise<void> {
    const clusterTimecode = await readClusterTimecode(reader, file, cluster);
    const sortedRefs = [...refs].sort((a, b) => a.relativePosition - b.relativePosition);

    for (const ref of sortedRefs) {
        // CueRelativePosition is relative to the start of the Cluster payload,
        // not the EBML header bytes that precede it.
        const targetOffset = cluster.dataOffset + ref.relativePosition;
        const element = await readElementHeader(reader, file, targetOffset);
        if (!element) continue;

        if (element.id === SIMPLE_BLOCK_ID) {
            await parseBlockPayload(
                reader,
                element,
                clusterTimecode,
                timecodeScaleNs,
                undefined,
                tracksByNumber,
                cuesByTrack
            );
            continue;
        }

        if (element.id === BLOCK_GROUP_ID) {
            await parseBlockGroup(
                reader,
                file,
                element,
                clusterTimecode,
                timecodeScaleNs,
                tracksByNumber,
                cuesByTrack
            );
        }
    }
}

async function readClusterTimecode(
    reader: BufferedTorrentReader,
    file: TorrentFile,
    cluster: ParsedHeader
): Promise<number> {
    let cursor = cluster.dataOffset;
    const scanEnd = Math.min(cluster.endOffset, cluster.dataOffset + CLUSTER_TIMECODE_SCAN_BYTES);

    while (cursor < scanEnd) {
        const element = await readElementHeader(reader, file, cursor);
        if (!element) break;
        if (element.id === CLUSTER_TIMECODE_ID) {
            return readUnsigned(reader, element);
        }
        cursor = element.endOffset;
    }

    return 0;
}

async function scanClustersSequentially(
    reader: BufferedTorrentReader,
    file: TorrentFile,
    header: HeaderInfo,
    cuesByTrack: Map<number, RawCue[]>
): Promise<void> {
    const tracksByNumber = new Map(header.tracks.map((track) => [track.trackNumber, track]));
    let cursor = header.firstClusterOffset;

    while (cursor < header.segmentEnd) {
        const element = await readElementHeader(reader, file, cursor);
        if (!element) break;

        if (element.id === CLUSTER_ID) {
            await parseCluster(
                reader,
                file,
                element,
                header.timecodeScaleNs,
                tracksByNumber,
                cuesByTrack
            );
        }

        cursor = element.endOffset;
    }
}

async function parseCluster(
    reader: BufferedTorrentReader,
    file: TorrentFile,
    cluster: ParsedHeader,
    timecodeScaleNs: number,
    tracksByNumber: Map<number, ParsedSubtitleTrack>,
    cuesByTrack: Map<number, RawCue[]>
): Promise<void> {
    let cursor = cluster.dataOffset;
    let clusterTimecode = 0;

    while (cursor < cluster.endOffset) {
        const element = await readElementHeader(reader, file, cursor);
        if (!element) break;

        if (element.id === CLUSTER_TIMECODE_ID) {
            clusterTimecode = await readUnsigned(reader, element);
        } else if (element.id === SIMPLE_BLOCK_ID) {
            await parseBlockPayload(
                reader,
                element,
                clusterTimecode,
                timecodeScaleNs,
                undefined,
                tracksByNumber,
                cuesByTrack
            );
        } else if (element.id === BLOCK_GROUP_ID) {
            await parseBlockGroup(
                reader,
                file,
                element,
                clusterTimecode,
                timecodeScaleNs,
                tracksByNumber,
                cuesByTrack
            );
        }

        cursor = element.endOffset;
    }
}

async function parseBlockGroup(
    reader: BufferedTorrentReader,
    file: TorrentFile,
    blockGroup: ParsedHeader,
    clusterTimecode: number,
    timecodeScaleNs: number,
    tracksByNumber: Map<number, ParsedSubtitleTrack>,
    cuesByTrack: Map<number, RawCue[]>
): Promise<void> {
    let cursor = blockGroup.dataOffset;
    let block: ParsedHeader | null = null;
    let durationMs: number | undefined;

    while (cursor < blockGroup.endOffset) {
        const element = await readElementHeader(reader, file, cursor);
        if (!element) break;

        if (element.id === BLOCK_ID) {
            block = element;
        } else if (element.id === BLOCK_DURATION_ID) {
            durationMs = scaleToMs(await readUnsigned(reader, element), timecodeScaleNs);
        }

        cursor = element.endOffset;
    }

    if (!block) return;
    await parseBlockPayload(
        reader,
        block,
        clusterTimecode,
        timecodeScaleNs,
        durationMs,
        tracksByNumber,
        cuesByTrack
    );
}

async function parseBlockPayload(
    reader: BufferedTorrentReader,
    block: ParsedHeader,
    clusterTimecode: number,
    timecodeScaleNs: number,
    durationMs: number | undefined,
    tracksByNumber: Map<number, ParsedSubtitleTrack>,
    cuesByTrack: Map<number, RawCue[]>
): Promise<void> {
    const payload = await reader.read(block.dataOffset, block.size);
    if (payload.length < 4) return;

    const trackInfo = parseVint(payload, 0, false);
    if (!trackInfo) return;

    const cues = cuesByTrack.get(trackInfo.value);
    const track = tracksByNumber.get(trackInfo.value);
    if (!cues || !track) return;

    const blockOffset = trackInfo.length;
    if (payload.length < blockOffset + 3) return;

    const relativeTimecode = payload.readInt16BE(blockOffset);
    const flags = payload[blockOffset + 2];
    const lacing = (flags >> 1) & 0x03;
    if (lacing !== 0) return;

    const rawText = payload.subarray(blockOffset + 3).toString('utf-8');
    const text =
        track.codecId === 'S_TEXT/ASS' || track.codecId === 'S_TEXT/SSA'
            ? rawText.replace(/\0+$/g, '').trim()
            : normalizeSubtitleText(rawText);
    if (!text) return;

    const startMs = scaleToMs(clusterTimecode + relativeTimecode, timecodeScaleNs);
    cues.push({ startMs, durationMs, text });
}

function buildTracks(
    tracks: ParsedSubtitleTrack[],
    cuesByTrack: Map<number, RawCue[]>,
    attachments: ParsedAttachment[],
    fontBaseUrl: string
): MatroskaSubtitleTrack[] {
    return tracks.map((track) => ({
        lang: track.lang,
        label: track.label,
        format: track.codecId === 'S_TEXT/ASS' || track.codecId === 'S_TEXT/SSA' ? 'ass' : 'vtt',
        content:
            track.codecId === 'S_TEXT/ASS' || track.codecId === 'S_TEXT/SSA'
                ? cuesToAss(track, cuesByTrack.get(track.trackNumber) ?? [])
                : cuesToVtt(cuesByTrack.get(track.trackNumber) ?? []),
        fonts: resolveTrackFonts(track, attachments, fontBaseUrl),
    }));
}

function hasSubtitleContent(track: MatroskaSubtitleTrack): boolean {
    if (track.format === 'ass') {
        return /\bDialogue:/m.test(track.content);
    }
    return track.content.trim() !== 'WEBVTT';
}

function cuesToVtt(rawCues: RawCue[]): string {
    if (rawCues.length === 0) return 'WEBVTT\n';

    const cues = [...rawCues].sort((a, b) => a.startMs - b.startMs);
    const lines = ['WEBVTT', ''];

    for (let i = 0; i < cues.length; i += 1) {
        const cue = cues[i];
        const nextCue = cues[i + 1];
        const endMs =
            cue.durationMs !== undefined
                ? cue.startMs + cue.durationMs
                : nextCue
                  ? Math.max(cue.startMs + 250, nextCue.startMs)
                  : cue.startMs + DEFAULT_CUE_DURATION_MS;

        lines.push(`${formatVttTime(cue.startMs)} --> ${formatVttTime(endMs)}`);
        lines.push(cue.text);
        lines.push('');
    }

    return lines.join('\n');
}

function normalizeSubtitleText(text: string): string {
    const trimmed = text.replace(/\0+$/g, '').trim();
    if (!trimmed) return '';

    const assPayload = trimmed
        .split(/\r?\n/)
        .map((line) => {
            if (!line.startsWith('Dialogue:')) {
                return cleanAssText(line);
            }

            const body = line.slice('Dialogue:'.length).trimStart();
            const parts = body.split(',');
            return cleanAssText(parts.length > 9 ? parts.slice(9).join(',') : body);
        })
        .filter(Boolean)
        .join('\n');

    return assPayload;
}

function cuesToAss(track: ParsedSubtitleTrack, rawCues: RawCue[]): string {
    const header = parseAssHeader(track.codecPrivate);
    const lines = header.preamble ? [header.preamble, '', '[Events]'] : ['[Events]'];
    lines.push('Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text');

    const cues = [...rawCues].sort((a, b) => a.startMs - b.startMs);
    for (let i = 0; i < cues.length; i += 1) {
        const cue = cues[i];
        const nextCue = cues[i + 1];
        const endMs =
            cue.durationMs !== undefined
                ? cue.startMs + cue.durationMs
                : nextCue
                  ? Math.max(cue.startMs + 250, nextCue.startMs)
                  : cue.startMs + DEFAULT_CUE_DURATION_MS;

        // Matroska ASS packets carry event payload fields without Start/End.
        // The common packet shape is:
        // ReadOrder, Layer, Style, Name, MarginL, MarginR, MarginV, Effect, Text
        const payload = splitWithRest(cue.text, 9);
        const layer = payload[1] ?? '0';
        const style = payload[2] ?? 'Default';
        const name = payload[3] ?? '';
        const marginL = payload[4] ?? '0000';
        const marginR = payload[5] ?? '0000';
        const marginV = payload[6] ?? '0000';
        const effect = payload[7] ?? '';
        const text = payload[8] ?? '';

        lines.push(
            `Dialogue: ${layer},${formatAssTime(cue.startMs)},${formatAssTime(endMs)},${style},${name},${marginL},${marginR},${marginV},${effect},${text}`
        );
    }

    return lines.join('\n');
}

function cleanAssText(text: string): string {
    return text
        .replace(/\{[^}]*\}/g, '')
        .replace(/\\N/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\\h/g, ' ')
        .trim();
}

function formatVttTime(ms: number): string {
    const wholeMs = Math.max(0, Math.round(ms));
    const hours = Math.floor(wholeMs / 3_600_000);
    const minutes = Math.floor((wholeMs % 3_600_000) / 60_000);
    const seconds = Math.floor((wholeMs % 60_000) / 1_000);
    const millis = wholeMs % 1_000;
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${millis.toString().padStart(3, '0')}`;
}

function formatAssTime(ms: number): string {
    const wholeMs = Math.max(0, Math.round(ms));
    const hours = Math.floor(wholeMs / 3_600_000);
    const minutes = Math.floor((wholeMs % 3_600_000) / 60_000);
    const seconds = Math.floor((wholeMs % 60_000) / 1_000);
    const centis = Math.floor((wholeMs % 1_000) / 10);
    return `${hours}:${pad(minutes)}:${pad(seconds)}.${centis.toString().padStart(2, '0')}`;
}

function pad(value: number): string {
    return value.toString().padStart(2, '0');
}

function scaleToMs(value: number, timecodeScaleNs: number): number {
    return (value * timecodeScaleNs) / 1_000_000;
}

function resolveTrackFonts(
    track: ParsedSubtitleTrack,
    attachments: ParsedAttachment[],
    fontBaseUrl: string
): string[] | undefined {
    const indexes =
        track.attachmentLinks.length > 0
            ? attachments
                  .map((attachment, index) =>
                      track.attachmentLinks.includes(attachment.uid) ? index : -1
                  )
                  .filter((index) => index >= 0)
            : attachments.map((_, index) => index);

    if (indexes.length === 0) return undefined;
    return indexes.map((index) => `${fontBaseUrl}/${index}`);
}

function isFontAttachment(name: string, mediaType: string): boolean {
    if (FONT_MEDIA_TYPES.has(mediaType.toLowerCase())) return true;
    return /\.(ttf|otf|ttc|woff|woff2)$/i.test(name);
}

function splitWithRest(value: string, count: number): string[] {
    const result: string[] = [];
    let remaining = value;

    for (let i = 0; i < count - 1; i += 1) {
        const index = remaining.indexOf(',');
        if (index === -1) {
            result.push(remaining);
            while (result.length < count) result.push('');
            return result;
        }

        result.push(remaining.slice(0, index));
        remaining = remaining.slice(index + 1);
    }

    result.push(remaining);
    return result;
}

function dedupeCueRefs(cueRefs: CueClusterRef[]): CueClusterRef[] {
    const seen = new Set<string>();
    const deduped: CueClusterRef[] = [];

    for (const ref of cueRefs) {
        const key = `${ref.trackNumber}:${ref.clusterOffset}:${ref.relativePosition ?? 'cluster'}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(ref);
    }

    return deduped.sort((a, b) => {
        if (a.clusterOffset !== b.clusterOffset) return a.clusterOffset - b.clusterOffset;
        return (a.relativePosition ?? -1) - (b.relativePosition ?? -1);
    });
}

function groupCueRefsByCluster(cueRefs: CueClusterRef[]): ClusterCueGroup[] {
    const groups = new Map<number, CueClusterRef[]>();

    for (const ref of cueRefs) {
        const group = groups.get(ref.clusterOffset);
        if (group) {
            group.push(ref);
        } else {
            groups.set(ref.clusterOffset, [ref]);
        }
    }

    return [...groups.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([clusterOffset, refs]) => ({ clusterOffset, refs }));
}

function parseAssHeader(codecPrivate: string): AssHeader {
    const normalized = codecPrivate.replace(/\r\n/g, '\n').trim();
    if (!normalized) {
        return { preamble: '' };
    }

    const eventsIndex = normalized.search(/^\[Events\]$/im);
    if (eventsIndex === -1) {
        return { preamble: normalized };
    }

    const preamble = normalized.slice(0, eventsIndex).trim();
    return { preamble };
}

function logTrackSummary(tracks: MatroskaSubtitleTrack[]) {
    tracks.forEach((track) => {
        const dialogueCount =
            track.format === 'ass'
                ? (track.content.match(/^Dialogue:/gm) ?? []).length
                : (track.content.match(/--> /g) ?? []).length;
        logStream(
            `Track ready: ${track.label}(${track.lang})`,
            `format=${track.format}`,
            `cues=${dialogueCount}`,
            `fonts=${track.fonts?.length ?? 0}`
        );
    });
}

function logStream(...args: unknown[]) {
    console.log(`[stream ${new Date().toISOString()}]`, ...args);
}

async function runWithConcurrency<T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>
): Promise<void> {
    let nextIndex = 0;

    const runners = Array.from(
        { length: Math.max(1, Math.min(concurrency, items.length)) },
        async () => {
            while (nextIndex < items.length) {
                const current = nextIndex;
                nextIndex += 1;
                await worker(items[current]);
            }
        }
    );

    await Promise.all(runners);
}

async function readElementHeader(
    reader: BufferedTorrentReader,
    file: TorrentFile,
    offset: number
): Promise<ParsedHeader | null> {
    if (offset >= file.length) return null;

    const head = await reader.read(offset, 16);
    if (head.length < 2) return null;

    const id = parseVint(head, 0, true);
    if (!id) return null;
    const size = parseVint(head, id.length, false);
    if (!size) return null;

    const headerSize = id.length + size.length;
    const dataOffset = offset + headerSize;
    const dataSize = size.unknown ? file.length - dataOffset : size.value;
    const endOffset = Math.min(file.length, dataOffset + dataSize);

    return {
        id: id.value,
        size: dataSize,
        headerSize,
        dataOffset,
        endOffset,
    };
}

async function readUnsigned(reader: BufferedTorrentReader, element: ParsedHeader): Promise<number> {
    const data = await reader.read(element.dataOffset, element.size);
    let value = 0;
    for (const byte of data) {
        value = value * 256 + byte;
    }
    return value;
}

async function readString(reader: BufferedTorrentReader, element: ParsedHeader): Promise<string> {
    return (await reader.read(element.dataOffset, element.size))
        .toString('utf-8')
        .replace(/\0+$/g, '')
        .trim();
}

function parseVint(
    data: Buffer,
    offset: number,
    preserveMarkerBits: boolean
): { value: number; length: number; unknown: boolean } | null {
    if (offset >= data.length) return null;

    const first = data[offset];
    if (first === 0) return null;

    let mask = 0x80;
    let length = 1;
    while (length <= 8 && (first & mask) === 0) {
        mask >>= 1;
        length += 1;
    }

    if (length > 8 || offset + length > data.length) return null;

    let value = preserveMarkerBits ? first : first & (mask - 1);
    let unknown = !preserveMarkerBits && value === mask - 1;

    for (let i = 1; i < length; i += 1) {
        const byte = data[offset + i];
        value = value * 256 + byte;
        if (!preserveMarkerBits) {
            unknown = unknown && byte === 0xff;
        }
    }

    return { value, length, unknown };
}
