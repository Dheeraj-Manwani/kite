import { app, ipcMain } from 'electron';
import type { CursorPoint, ScreenBounds } from '../../shared/types';
import { getOverlayWindow } from '../window/overlay';
import { createSettingsWindow } from '../window/settings';

let panelBounds: ScreenBounds | null = null;
let interactive = false;
export function resetPanelHitTest() { panelBounds = null; interactive = false; }
export function updatePanelHitTest(point: CursorPoint) {
  const hit = !!panelBounds && point.x >= panelBounds.x && point.x <= panelBounds.x + panelBounds.width
    && point.y >= panelBounds.y && point.y <= panelBounds.y + panelBounds.height;
  if (hit !== interactive) {
    interactive = hit;
    getOverlayWindow()?.setIgnoreMouseEvents(!hit, { forward: true });
  }
}

export function registerOverlayIPC() {
  ipcMain.on('dev:panelBounds', (event, bounds: ScreenBounds | null) => {
    if (app.isPackaged || event.sender !== getOverlayWindow()?.webContents) return;
    if (bounds !== null && (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0)) return;
    panelBounds = bounds;
    if (!bounds) {
      interactive = false;
      getOverlayWindow()?.setIgnoreMouseEvents(true, { forward: true });
    }
  });
  ipcMain.on('overlay:setInteractive', (event, isInteractive: boolean) => {
    const win = getOverlayWindow();
    if (win && event.sender === win.webContents && typeof isInteractive === 'boolean') {
      interactive = isInteractive;
      win.setIgnoreMouseEvents(!isInteractive, { forward: true });
    }
  });
  ipcMain.on('settings:open', event => {
    if (event.sender === getOverlayWindow()?.webContents) createSettingsWindow();
  });
}
