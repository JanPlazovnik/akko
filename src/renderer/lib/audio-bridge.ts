import { ALL_FORMATS, AudioBufferSink, Input, UrlSource } from 'mediabunny';
import { registerAc3Decoder } from '@mediabunny/ac3';
import { createLogger } from './logger';

// Plays audio the <video> element can't decode (AC-3/E-AC-3) through Web Audio, following the video's clock

const log = createLogger('audio-bridge');

const BUFFER_AHEAD = 2;
const START_DELAY = 0.02;
const MAX_DRIFT = 0.1;
// Video time played without any audio before giving up; a slow download stalls the video too
const SILENCE_LIMIT = 30;

registerAc3Decoder();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class AudioBridge {
    private readonly ctx = new AudioContext({ latencyHint: 'playback' });
    private readonly gain = this.ctx.createGain();
    private readonly input: Input;
    private readonly events = new AbortController();
    private readonly nodes = new Set<AudioBufferSourceNode>();
    private sink: AudioBufferSink | null = null;
    private run = 0;
    private running = false;
    private anchor = { ctx: 0, media: 0, rate: 1 };
    private heard = false;
    private silentFor = 0;
    private lastTime = 0;

    constructor(
        private readonly video: HTMLVideoElement,
        url: string,
        private readonly onFailure: () => void
    ) {
        // Without no-store, Chromium's cache lock queues these behind the <video> element's request
        const source = new UrlSource(url, { requestInit: { cache: 'no-store' } });
        this.input = new Input({ source, formats: ALL_FORMATS });
        this.gain.connect(this.ctx.destination);
        this.syncVolume();
        void this.ctx.suspend();

        const on = (type: string, handler: () => void) =>
            video.addEventListener(type, handler, { signal: this.events.signal });
        on('playing', () => this.resume());
        on('pause', () => void this.ctx.suspend());
        on('waiting', () => void this.ctx.suspend());
        on('seeking', () => this.stop());
        on('seeked', () => this.resume());
        on('ratechange', () => this.restart());
        on('ended', () => this.stop());
        on('volumechange', () => this.syncVolume());
        on('timeupdate', () => {
            this.checkDrift();
            this.checkSilence();
        });

        void this.open();
    }

    private async open() {
        try {
            const track = await this.input.getPrimaryAudioTrack({
                filter: (t) => t.canDecode(),
            });
            if (this.events.signal.aborted) return;
            if (!track) return this.fail('No decodable audio track');
            log.info(`Decoding ${track.codec} audio, ${track.numberOfChannels} channels`);
            this.sink = new AudioBufferSink(track);
            if (!this.video.paused && !this.video.seeking) this.restart();
        } catch (err) {
            if (!this.events.signal.aborted) this.fail('Failed to open audio', err);
        }
    }

    private get latency() {
        return this.ctx.baseLatency + (this.ctx.outputLatency || 0);
    }

    private mediaTime() {
        return this.anchor.media + (this.ctx.currentTime - this.anchor.ctx) * this.anchor.rate;
    }

    private resume() {
        if (!this.running) this.restart();
        else void this.ctx.resume().then(() => this.checkDrift());
    }

    private stop() {
        this.run++;
        this.running = false;
        this.nodes.forEach((node) => node.stop());
        this.nodes.clear();
        void this.ctx.suspend();
    }

    private restart() {
        this.stop();
        const { sink, run } = this;
        if (!sink || this.video.paused || this.video.seeking) return;
        this.running = true;
        void this.ctx.resume().then(() => {
            if (run === this.run) void this.play(sink, run);
        });
    }

    private async play(sink: AudioBufferSink, run: number) {
        const start = this.video.currentTime;
        this.anchor = { ctx: this.ctx.currentTime, media: start, rate: this.video.playbackRate };

        try {
            for await (const { buffer, timestamp } of sink.buffers(start)) {
                if (run !== this.run) return;
                this.schedule(buffer, timestamp);
                while (timestamp - this.mediaTime() > BUFFER_AHEAD) {
                    await sleep(250);
                    if (run !== this.run) return;
                }
            }
        } catch (err) {
            if (run === this.run) log.error('Audio decoding failed', err);
        }
    }

    private schedule(buffer: AudioBuffer, timestamp: number) {
        const { ctx, media, rate } = this.anchor;
        const when = ctx + (timestamp - media) / rate - this.latency;
        const earliest = this.ctx.currentTime + START_DELAY;
        const offset = Math.max(0, (earliest - when) * rate);
        if (offset >= buffer.duration) return;

        const node = this.ctx.createBufferSource();
        node.buffer = buffer;
        node.playbackRate.value = rate;
        node.connect(this.gain);
        node.onended = () => this.nodes.delete(node);
        node.start(Math.max(when, earliest), offset);
        this.nodes.add(node);
        this.heard = true;
    }

    private checkDrift() {
        if (!this.running || this.ctx.state !== 'running' || this.video.paused) return;
        const drift = this.video.currentTime - this.mediaTime();
        if (Math.abs(drift) <= MAX_DRIFT) return;
        log.info(`Resyncing, drift ${Math.round(drift * 1000)} ms`);
        this.restart();
    }

    private checkSilence() {
        const step = this.video.currentTime - this.lastTime;
        this.lastTime = this.video.currentTime;
        if (this.heard || this.video.paused || step <= 0 || step > 1) return;
        this.silentFor += step;
        if (this.silentFor >= SILENCE_LIMIT)
            this.fail(`No audio after ${SILENCE_LIMIT} s of video`);
    }

    private fail(reason: string, err?: unknown) {
        log.warn(reason, ...(err ? [err] : []));
        this.dispose();
        this.onFailure();
    }

    private syncVolume() {
        this.gain.gain.value = this.video.muted ? 0 : this.video.volume;
    }

    dispose() {
        if (this.events.signal.aborted) return;
        this.events.abort();
        this.stop();
        this.input.dispose();
        void this.ctx.close();
    }
}
