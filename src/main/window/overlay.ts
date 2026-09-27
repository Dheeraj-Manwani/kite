import { BrowserWindow, screen } from 'electron';
import { loadRenderer, preloadPath } from './renderer';

let overlayWindow: BrowserWindow | null = null;
export const getOverlayWindow = () => overlayWindow;
export function getDesktopBounds() {
  const displays = screen.getAllDisplays().map(display => display.bounds);
  const x = Math.min(...displays.map(bounds => bounds.x));
  const y = Math.min(...displays.map(bounds => bounds.y));
  return {
    x, y,
    width: Math.max(...displays.map(bounds => bounds.x + bounds.width)) - x,
    height: Math.max(...displays.map(bounds => bounds.y + bounds.height)) - y,
  };
}
export function createOverlayWindow(): BrowserWindow {
  if (overlayWindow) return overlayWindow;
  const win = new BrowserWindow({
    ...getDesktopBounds(), transparent: true, frame: false, alwaysOnTop: true,
    skipTaskbar: true, resizable: false, hasShadow: false, focusable: false,
    show: false, backgroundColor: '#00000000',
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  overlayWindow = win;
  win.setIgnoreMouseEvents(true, { forward: true });
  win.once('ready-to-show', () => win.showInactive());
  const updateBounds = () => win.setBounds(getDesktopBounds());
  screen.on('display-added', updateBounds);
  screen.on('display-removed', updateBounds);
  screen.on('display-metrics-changed', updateBounds);
  win.webContents.on('did-start-loading', () => win.setIgnoreMouseEvents(true, { forward: true }));
  win.on('closed', () => {
    screen.removeListener('display-added', updateBounds);
    screen.removeListener('display-removed', updateBounds);
    screen.removeListener('display-metrics-changed', updateBounds);
    overlayWindow = null;
  });
  void loadRenderer(win, 'overlay');
  return win;
}
