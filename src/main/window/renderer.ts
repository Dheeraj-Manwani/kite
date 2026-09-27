import { BrowserWindow } from 'electron';
import path from 'node:path';

export const preloadPath = path.join(__dirname, 'preload.js');
export function loadRenderer(win: BrowserWindow, view: 'overlay' | 'settings') {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const url = new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    url.hash = view;
    return win.loadURL(url.toString());
  }
  return win.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`), { hash: view });
}
