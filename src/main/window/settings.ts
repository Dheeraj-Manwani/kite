import { BrowserWindow } from 'electron';
import { loadRenderer, preloadPath } from './renderer';

let settingsWindow: BrowserWindow | null = null;
export function createSettingsWindow(): BrowserWindow {
  if (settingsWindow) {
    if (settingsWindow.isMinimized()) settingsWindow.restore();
    settingsWindow.show();
    settingsWindow.focus();
    return settingsWindow;
  }
  const win = new BrowserWindow({
    width: 520, height: 660, minWidth: 400, minHeight: 560,
    title: 'Kite settings', autoHideMenuBar: true, show: false,
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  settingsWindow = win;
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { settingsWindow = null; });
  void loadRenderer(win, 'settings');
  return win;
}
