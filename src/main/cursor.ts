import { screen } from 'electron';
import { getOverlayWindow } from './window/overlay';
import { updatePanelHitTest } from './ipc/overlay';

let timer: ReturnType<typeof setTimeout> | undefined;
export function startCursorTracking() {
  if (timer) return;
  let last = { x: NaN, y: NaN }, movedAt = performance.now();
  const tick = () => {
    const win = getOverlayWindow();
    if (!win || win.isDestroyed() || win.webContents.isLoading()) { timer = setTimeout(tick,100); return; }
    const point = screen.getCursorScreenPoint();
    if (point.x !== last.x || point.y !== last.y) { movedAt = performance.now(); last = point; }
    const bounds = win.getBounds();
    updatePanelHitTest({ x: point.x - bounds.x, y: point.y - bounds.y });
    win.webContents.send('cursor:update', point, {
      origin: { x: bounds.x, y: bounds.y },
      display: screen.getDisplayNearestPoint(point).bounds,
    });
    timer = setTimeout(tick, performance.now() - movedAt > 2000 ? 100 : 16);
  };
  timer = setTimeout(tick,16);
}
export function stopCursorTracking() {
  if (timer) clearTimeout(timer);
  timer = undefined;
}
