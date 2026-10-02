import { BrowserWindow } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const preloadPath = path.join(__dirname, 'preload.js');
export function isAppURL(value: string) {
  try {
    const url = new URL(value);
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      const allowed = new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
      return url.origin === allowed.origin && (url.pathname === '/' || url.pathname === '/index.html');
    }
    const allowed = pathToFileURL(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
    return url.protocol === 'file:' && url.pathname === allowed.pathname && url.host === allowed.host;
  } catch { return false; }
}
/** `mica` tells the page that the window draws Mica behind it, so it leaves its own background off (UX-57). */
export function loadRenderer(win: BrowserWindow, view: 'overlay' | import('../../shared/types').View, options: { mica?: boolean } = {}) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const url = new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    url.hash = view;
    if (options.mica) url.searchParams.set('mica', '1');
    return win.loadURL(url.toString());
  }
  return win.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`), { hash: view, query: options.mica ? { mica: '1' } : undefined });
}
