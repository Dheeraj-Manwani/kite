import { BrowserWindow, nativeTheme, screen } from 'electron';
import Store from 'electron-store';
import os from 'node:os';
import { loadRenderer, preloadPath } from './renderer';
import { MIN_SIZE, restoredSize, supportsMica, type WindowSize } from './size';

let settingsWindow: BrowserWindow | null = null;
let sizes: Store<{ settings?: WindowSize }> | null = null;
export const getSettingsWindow = () => settingsWindow;
export function createSettingsWindow(view: 'settings' | 'history' | 'onboarding' = 'settings'): BrowserWindow {
  if (settingsWindow) {
    if (settingsWindow.isMinimized()) settingsWindow.restore();
    settingsWindow.show();
    settingsWindow.focus();
    settingsWindow.webContents.send('view:change', view);
    return settingsWindow;
  }
  // The window reopens at the size it was closed at (UX-57), within the screen it opens on.
  sizes ??= new Store<{ settings?: WindowSize }>({ name: 'window-state' });
  const size = restoredSize(sizes.get('settings'), screen.getPrimaryDisplay().workAreaSize);
  const win = new BrowserWindow({
    width: size.width, height: size.height, minWidth: MIN_SIZE.width, minHeight: MIN_SIZE.height,
    title: 'Kite settings', autoHideMenuBar: true, show: false,
    // Matches --bg in tokens.css, so the window never flashes the wrong color while it loads.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1f24' : '#f4f5f7',
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  // Mica on Windows 11 (UX-57): the method also clears the page's background so the backdrop shows through, and the
  // renderer then drops its own --bg (styles/window.css, html.mica).
  const mica = supportsMica(process.platform, os.release());
  if (mica) win.setBackgroundMaterial('mica');
  settingsWindow = win;
  win.once('ready-to-show', () => { if (size.maximized) win.maximize(); win.show(); });
  win.on('close', () => { const bounds = win.getNormalBounds(); sizes?.set('settings', { width: bounds.width, height: bounds.height, maximized: win.isMaximized() }); });
  win.on('closed', () => { settingsWindow = null; });
  void loadRenderer(win, view, { mica });
  return win;
}
