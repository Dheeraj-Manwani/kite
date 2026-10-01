import { app, ipcMain } from 'electron';
import type { AppEvent, StageKite } from '../../shared/release';
import type { CursorPoint, ScreenBounds } from '../../shared/types';
import { focusOverlayControls, getOverlayWindow, releaseOverlayControls } from '../window/overlay';
import { createSettingsWindow, getSettingsWindow } from '../window/settings';
import { trusted } from './trust';

/** Overlay-local rectangles where Kite's own controls take the mouse; everywhere else clicks pass through. */
const regions: Record<'panel' | 'bubble' | 'guide' | 'board' | 'task', ScreenBounds | null> = { panel: null, bubble: null, guide: null, board: null, task: null };
let interactive = false;
let annotation = false;
export function setAnnotationInteractive(value: boolean) {
  annotation = value; interactive = value;
  getOverlayWindow()?.setIgnoreMouseEvents(!value, { forward: true });
}
export function resetPanelHitTest() { for (const key of Object.keys(regions) as (keyof typeof regions)[]) regions[key] = null; interactive = false; annotation = false; }
const inside = (bounds: ScreenBounds | null, point: CursorPoint) => !!bounds && point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height;
const local = (point: CursorPoint) => { const origin = getOverlayWindow()?.getBounds(); return origin ? { x: point.x - origin.x, y: point.y - origin.y } : null; };
/** Whether a global DIP point is over the whiteboard panel. */
export function overBoard(point: CursorPoint) { const p = local(point); return !!p && inside(regions.board, p); }
const overControls = (point: CursorPoint) => Object.values(regions).some(bounds => inside(bounds, point));
/** Whether a global DIP click lands on Kite itself (controls or drawing) rather than the app below. */
export function overlayHit(point: CursorPoint) {
  if (annotation) return true;
  const p = local(point);
  return !!p && overControls(p);
}
export function updatePanelHitTest(point: CursorPoint) {
  if (annotation) return;
  const hit = overControls(point);
  if (hit !== interactive) {
    interactive = hit;
    getOverlayWindow()?.setIgnoreMouseEvents(!hit, { forward: true });
  }
}

export function registerOverlayIPC() {
  const region = (channel: string, key: keyof typeof regions, devOnly = false) => ipcMain.on(channel, (event, bounds: ScreenBounds | null) => {
    if ((devOnly && app.isPackaged) || !trusted(event, 'overlay')) return;
    if (bounds !== null && (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0)) return;
    regions[key] = bounds;
    if (!annotation && !bounds && Object.values(regions).every(r => !r)) {
      interactive = false;
      getOverlayWindow()?.setIgnoreMouseEvents(true, { forward: true });
    }
  });
  region('bubble:bounds', 'bubble'); region('guide:bounds', 'guide'); region('board:bounds', 'board'); region('task:bounds', 'task'); region('dev:panelBounds', 'panel', true);
  ipcMain.on('overlay:setInteractive', (event, isInteractive: boolean) => {
    const win = getOverlayWindow();
    if (win && trusted(event, 'overlay') && typeof isInteractive === 'boolean') {
      if (annotation) return;
      interactive = isInteractive;
      win.setIgnoreMouseEvents(!isInteractive, { forward: true });
    }
  });
  ipcMain.on('view:open', (event, view) => { if (trusted(event, 'either') && ['settings','history','onboarding'].includes(view)) createSettingsWindow(view); });
  // "Let's fly" (docs/design.md §K5.7): onboarding closes, and the overlay's kite takes off from where the stage kite was.
  ipcMain.on('onboarding:fly', (event, from: StageKite | undefined) => {
    const win = getSettingsWindow();
    if (!win || !trusted(event, 'settings')) return;
    const content = win.getContentBounds(), within = (n: number, max: number) => Math.min(max, Math.max(0, n));
    const valid = !!from && [from.x, from.y, from.scale].every(Number.isFinite);
    win.close();
    if (!valid) return;
    const done: AppEvent = { type: 'onboarding:done', from: { x: content.x + within(from.x, content.width), y: content.y + within(from.y, content.height), scale: Math.min(4, Math.max(1, from.scale)) } };
    getOverlayWindow()?.webContents.send('app:event', done);
  });
  ipcMain.on('overlay:focus', event => { if (trusted(event, 'overlay')) focusOverlayControls(); });
  ipcMain.on('overlay:release', event => { if (trusted(event, 'overlay')) releaseOverlayControls(); });
  ipcMain.on('settings:open', event => {
    if (trusted(event, 'either')) createSettingsWindow();
  });
}
