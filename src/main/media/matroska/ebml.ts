export type Vint = { value: number; length: number };
export type Header = { id: number; size: number; length: number };

export const UNKNOWN_SIZE = -1;

const decoder = new TextDecoder();

function vintLength(first: number, max: number): number {
    const length = Math.clz32(first) - 23;
    return length >= 1 && length <= max ? length : 0;
}

// undefined: needs more bytes, null: not a valid vint
export function readVint(buf: Uint8Array, pos: number): Vint | null | undefined {
    if (pos >= buf.length) return undefined;
    const length = vintLength(buf[pos], 8);
    if (!length) return null;
    if (pos + length > buf.length) return undefined;
    const mask = 0xff >> length;
    let value = buf[pos] & mask;
    let unknown = value === mask;
    for (let i = 1; i < length; i++) {
        value = value * 256 + buf[pos + i];
        unknown &&= buf[pos + i] === 0xff;
    }
    return { value: unknown ? UNKNOWN_SIZE : value, length };
}

export function readHeader(buf: Uint8Array, pos: number): Header | null | undefined {
    if (pos >= buf.length) return undefined;
    const idLength = vintLength(buf[pos], 4);
    if (!idLength) return null;
    const size = readVint(buf, pos + idLength);
    if (!size) return size;
    let id = 0;
    for (let i = 0; i < idLength; i++) id = id * 256 + buf[pos + i];
    return { id, size: size.value, length: idLength + size.length };
}

export function* children(
    data: Uint8Array | undefined
): Generator<{ id: number; data: Uint8Array }> {
    let pos = 0;
    while (data && pos < data.length) {
        const header = readHeader(data, pos);
        if (!header) return;
        const start = pos + header.length;
        const end = header.size === UNKNOWN_SIZE ? data.length : start + header.size;
        yield { id: header.id, data: data.subarray(start, end) };
        pos = end;
    }
}

export function child(data: Uint8Array | undefined, id: number): Uint8Array | undefined {
    for (const element of children(data)) if (element.id === id) return element.data;
    return undefined;
}

export function uint(data: Uint8Array | undefined): number | undefined {
    if (!data) return undefined;
    let value = 0;
    for (const byte of data) value = value * 256 + byte;
    return value;
}

export function text(data: Uint8Array | undefined): string | undefined {
    return data && decoder.decode(data).replace(/\0+$/, '');
}
