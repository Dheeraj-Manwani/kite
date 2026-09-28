import { app, dialog, globalShortcut } from 'electron';
import started from 'electron-squirrel-startup';
import { createOverlayWindow, getOverlayWindow } from './main/window/overlay';
import { registerOverlayIPC } from './main/ipc/overlay';
import { startCursorTracking, stopCursorTracking } from './main/cursor';
import { startVoiceService } from './main/voice/service';

let stopVoice: (() => Promise<void>) | undefined;

if (started) {
  app.quit();
} else {
  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('Kite');
    registerOverlayIPC();
    createOverlayWindow();
    try { stopVoice = startVoiceService(); }
    catch { dialog.showErrorBox('Kite voice could not start', 'Check that the native keyboard and SQLite modules are built for this Electron version. Restart Kite after repairing the installation.'); }
    startCursorTracking();
    if (!app.isPackaged && !globalShortcut.register('CommandOrControl+Shift+D', () => {
      getOverlayWindow()?.webContents.send('dev:togglePanel');
    })) console.warn('Kite: could not register the dev panel shortcut');
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
app.on('before-quit', event => {
  if (!stopVoice) return;
  event.preventDefault(); const stop = stopVoice; stopVoice = undefined;
  void stop().catch(() => console.error('Kite shutdown did not finish cleanly.')).finally(() => app.quit());
});
