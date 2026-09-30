import { BrowserWindow, nativeTheme } from 'electron';
import { loadRenderer, preloadPath } from './renderer';

let settingsWindow: BrowserWindow | null = null;
export const getSettingsWindow = () => settingsWindow;
export function createSettingsWindow(view: 'settings' | 'history' | 'onboarding' = 'settings'): BrowserWindow {
  if (settingsWindow) {
    if (settingsWindow.isMinimized()) settingsWindow.restore();
    settingsWindow.show();
    settingsWindow.focus();
    settingsWindow.webContents.send('view:change', view);
    return settingsWindow;
  }
  const win = new BrowserWindow({
    width: 700, height: 860, minWidth: 400, minHeight: 560,
    title: 'Kite settings', autoHideMenuBar: true, show: false,
    // Matches --bg in tokens.css, so the window never flashes the wrong color while it loads.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1f24' : '#f4f5f7',
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  settingsWindow = win;
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { settingsWindow = null; });
  void loadRenderer(win, view);
  return win;
}
