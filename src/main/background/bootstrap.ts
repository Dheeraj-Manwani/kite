import { app, Notification, powerMonitor } from 'electron';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { BackgroundRunService } from './service';
import { BackgroundStore } from './store';
import { PdfExecutor } from './executors/pdf';
import { osCipher } from '../settings/secrets';
import { appRuntime, appEvent } from '../runtime';
import { getOverlayWindow } from '../window/overlay';
import { createSettingsWindow, getSettingsWindow } from '../window/settings';
import { registerBackgroundIPC } from '../ipc/background';
import { openPreferences } from '../settings/preferences';

let background: BackgroundRunService | null = null;
export const getBackgroundService = () => background;
export function startBackgroundService() {
  const root = path.join(app.getPath('userData'), 'agent-artifacts'); mkdirSync(root, { recursive: true });
  const store = new BackgroundStore(path.join(app.getPath('userData'), 'background.db'), osCipher), pdf = new PdfExecutor();
  const service = new BackgroundRunService({ store, root, convert: (input, style, signal) => pdf.convert(input, style, signal),
    changed: () => { for (const win of [getOverlayWindow(), getSettingsWindow()]) if (win && !win.isDestroyed()) win.webContents.send('background:changed'); },
    notice: run => {
      const text = `${run.agentName}: ${run.message}`;
      appEvent({ type: 'background:notice', text });
      if (!process.env.KITE_TEST_MODE && Notification.isSupported()) {
        const notice = new Notification({ title: run.status === 'waiting_user' ? 'Kite needs your input' : 'Kite agent update', body: text });
        notice.on('click', () => createSettingsWindow('agents')); notice.show();
      }
    },
  });
  // Load persisted policy independently: a voice startup failure must not fall back to permissive defaults.
  const preferences = openPreferences(() => false);
  service.setSettings(() => ({ permissions: preferences.get().permissions, dryRun: preferences.get().dryRun }));
  background = service; const stopIPC = registerBackgroundIPC(service);
  appRuntime.backgroundPause = value => service.setPaused(value);
  const suspend = () => service.setPaused(true, 'sleep'), resume = () => service.setPaused(false, 'sleep');
  powerMonitor.on('suspend', suspend); powerMonitor.on('resume', resume);
  // Dispatch after app composition has supplied the live settings provider.
  queueMicrotask(() => service.start());
  return async () => {
    stopIPC();
    powerMonitor.removeListener('suspend', suspend); powerMonitor.removeListener('resume', resume);
    await service.shutdown(); pdf.close(); store.close(); background = null; appRuntime.backgroundPause = () => undefined;
  };
}
