import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import type { AppSettings, VoiceEvent } from '../../shared/types';
import { cartesiaVersion } from '../ai/discovery';
import { SpeechChunker } from './speechChunker';
export const ttsConfig = { model: 'sonic-3.5', sampleRate: 44100, idleMs: 300000 } as const;
interface Job { id: number; contextId: string; cancelled: boolean; finished: boolean; queue: Promise<void>; chunker: SpeechChunker;
  timer?: ReturnType<typeof setTimeout>; settings: AppSettings; sent: boolean }
type SocketFactory = (key: string) => WebSocket;
export class TTSService {
  private socket?: WebSocket;
  private connecting?: Promise<WebSocket>;
  private idle?: ReturnType<typeof setTimeout>;
  private job?: Job;
  private generation = 0;
  constructor(private getKey: () => string | undefined, private emit: (event: VoiceEvent) => void,
    private createSocket: SocketFactory = key => new WebSocket('wss://api.cartesia.ai/tts/websocket', {
      headers: { Authorization: `Bearer ${key}`, 'Cartesia-Version': cartesiaVersion }, handshakeTimeout: 10000,
    })) {}
  private async connect(): Promise<WebSocket> {
    clearTimeout(this.idle);
    if (this.socket?.readyState === WebSocket.OPEN) return this.socket;
    if (this.connecting) return this.connecting;
    const generation = this.generation;
    this.connecting = (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt) await new Promise(resolve => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
        if (generation !== this.generation) throw new Error('Connection cancelled');
        const key = this.getKey(); if (!key) throw new Error('Missing Cartesia key');
        const socket = this.createSocket(key); this.socket = socket;
        socket.on('message', bytes => {
          if (socket !== this.socket) return;
          try { this.receive(JSON.parse(bytes.toString())); } catch { if (this.job) this.fail(this.job); }
        });
        socket.on('error', () => { if (socket === this.socket && socket.readyState !== WebSocket.CONNECTING && this.job?.sent) this.fail(this.job); });
        socket.on('close', () => { if (socket === this.socket && this.job?.sent && !this.job.finished) this.fail(this.job); });
        try {
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => { socket.terminate(); reject(new Error('Voice connection timed out')); }, 10000);
            const cleanup = () => { clearTimeout(timer); socket.off('error', error); socket.off('close', closed); socket.off('open', opened); };
            const opened = () => { cleanup(); resolve(); };
            const error = () => { cleanup(); reject(new Error('Voice connection unavailable')); };
            const closed = () => { cleanup(); reject(new Error('Voice connection closed')); };
            socket.once('open', opened); socket.once('error', error); socket.once('close', closed);
          });
          if (generation !== this.generation) { socket.close(); throw new Error('Connection cancelled'); }
          return socket;
        } catch { socket.terminate(); if (attempt === 2) throw new Error('Voice connection unavailable'); }
      }
      throw new Error('Voice connection unavailable');
    })().finally(() => { if (generation === this.generation) this.connecting = undefined; });
    return this.connecting;
  }
  start(id: number, settings: AppSettings) {
    this.cancel(); clearTimeout(this.idle);
    const job: Job = { id, contextId: randomUUID(), cancelled: false, finished: false, sent: false, settings: { ...settings },
      queue: Promise.resolve(), chunker: new SpeechChunker(text => this.enqueue(job, text, true)) };
    this.job = job; this.emit({ type: 'tts:start', id });
    job.timer = setTimeout(() => this.fail(job), 90000);
    job.queue = this.connect().then((): void => undefined).catch(() => this.fail(job));
  }
  private enqueue(job: Job, transcript: string, more: boolean) {
    job.queue = job.queue.then(() => {
      if (job.cancelled || job.finished) return;
      if (this.socket?.readyState !== WebSocket.OPEN) { this.fail(job); return; }
      job.sent = true;
      this.socket.send(JSON.stringify({ context_id: job.contextId, model_id: ttsConfig.model, transcript, continue: more,
        voice: { mode: 'id', id: job.settings.voiceId }, generation_config: { speed: job.settings.speed }, language: 'en', add_timestamps: true,
        output_format: { container: 'raw', encoding: 'pcm_f32le', sample_rate: ttsConfig.sampleRate }, max_buffer_delay_ms: 0 }),
      error => { if (error) this.fail(job); });
    }).catch(() => this.fail(job));
  }
  push(id: number, text: string) { if (this.job?.id === id && !this.job.cancelled) this.job.chunker.push(text); }
  finish(id: number) {
    const job = this.job; if (!job || job.id !== id || job.cancelled) return;
    job.chunker.finish(); this.enqueue(job, '', false);
  }
  private receive(event: { type: string; context_id: string; data?: string; word_timestamps?: VoiceEvent['timestamps'] }) {
    const job = this.job; if (!job || job.cancelled || job.finished || event.context_id !== job.contextId) return;
    if (event.type === 'chunk' && typeof event.data === 'string') {
      const bytes = Buffer.from(event.data, 'base64');
      if (!bytes.byteLength || bytes.byteLength % 4) { this.fail(job); return; }
      this.emit({ type: 'tts:chunk', id: job.id, audio: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer });
    } else if (event.type === 'timestamps' && event.word_timestamps) {
      const t = event.word_timestamps;
      if (Array.isArray(t.words) && Array.isArray(t.start) && Array.isArray(t.end) && t.words.length === t.start.length
        && t.words.every(w => typeof w === 'string') && t.start.every(n => Number.isFinite(n) && n >= 0))
        this.emit({ type: 'tts:timestamps', id: job.id, timestamps: t });
    } else if (event.type === 'error') this.fail(job);
    else if (event.type === 'done') { job.finished = true; clearTimeout(job.timer); this.emit({ type: 'tts:done', id: job.id }); this.armIdle(); }
  }
  private fail(job: Job) {
    if (job.cancelled || job.finished || this.job !== job) return;
    this.emit({ type: 'tts:error', id: job.id, text: 'Voice is unavailable. Showing the reply as text.' }); this.cancel();
  }
  cancel() {
    const job = this.job;
    if (job && !job.cancelled) {
      job.cancelled = true; clearTimeout(job.timer);
      // Never reconnect just to cancel; no audio from an old context is replayed.
      if (job.sent && !job.finished && this.socket?.readyState === WebSocket.OPEN)
        this.socket.send(JSON.stringify({ context_id: job.contextId, cancel: true }), (): void => undefined);
      this.emit({ type: 'tts:stop', id: job.id });
    }
    this.job = undefined; this.armIdle();
  }
  private armIdle() { clearTimeout(this.idle); this.idle = setTimeout(() => this.close(), ttsConfig.idleMs); }
  close() { this.cancel(); clearTimeout(this.idle); this.generation++; this.socket?.terminate(); this.socket = undefined; this.connecting = undefined; }
}
