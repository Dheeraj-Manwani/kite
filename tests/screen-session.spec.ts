import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => unknown>(), send: vi.fn(), sources: vi.fn(), protect: vi.fn(), display: { id: 7, bounds: { x: -800, y: 0, width: 800, height: 600 }, scaleFactor: 1.25 }, connected: true }));
vi.mock('electron', () => ({ app: { isPackaged: false }, ipcMain: { on: (name: string, callback: (...args: unknown[]) => unknown) => fixture.handlers.set(name, callback), handle: vi.fn() }, desktopCapturer: { getSources: fixture.sources }, screen: { getAllDisplays: () => fixture.connected ? [fixture.display] : [], getDisplayNearestPoint: () => fixture.display, getCursorScreenPoint: () => ({ x: -600, y: 100 }) } }));
vi.mock('../src/main/window/overlay', () => ({ getOverlayWindow: () => ({ isDestroyed: () => false, getBounds: () => ({ x: -800, y: 0 }), setContentProtection: fixture.protect, webContents: { send: fixture.send } }) }));
vi.mock('../src/main/ipc/trust', () => ({ trusted: (event: { valid: boolean }) => event.valid }));
import { ScreenSession, registerScreenIPC } from '../src/main/vision/service';
beforeEach(() => {
  vi.useFakeTimers(); fixture.connected = true; fixture.handlers.clear(); fixture.sources.mockReset(); fixture.protect.mockReset(); fixture.send.mockReset();
  fixture.sources.mockResolvedValue([{ display_id: '7', thumbnail: { isEmpty: () => false, getSize: () => ({ width: 1000, height: 750 }), toPNG: () => Buffer.from([1, 2]) } }]);
  fixture.send.mockImplementation((_channel: string, event: { type: string; token: string }) => {
    if (event.type === 'looking') fixture.handlers.get('screen:hidden')?.({ valid: true }, event.token);
    if (event.type === 'prepare') fixture.handlers.get('screen:prepared')?.({ valid: true }, event.token, { overview: new Uint8Array([255, 216, 1]), zoom: new Uint8Array([255, 216, 2]) });
  });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
it('ordinary, silent, and cancelled holds take no screenshot and never hide Kite', async () => {
  const session = new ScreenSession(); registerScreenIPC(id => session.mark(id));
  for (const id of [1, 2, 3]) { session.start(id, new AbortController().signal, () => true, vi.fn()); expect(await session.prepare(id, [], new AbortController().signal)).toBeUndefined(); session.clear(id); }
  expect(fixture.sources).not.toHaveBeenCalled(); expect(fixture.protect).not.toHaveBeenCalled();
  expect(fixture.send.mock.calls.every(([, event]) => event.type === 'annotate')).toBe(true);
});
it('only the first deliberate mark captures; strokes use the original display and negative origin', async () => {
  const session = new ScreenSession(), signal = new AbortController().signal, measured = vi.fn(); registerScreenIPC(id => session.mark(id));
  session.start(4, signal, () => true, measured);
  fixture.handlers.get('screen:mark')?.({ valid: false }, 4); fixture.handlers.get('screen:mark')?.({ valid: true }, 99);
  expect(fixture.sources).not.toHaveBeenCalled();
  fixture.handlers.get('screen:mark')?.({ valid: true }, 4); session.mark(4);
  await vi.advanceTimersByTimeAsync(200);
  const turn = await session.prepare(4, [[{ x: 100, y: 100, t: 1 }]], signal);
  expect(fixture.sources).toHaveBeenCalledOnce(); expect(measured).toHaveBeenCalledOnce();
  expect(turn?.analysis.marks[0].region.x).toBe(-700); expect(turn?.attachment?.label).toContain('Display 1'); expect(turn?.attachment?.preview).toMatch(/^data:image\/jpeg;base64,/);
  expect(fixture.protect.mock.calls).toEqual([[true], [false]]);
});
it('a disconnected or failed marked capture never captures another display and restores visibility', async () => {
  const session = new ScreenSession(), signal = new AbortController().signal; registerScreenIPC(id => session.mark(id));
  session.start(5, signal, () => true, vi.fn()); fixture.connected = false; session.mark(5);
  await expect(session.prepare(5, [[{ x: 100, y: 100, t: 1 }]], signal)).rejects.toThrow('Display disconnected'); expect(fixture.sources).not.toHaveBeenCalled();
  fixture.connected = true; fixture.sources.mockRejectedValueOnce(new Error('Capture failed'));
  session.start(6, signal, () => true, vi.fn()); session.mark(6); await vi.advanceTimersByTimeAsync(200);
  await expect(session.prepare(6, [[{ x: 100, y: 100, t: 1 }]], signal)).rejects.toThrow('Capture failed');
  expect(fixture.protect.mock.calls).toEqual([[true], [false]]);
  expect(fixture.send.mock.calls.some(([, event]) => event.type === 'looking' && !event.hidden)).toBe(true);
});
it('an interrupted hold and Kite’s own whiteboard cannot initiate desktop capture', () => {
  const session = new ScreenSession(), controller = new AbortController(); registerScreenIPC(id => session.mark(id));
  session.start(8, controller.signal, () => true, vi.fn()); controller.abort(); session.mark(8);
  session.skip(9, () => true); session.mark(9);
  expect(fixture.sources).not.toHaveBeenCalled();
});
