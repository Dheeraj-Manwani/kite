import { app, globalShortcut } from 'electron';
import started from 'electron-squirrel-startup';
import { createOverlayWindow, getOverlayWindow } from './main/window/overlay';
import { registerOverlayIPC } from './main/ipc/overlay';
import { startCursorTracking, stopCursorTracking } from './main/cursor';

if (started) {
  app.quit();
} else {
  app.whenReady().then(() => {
    registerOverlayIPC();
    createOverlayWindow();
    startCursorTracking();
    if (!app.isPackaged && !globalShortcut.register('CommandOrControl+Shift+D', () => {
      getOverlayWindow()?.webContents.send('dev:togglePanel');
    })) console.warn('Kite: could not register the dev panel shortcut');
    if (!globalShortcut.register('CommandOrControl+Shift+K', () => {
      console.log('hotkey pressed');
    })) console.warn('Kite: could not register CommandOrControl+Shift+K');
    app.on('activate', () => {
      if (!getOverlayWindow()) {
        createOverlayWindow();
        startCursorTracking();
      }
    });
  });
}
app.on('window-all-closed', () => {
  stopCursorTracking();
  if (process.platform !== 'darwin') app.quit();
});
app.on('will-quit', () => {
  stopCursorTracking();
  globalShortcut.unregisterAll();
});
