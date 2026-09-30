import { app, ipcMain } from 'electron';
import type { CursorPoint, ScreenBounds } from '../../shared/types';
import { getOverlayWindow } from '../window/overlay';
import { createSettingsWindow } from '../window/settings';
import { trusted } from './trust';

let panelBounds: ScreenBounds | null = null;
let bubbleBounds: ScreenBounds | null = null;
let guideBounds: ScreenBounds | null = null;
let interactive = false;
let annotation = false;
export function setAnnotationInteractive(value: boolean) {
  annotation = value; interactive = value;
  getOverlayWindow()?.setIgnoreMouseEvents(!value, { forward: true });
}
export function resetPanelHitTest() { panelBounds = null; bubbleBounds = null; guideBounds = null; interactive = false; annotation = false; }
const overControls = (point: CursorPoint) => [panelBounds, bubbleBounds, guideBounds].some(bounds => !!bounds && point.x >= bounds.x && point.x <= bounds.x + bounds.width
  && point.y >= bounds.y && point.y <= bounds.y + bounds.height);
/** Whether a global DIP click lands on Kite itself (controls or drawing) rather than the app below. */
export function overlayHit(point: CursorPoint) {
  if (annotation) return true;
  const origin = getOverlayWindow()?.getBounds();
  return !!origin && overControls({ x: point.x - origin.x, y: point.y - origin.y });
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
  ipcMain.on('bubble:bounds', (event, bounds: ScreenBounds | null) => {
    if (!trusted(event, 'overlay')) return;
    if (bounds !== null && (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0)) return;
    bubbleBounds = bounds;
    if (!annotation && !bounds && !panelBounds && !guideBounds) {
      interactive = false;
      getOverlayWindow()?.setIgnoreMouseEvents(true, { forward: true });
    }
  });
  ipcMain.on('guide:bounds', (event, bounds: ScreenBounds | null) => {
    if (!trusted(event, 'overlay')) return;
    if (bounds !== null && (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0)) return;
    guideBounds = bounds;
    if (!annotation && !bounds && !bubbleBounds && !panelBounds) {
      interactive = false;
      getOverlayWindow()?.setIgnoreMouseEvents(true, { forward: true });
    }
  });
  ipcMain.on('dev:panelBounds', (event, bounds: ScreenBounds | null) => {
    if (app.isPackaged || !trusted(event, 'overlay')) return;
    if (bounds !== null && (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0)) return;
    panelBounds = bounds;
    if (!annotation && !bounds && !bubbleBounds && !guideBounds) {
      interactive = false;
      getOverlayWindow()?.setIgnoreMouseEvents(true, { forward: true });
    }
  });
  ipcMain.on('overlay:setInteractive', (event, isInteractive: boolean) => {
    const win = getOverlayWindow();
    if (win && trusted(event, 'overlay') && typeof isInteractive === 'boolean') {
      if (annotation) return;
      interactive = isInteractive;
      win.setIgnoreMouseEvents(!isInteractive, { forward: true });
    }
  });
  ipcMain.on('view:open', (event, view) => { if (trusted(event, 'either') && ['settings','history','onboarding'].includes(view)) createSettingsWindow(view); });
  ipcMain.on('overlay:focus', event => { if (trusted(event, 'overlay')) { const win = getOverlayWindow(); win?.setFocusable(true); win?.focus(); } });
  ipcMain.on('settings:open', event => {
    if (trusted(event, 'either')) createSettingsWindow();
  });
}
