import net from 'node:net';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AppSettings, PresenceState } from '../shared/ipc/api';
import { createLogger } from './logger';
import { t } from './i18n';

const log = createLogger('discord');

const CLIENT_ID = '1563895188709965980';
const OP_HANDSHAKE = 0;
const OP_FRAME = 1;
const OP_CLOSE = 2;
const OP_PING = 3;
const OP_PONG = 4;

// Discord allows 5 activity updates per 20 seconds
const MIN_INTERVAL_MS = 4000;
// Lets a burst like seeking (pause, seek, play) settle into one update
const SETTLE_MS = 1000;
const RETRY_MS = [5000, 10_000, 20_000, 30_000];

let enabled = false;
let showDetails = true;
let socket: net.Socket | null = null;
let ready = false;
let retries = 0;
let retryTimer: NodeJS.Timeout | undefined;
let flushTimer: NodeJS.Timeout | undefined;
let presence: { state: PresenceState; receivedAt: number } | null = null;
let lastSent: string | null = null;
let lastSentAt = 0;

function socketPaths(): string[] {
    const names = Array.from({ length: 10 }, (_, i) => `discord-ipc-${i}`);
    if (process.platform === 'win32') return names.map((name) => `\\\\?\\pipe\\${name}`);
    const base = process.env.XDG_RUNTIME_DIR ?? process.env.TMPDIR ?? '/tmp';
    // Flatpak and Snap builds of Discord put the socket in their own folder
    const dirs = [
        base,
        path.join(base, 'app/com.discordapp.Discord'),
        path.join(base, 'snap.discord'),
    ];
    return dirs.flatMap((dir) => names.map((name) => path.join(dir, name)));
}

function encode(op: number, payload: unknown): Buffer {
    const body = Buffer.from(JSON.stringify(payload));
    const header = Buffer.alloc(8);
    header.writeInt32LE(op, 0);
    header.writeInt32LE(body.length, 4);
    return Buffer.concat([header, body]);
}

function connect(paths = socketPaths()) {
    const [next, ...rest] = paths;
    if (!next) return scheduleRetry();
    const sock = net.createConnection(next);
    sock.once('error', () => {
        sock.destroy();
        if (enabled) connect(rest);
    });
    sock.once('connect', () => {
        sock.removeAllListeners('error');
        if (!enabled || socket) return void sock.destroy();
        attach(sock);
    });
}

function scheduleRetry() {
    if (!enabled || retryTimer) return;
    const delay = RETRY_MS[Math.min(retries++, RETRY_MS.length - 1)];
    retryTimer = setTimeout(() => {
        retryTimer = undefined;
        connect();
    }, delay);
}

function attach(sock: net.Socket) {
    socket = sock;
    let buffer = Buffer.alloc(0);

    sock.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        while (buffer.length >= 8) {
            const length = buffer.readInt32LE(4);
            if (buffer.length < 8 + length) break;
            const op = buffer.readInt32LE(0);
            const body = buffer.subarray(8, 8 + length);
            buffer = buffer.subarray(8 + length);
            try {
                onMessage(sock, op, body);
            } catch (err) {
                log.warn('Unreadable message from Discord:', err);
            }
        }
    });
    sock.on('error', (err) => log.debug('Socket error:', err.message));
    sock.on('close', () => {
        if (socket !== sock) return;
        socket = null;
        ready = false;
        log.debug('Disconnected');
        scheduleRetry();
    });

    sock.write(encode(OP_HANDSHAKE, { v: 1, client_id: CLIENT_ID }));
}

function onMessage(sock: net.Socket, op: number, body: Buffer) {
    if (op === OP_PING) return void sock.write(encode(OP_PONG, JSON.parse(body.toString())));
    if (op === OP_CLOSE) {
        log.warn('Discord closed the connection:', body.toString());
        return void sock.end();
    }
    if (op !== OP_FRAME) return;
    const message = JSON.parse(body.toString());
    if (message.evt === 'READY') {
        log.info(`Connected as ${message.data?.user?.username ?? 'unknown user'}`);
        ready = true;
        retries = 0;
        lastSent = null;
        schedule();
    } else if (message.evt === 'ERROR') {
        log.warn('Discord rejected the update:', message.data?.message);
    }
}

function disconnect() {
    clearTimeout(retryTimer);
    clearTimeout(flushTimer);
    retryTimer = flushTimer = undefined;
    socket?.destroy();
    socket = null;
    ready = false;
}

const clip = (text: string, max = 128) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function toActivity(state: PresenceState, receivedAt: number) {
    const timestamps =
        state.status === 'playing'
            ? {
                  start: Math.round(receivedAt - state.position * 1000),
                  end: Math.round(receivedAt + (state.duration - state.position) * 1000),
              }
            : undefined;

    if (!showDetails || state.isAdult) {
        return {
            type: 3,
            details: t('discord.watching'),
            state: state.status === 'paused' ? t('discord.paused') : undefined,
            timestamps,
            assets: { large_image: 'logo', large_text: 'akko' },
        };
    }

    const url = `https://anilist.co/anime/${state.anilistId}`;
    const episode = state.episodeCount
        ? t('discord.episodeOf', { episode: state.episode, count: state.episodeCount })
        : t('discord.episode', { episode: state.episode });
    return {
        type: 3,
        // Shows "Watching <title>" in the member list instead of the app name
        status_display_type: 2,
        details: clip(state.title),
        details_url: url,
        state: state.status === 'paused' ? t('discord.episodePaused', { episode }) : episode,
        timestamps,
        assets: {
            large_image: state.cover ?? 'logo',
            large_text: clip(state.episodeTitle || state.title),
            large_url: url,
            small_image: 'logo',
            small_text: 'akko',
        },
        buttons: [{ label: t('discord.viewOnAnilist'), url }],
    };
}

function schedule() {
    if (!ready || flushTimer) return;
    const wait = Math.max(SETTLE_MS, lastSentAt + MIN_INTERVAL_MS - Date.now());
    flushTimer = setTimeout(flush, wait);
}

function flush() {
    flushTimer = undefined;
    if (!ready || !socket) return;
    const activity = presence ? toActivity(presence.state, presence.receivedAt) : undefined;
    const payload = JSON.stringify(activity ?? null);
    if (payload === lastSent) return;
    lastSent = payload;
    lastSentAt = Date.now();
    log.debug('Setting activity:', payload);
    socket.write(
        encode(OP_FRAME, {
            cmd: 'SET_ACTIVITY',
            // Lets Discord clear the activity itself if the app quits without saying so
            args: { pid: process.pid, activity },
            nonce: randomUUID(),
        })
    );
}

export function setPresence(state: PresenceState | null) {
    presence = state && { state, receivedAt: Date.now() };
    schedule();
}

export function applyDiscordSettings(settings: AppSettings) {
    const detailsChanged = showDetails !== settings.discordShowDetails;
    showDetails = settings.discordShowDetails;
    if (settings.discordPresence === enabled) {
        if (detailsChanged) schedule();
        return;
    }
    enabled = settings.discordPresence;
    if (enabled) {
        retries = 0;
        connect();
    } else {
        disconnect();
    }
}
