import { app, desktopCapturer, ipcMain, screen } from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getOverlayWindow } from '../window/overlay';
import { trusted } from '../ipc/trust';
import { protectedCapture } from './captureCore';
import type { ScreenBounds } from '../../shared/types';
import { analyzeStrokes, contains, type DisplayInfo, type ScreenEvent, type Stroke, type VisionImages, type VisionTurn } from '../../shared/vision';
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const send = (event: ScreenEvent) => getOverlayWindow()?.webContents.send('screen:event', event);
let lookingTimer: ReturnType<typeof setTimeout>;
let queue: Promise<unknown> = Promise.resolve();
let hiddenAck: ((token: string) => void) | undefined;
const pending = new Map<string, (images: VisionImages | null) => void>();
export function captureDisplay(displayId: number, signal?: AbortSignal): Promise<{ png: Buffer; display: DisplayInfo; captureMs: number }> {
  const capture = async () => {
    signal?.throwIfAborted();
    const started = performance.now(), win = getOverlayWindow();
    if (!win || win.isDestroyed()) throw new Error('Overlay unavailable');
    const d = screen.getAllDisplays().find(d => d.id === displayId);
    if (!d) throw new Error('Display disconnected');
    const display: DisplayInfo = { id: d.id, bounds: { ...d.bounds }, scaleFactor: d.scaleFactor };
    clearTimeout(lookingTimer);
    send({ type: 'looking', active: true, hidden: false });
    await delay(120); // Give the unavoidable trust indicator and blink a visible frame.
    try {
      const png = await protectedCapture({
        protect: value => { if (!win.isDestroyed()) win.setContentProtection(value); },
        hide: async hidden => {
          if (!hidden) { hiddenAck = undefined; send({ type: 'looking', active: true, hidden: false }); return; }
          await new Promise<void>((resolve, reject) => {
            const token = randomUUID();
            const timer = setTimeout(() => { hiddenAck = undefined; reject(new Error('Overlay did not hide')); }, 1500);
            hiddenAck = value => { if (value === token) { clearTimeout(timer); hiddenAck = undefined; resolve(); } };
            send({ type: 'looking', active: true, hidden: true, token });
          });
        },
        wait: () => delay(40),
        capture: async () => {
          signal?.throwIfAborted();
          const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: {
            width: Math.round(d.bounds.width * d.scaleFactor), height: Math.round(d.bounds.height * d.scaleFactor) } });
          const source = sources.find(s => s.display_id === String(d.id));
          if (!source || source.thumbnail.isEmpty()) throw new Error('Screen capture unavailable');
          const size = source.thumbnail.getSize();
          if (Math.abs(size.width - d.bounds.width * d.scaleFactor) > 2 || Math.abs(size.height - d.bounds.height * d.scaleFactor) > 2) throw new Error('Unexpected capture dimensions');
          return source.thumbnail.toPNG();
        },
      });
      return { png, display, captureMs: performance.now() - started };
    } finally {
      lookingTimer = setTimeout(() => send({ type: 'looking', active: false, hidden: false }), 450);
    }
  };
  const result = queue.then(capture); queue = result.catch((): void => undefined); return result;
}
export const captureUnderCursor = (signal?: AbortSignal) => captureDisplay(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id, signal);
export function prepareImages(capture: { png: Buffer; display: DisplayInfo }, strokes: Stroke[], signal: AbortSignal, crop?: ScreenBounds): Promise<VisionImages> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const token = randomUUID();
    const finish = (images: VisionImages | null) => { clearTimeout(timer); pending.delete(token); signal.removeEventListener('abort', abort); images ? resolve(images) : reject(new Error('Image preparation failed')); };
    const abort = () => finish(null), timer = setTimeout(abort, 15000);
    pending.set(token, finish); signal.addEventListener('abort', abort, { once: true });
    send({ type: 'prepare', token, png: new Uint8Array(capture.png), display: capture.display, strokes, ...(crop ? { crop } : {}) });
  });
}
export class ScreenSession {
  private captures = new Map<number, { result: ReturnType<typeof captureUnderCursor>; origin: { x: number; y: number } }>();
  /** Holds that intentionally took no screenshot (marking Kite's own whiteboard). */
  private skipped = new Set<number>();
  start(id: number, signal: AbortSignal, ready: () => boolean, measured: (ms: number) => void) {
    const origin = getOverlayWindow()?.getBounds(); if (!origin) return;
    const entry = { result: captureUnderCursor(signal), origin: { x: origin.x, y: origin.y } };
    this.captures.set(id, entry);
    void entry.result.then(c => {
      if (!signal.aborted) measured(c.captureMs);
      if (!signal.aborted && ready()) send({ type: 'annotate', id, display: c.display, origin: entry.origin });
    }).catch(() => { /* Voice remains available if capture fails; never use another screen. */ });
  }
  /** Allow marking at once without capturing: the hold began over Kite's whiteboard. */
  skip(id: number, ready: () => boolean) {
    const origin = getOverlayWindow()?.getBounds(); if (!origin) return;
    const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    this.skipped.add(id);
    if (ready()) send({ type: 'annotate', id, display: { id: d.id, bounds: { ...d.bounds }, scaleFactor: d.scaleFactor }, origin: { x: origin.x, y: origin.y } });
  }
  clear(id: number) { this.captures.delete(id); this.skipped.delete(id); }
  async prepare(id: number, strokes: Stroke[], signal: AbortSignal): Promise<VisionTurn | undefined> {
    const entry = this.captures.get(id); this.captures.delete(id);
    const skipped = this.skipped.delete(id);
    if (!strokes.length || (!entry && skipped)) return;
    if (!entry) throw new Error('No capture for this hold');
    const capture = await entry.result; signal.throwIfAborted();
    const global = strokes.map(s => s.map(p => ({ ...p, x: p.x + entry.origin.x, y: p.y + entry.origin.y })))
      .filter(s => s.length && contains(capture.display.bounds, s[0]));
    if (!global.length) return;
    return { images: await prepareImages(capture, global, signal), analysis: analyzeStrokes(global), captureMs: capture.captureMs };
  }
}
export function registerScreenIPC() {
  ipcMain.on('screen:hidden', (e, token) => { if (trusted(e, 'overlay') && typeof token === 'string') hiddenAck?.(token); });
  ipcMain.on('screen:prepared', (e, token, images) => {
    if (!trusted(e, 'overlay') || typeof token !== 'string' || !pending.has(token)) return;
    const valid = (a: unknown) => a instanceof Uint8Array && a.byteLength > 2 && a.byteLength < 12_000_000 && a[0] === 255 && a[1] === 216;
    pending.get(token)(images && valid(images.overview) && (!images.zoom || valid(images.zoom)) ? images : null);
  });
  ipcMain.handle('screen:test', async e => {
    if (app.isPackaged || !trusted(e, 'overlay')) return { ok: false };
    try { const c = await captureUnderCursor(); const folder = path.join(app.getPath('temp'), 'kite-captures'); await mkdir(folder, { recursive: true });
      const filename = path.join(folder, `${randomUUID()}.png`); await writeFile(filename, c.png); return { ok: true, path: filename };
    } catch { return { ok: false, error: 'Capture failed; protection was restored.' }; }
  });
}
