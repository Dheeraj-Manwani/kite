import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import type { ScreenBounds } from '../../shared/types';
import type { UiElement } from './grounding';
import { uiaScript } from './uiaScript';
export class SidecarError extends Error { constructor(readonly code: string) { super(code); } }
const aborted = () => new DOMException('Aborted', 'AbortError');
interface Pending { resolve(value: unknown): void; reject(error: unknown): void; timer: ReturnType<typeof setTimeout>; cleanup(): void }
/** Correlates newline-delimited JSON requests and replies by id. */
export class LineClient {
  private pending = new Map<number, Pending>();
  private sequence = 0;
  private closed = false;
  constructor(private input: Writable, output: Readable, private timedOut: () => void = () => undefined) {
    readline.createInterface({ input: output }).on('line', line => this.receive(line));
  }
  private receive(line: string) {
    let message: { id?: unknown; ok?: unknown; error?: unknown };
    try { message = JSON.parse(line); } catch { return; }
    const entry = typeof message?.id === 'number' ? this.pending.get(message.id) : undefined;
    if (!entry) return;
    this.pending.delete(message.id as number); clearTimeout(entry.timer); entry.cleanup();
    if (message.ok === true) entry.resolve(message);
    else entry.reject(new SidecarError(typeof message.error === 'string' && /^E[A-Z]{2,20}$/.test(message.error) ? message.error : 'EUIA'));
  }
  request<T>(payload: Record<string, unknown>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
    if (this.closed) return Promise.reject(new SidecarError('ECLOSED'));
    if (signal?.aborted) return Promise.reject(aborted());
    return new Promise<T>((resolve, reject) => {
      const id = ++this.sequence;
      const abort = () => { if (this.pending.delete(id)) { clearTimeout(timer); reject(aborted()); } };
      const timer = setTimeout(() => {
        if (!this.pending.delete(id)) return;
        signal?.removeEventListener('abort', abort); reject(new SidecarError('ETIMEOUT')); this.timedOut();
      }, timeoutMs);
      this.pending.set(id, { resolve: value => resolve(value as T), reject, timer, cleanup: () => signal?.removeEventListener('abort', abort) });
      signal?.addEventListener('abort', abort, { once: true });
      this.input.write(JSON.stringify({ ...payload, id }) + '\n');
    });
  }
  close(code = 'ECLOSED') {
    this.closed = true;
    for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.cleanup(); entry.reject(new SidecarError(code)); }
    this.pending.clear();
  }
}
export interface UiaWindow { title: string; process: string; pid: number; rect: ScreenBounds }
export interface UiaSnapshot { window: UiaWindow; elements: UiElement[]; ms: number }
type Box = [number, number, number, number];
interface RawSnapshot { window: Omit<UiaWindow, 'rect'> & { rect: Box }; elements: (Omit<UiElement, 'rect'> & { rect: Box })[]; ms: number }
export interface UiaOptions {
  directory: string; excludePid: number;
  /** Converts the sidecar's physical coordinates for the reported DPI awareness. */
  toDip(rect: ScreenBounds, awareness: string): ScreenBounds;
  spawn?: typeof spawn; idleMs?: number; timeoutMs?: number; startMs?: number;
  log?(event: string, data?: Record<string, unknown>): void;
}
const bounds = ([x, y, width, height]: Box): ScreenBounds => ({ x, y, width, height });
/** Lazily started, restartable UI Automation reader. Windows only; elsewhere every snapshot is null. */
export class UiaClient {
  private child?: ChildProcess;
  private client?: LineClient;
  private starting?: Promise<LineClient>;
  private awareness = 'unaware';
  private failures = 0;
  private idle?: ReturnType<typeof setTimeout>;
  /** Code of the last failed snapshot (e.g. EKITE when Kite itself is in front), cleared on success. */
  lastError?: string;
  constructor(private options: UiaOptions) {}
  get supported() { return process.platform === 'win32' && this.failures < 3; }
  private async start(): Promise<LineClient> {
    const file = path.join(this.options.directory, `uia-${createHash('sha256').update(uiaScript).digest('hex').slice(0, 12)}.ps1`);
    await mkdir(this.options.directory, { recursive: true });
    await writeFile(file, uiaScript, 'utf8');
    const executable = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const child = (this.options.spawn ?? spawn)(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file],
      { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.child = child;
    // stderr can contain local paths; drain it without logging.
    child.stderr?.resume();
    const client = new LineClient(child.stdin, child.stdout, () => this.stop('ETIMEOUT'));
    child.once('error', () => { client.close('ESPAWN'); if (this.child === child) this.reset(); });
    child.once('exit', () => { client.close('EEXIT'); if (this.child === child) this.reset(); });
    child.stdin.on('error', () => client.close('EEXIT'));
    const ping = await client.request<{ awareness?: string }>({ op: 'ping' }, this.options.startMs ?? 20000);
    this.awareness = typeof ping.awareness === 'string' ? ping.awareness : 'unaware';
    return client;
  }
  private reset() { this.child = undefined; this.client = undefined; this.starting = undefined; }
  private async ready(): Promise<LineClient> {
    if (this.client) return this.client;
    this.starting ??= this.start().then(client => { this.client = client; this.failures = 0; this.options.log?.('guide:sidecar', { ok: true }); return client; },
      error => { this.failures++; this.options.log?.('guide:sidecar', { ok: false, code: error instanceof SidecarError ? error.code : 'ESPAWN' }); this.stop(); throw error; });
    return this.starting;
  }
  /** Interactive controls of the foreground window (or a specific top-level window) and its popups, in DIP. */
  async snapshot(signal?: AbortSignal, hwnd?: number): Promise<UiaSnapshot | null> {
    if (!this.supported) return null;
    clearTimeout(this.idle);
    try {
      const client = await this.ready(); signal?.throwIfAborted();
      const raw = await client.request<RawSnapshot>({ op: 'snapshot', excludePid: this.options.excludePid, limit: 800, ...(hwnd ? { hwnd } : {}) }, this.options.timeoutMs ?? 6000, signal);
      const toDip = (box: Box) => this.options.toDip(bounds(box), this.awareness);
      this.lastError = undefined;
      return { window: { ...raw.window, rect: toDip(raw.window.rect) }, ms: raw.ms,
        elements: raw.elements.map(e => ({ ...e, name: e.name ?? '', automationId: e.automationId ?? '', help: e.help ?? '', rect: toDip(e.rect) })) };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      this.lastError = error instanceof SidecarError ? error.code : 'EUIA';
      return null;
    } finally {
      // Overlapping snapshots must not orphan an older idle timer.
      clearTimeout(this.idle);
      if (this.child) this.idle = setTimeout(() => this.stop(), this.options.idleMs ?? 120_000);
    }
  }
  stop(code = 'ECLOSED') {
    clearTimeout(this.idle);
    const child = this.child; this.client?.close(code); this.reset();
    if (child && child.exitCode === null) { child.stdin?.end(); child.kill(); }
  }
}
