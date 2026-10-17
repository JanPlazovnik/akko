import type { MatroskaSubtitle } from 'matroska-metadata';
import type { SubtitleEvent } from '../../shared/subtitles';

type Cue = Pick<MatroskaSubtitle, 'time' | 'duration' | 'text'>;

const EVENTS = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

export const PLAIN_HEADER = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,64,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,3,1,2,80,80,50,1

${EVENTS}`;

const TIMING =
    /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})/;

const TAGS: Record<string, string> = {
    '<i>': '{\\i1}',
    '</i>': '{\\i0}',
    '<b>': '{\\b1}',
    '</b>': '{\\b0}',
    '<u>': '{\\u1}',
    '</u>': '{\\u0}',
};

const ENTITIES: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&nbsp;': '\\h',
};

export function assHeader(codecPrivate?: string): string {
    const header = codecPrivate?.replace(/\r\n/g, '\n').trim();
    if (!header) return PLAIN_HEADER;
    const events = header.search(/\[Events\]/i);
    return `${(events >= 0 ? header.slice(0, events) : header).trimEnd()}\n\n${EVENTS}`;
}

function event(cue: Cue, fields: Partial<MatroskaSubtitle>, text: string): SubtitleEvent {
    return {
        start: cue.time,
        duration: cue.duration,
        layer: Number(fields.layer) || 0,
        style: fields.style || 'Default',
        name: fields.name || '',
        marginL: Number(fields.marginL) || 0,
        marginR: Number(fields.marginR) || 0,
        marginV: Number(fields.marginV) || 0,
        effect: fields.effect || '',
        text,
    };
}

export function assEvent(sub: MatroskaSubtitle): SubtitleEvent {
    return event(sub, sub, sub.text);
}

export function plainEvent(cue: Cue): SubtitleEvent {
    const text = cue.text
        .trim()
        .replace(/\r?\n/g, '\\N')
        .replace(/<\/?[ibu]>/gi, (tag) => TAGS[tag.toLowerCase()])
        .replace(/<[^>]*>/g, '')
        .replace(/&(amp|lt|gt|nbsp);/g, (entity) => ENTITIES[entity]);
    return event(cue, {}, text);
}

function toMs(match: RegExpMatchArray, offset: number): number {
    const [h, m, s, ms] = match.slice(offset, offset + 4).map((v) => Number(v ?? 0));
    return ((h * 60 + m) * 60 + s) * 1000 + ms;
}

export function parseTextSubtitles(content: string): Cue[] {
    return content
        .replace(/^\uFEFF/, '')
        .replace(/\r/g, '')
        .split(/\n{2,}/)
        .flatMap((block) => {
            const lines = block.split('\n');
            const timing = lines.findIndex((line) => TIMING.test(line));
            const match = lines[timing]?.match(TIMING);
            if (!match) return [];
            const time = toMs(match, 1);
            return [
                {
                    time,
                    duration: toMs(match, 5) - time,
                    text: lines.slice(timing + 1).join('\n'),
                },
            ];
        });
}
