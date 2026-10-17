declare module 'matroska-metadata' {
    import { EventEmitter } from 'events';

    export type MatroskaSubtitle = {
        text: string;
        time: number;
        duration: number;
        readOrder?: string;
        layer?: string;
        style?: string;
        name?: string;
        marginL?: string;
        marginR?: string;
        marginV?: string;
        effect?: string;
    };

    export type MatroskaTrack = {
        number: string;
        language?: string;
        type: string;
        name?: string;
        header?: string;
    };

    export type MatroskaAttachment = {
        filename: string;
        mimetype: string;
        data: Uint8Array;
    };

    export type EbmlTag = {
        id: number;
        data?: unknown;
        Children?: EbmlTag[];
    };

    export default class Metadata extends EventEmitter {
        constructor(file: any);
        getTracks(): Promise<MatroskaTrack[]>;
        getAttachments(): Promise<MatroskaAttachment[]>;
        readSeekHeadTag(tag: string): Promise<EbmlTag | null>;
        parseStream(stream: AsyncIterable<Uint8Array>, stable?: boolean): AsyncIterable<Uint8Array>;
        destroy(): void;
    }
}
