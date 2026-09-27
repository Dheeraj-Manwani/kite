import { screen } from 'electron';
import { getOverlayWindow } from './window/overlay';
import { updatePanelHitTest } from './ipc/overlay';

let timer: ReturnType<typeof setInterval> | undefined;
export function startCursorTracking() {
  if (timer) return;
  timer = setInterval(() => {
    const win = getOverlayWindow();
    if (!win || win.isDestroyed() || win.webContents.isLoading()) return;
    const point = screen.getCursorScreenPoint();
    const bounds = win.getBounds();
    updatePanelHitTest({ x: point.x - bounds.x, y: point.y - bounds.y });
    win.webContents.send('cursor:update', point, {
      origin: { x: bounds.x, y: bounds.y },
      display: screen.getDisplayNearestPoint(point).bounds,
    });
  }, 16);
}
export function stopCursorTracking() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
