import { setupLogging, logEvent } from './main/logging';
import { appEvent } from './main/runtime';
import { createSettingsWindow } from './main/window/settings';
import { openDatabase } from './main/storage/database';
import { uIOhook } from 'uiohook-napi';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app, dialog, globalShortcut } from 'electron';
import started from 'electron-squirrel-startup';
import { createOverlayWindow, getOverlayWindow } from './main/window/overlay';
import { registerOverlayIPC } from './main/ipc/overlay';
import { startCursorTracking, stopCursorTracking } from './main/cursor';
import { startVoiceService } from './main/voice/service';

let stopVoice: (() => Promise<void>) | undefined;

const smoke = process.argv.includes('--smoke-test');
if (smoke) {
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'kite-packaged-smoke-')));
  app.whenReady().then(() => {
    try { const db = openDatabase(path.join(app.getPath('userData'), 'smoke.db')); db.createConversation('smoke', Date.now()); db.close();
      uIOhook.start(); uIOhook.stop(); process.stdout.write('ok\n'); app.exit(0);
    } catch { process.stderr.write('smoke failed\n'); app.exit(1); }
  });
} else if (started) {
  app.quit();
} else if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  setupLogging(() => appEvent({ type: 'fault' }));
  app.on('second-instance', () => { if (app.isReady()) createSettingsWindow(); });
  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('com.squirrel.kite.Kite');
    registerOverlayIPC();
    createOverlayWindow();
    try { stopVoice = startVoiceService(); }
    catch { dialog.showErrorBox('Kite voice could not start', 'Check that the native keyboard and SQLite modules are built for this Electron version. Restart Kite after repairing the installation.'); }
    startCursorTracking();
    if (!app.isPackaged && !globalShortcut.register('CommandOrControl+Shift+D', () => {
      getOverlayWindow()?.webContents.send('dev:togglePanel');
    })) logEvent('shortcut:unavailable');
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
  void stop().catch(() => logEvent('shutdown:failed')).finally(() => app.quit());
});
