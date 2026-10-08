import { setupLogging, logEvent } from './main/logging';
import { appEvent } from './main/runtime';
import { createSettingsWindow } from './main/window/settings';
import { openDatabase } from './main/storage/database';
import { uIOhook } from 'uiohook-napi';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app, dialog, globalShortcut, nativeImage } from 'electron';
import started from 'electron-squirrel-startup';
import { createOverlayWindow, getOverlayWindow, registerKeyboardControlsShortcut } from './main/window/overlay';
import { registerOverlayIPC } from './main/ipc/overlay';
import { registerAboutIPC } from './main/ipc/about';
import { startCursorTracking, stopCursorTracking } from './main/cursor';
import { startVoiceService } from './main/voice/service';
import { startBackgroundService } from './main/background/bootstrap';

let stopVoice: (() => Promise<void>) | undefined;
let stopBackground: (() => Promise<void>) | undefined;

const smoke = process.argv.includes('--smoke-test');
const backgroundSpike = process.argv.indexOf('--background-spike');
if (backgroundSpike >= 0) {
  const output = process.argv[backgroundSpike + 1];
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'kite-background-spike-')));
  app.whenReady().then(async () => {
    try {
      if (!output || output.startsWith('--')) throw new Error('Supply an output directory');
      const { runBackgroundSpike } = await import('./main/background/spike');
      const report = await runBackgroundSpike(path.resolve(output));
      process.stdout.write(JSON.stringify(report) + '\n'); app.exit(0);
    } catch { process.stderr.write('Background spike failed\n'); app.exit(1); }
  });
} else if (smoke) {
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'kite-packaged-smoke-')));
  app.whenReady().then(() => {
    try { const db = openDatabase(path.join(app.getPath('userData'), 'smoke.db')); db.createConversation('smoke', Date.now()); db.close();
      for (const theme of ['light', 'dark']) for (const state of ['', '-paused', '-update', '-paused-update']) {
        if (nativeImage.createFromPath(path.join(app.getAppPath(), 'assets', 'tray', `${theme}${state}.ico`)).isEmpty()) throw new Error('Missing tray asset');
      }
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
    registerAboutIPC();
    createOverlayWindow();
    try { stopBackground = startBackgroundService(); }
    catch { dialog.showErrorBox('Kite agents could not start', 'Check that OS encryption and the SQLite native module are available. Background work is disabled until Kite restarts.'); }
    // Before the voice service builds the tray, so its menu can show the shortcut.
    if (!registerKeyboardControlsShortcut()) logEvent('shortcut:unavailable');
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
  if (backgroundSpike >= 0) return;
  stopCursorTracking();
  if (process.platform !== 'darwin') app.quit();
});
app.on('will-quit', () => {
  stopCursorTracking();
  globalShortcut.unregisterAll();
});
app.on('before-quit', event => {
  if (!stopVoice && !stopBackground) return;
  event.preventDefault(); const stops = [stopVoice, stopBackground]; stopVoice = undefined; stopBackground = undefined;
  void Promise.allSettled(stops.filter(Boolean).map(stop => stop())).then(results => {
    if (results.some(result => result.status === 'rejected')) logEvent('shutdown:failed');
  }).finally(() => app.quit());
});
