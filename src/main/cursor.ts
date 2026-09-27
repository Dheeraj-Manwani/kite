import { screen } from 'electron';
import { getOverlayWindow } from './window/overlay';

let timer: ReturnType<typeof setInterval> | undefined;
export function startCursorTracking() {
  if (timer) return;
  timer = setInterval(() => {
    const win = getOverlayWindow();
    if (!win || win.isDestroyed() || win.webContents.isLoading()) return;
    const point = screen.getCursorScreenPoint();
    const bounds = win.getBounds();
    // Monitors can have negative screen coordinates.
    win.webContents.send('cursor:update', { x: point.x - bounds.x, y: point.y - bounds.y });
  }, 16);
}
export function stopCursorTracking() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
