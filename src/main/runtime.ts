import { app, autoUpdater, BrowserWindow, powerMonitor, shell } from 'electron';
import { updateElectronApp, UpdateSourceType } from 'update-electron-app';
import { repository, repositoryURL, type AppEvent } from '../shared/release';
import { getOverlayWindow } from './window/overlay';
import { logEvent } from './logging';
export const appRuntime = { pausedUntil: 0, updateReady: false, updateStatus: 'Idle', changed: () => undefined as void, cancel: () => undefined as void };
let pauseTimer: ReturnType<typeof setTimeout>;
export function appEvent(event: AppEvent) { for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('app:event', event); }
export function pauseKite(minutes: number | null) {
  clearTimeout(pauseTimer); appRuntime.cancel();
  appRuntime.pausedUntil = minutes === null ? Infinity : minutes > 0 ? Date.now() + minutes * 60000 : 0;
  if (!appRuntime.pausedUntil) { getOverlayWindow()?.showInactive(); appEvent({ type: 'resumed' }); }
  else {
    appEvent({ type: 'paused', until: Number.isFinite(appRuntime.pausedUntil) ? appRuntime.pausedUntil : null });
    setTimeout(() => { if (appRuntime.pausedUntil) getOverlayWindow()?.hide(); }, 650);
    if (minutes) pauseTimer = setTimeout(() => pauseKite(0), minutes * 60000);
  }
  appRuntime.changed();
}
export function startUpdates() {
  if (!app.isPackaged || process.platform !== 'win32') return (): void => undefined;
  const status = (name: string) => { appRuntime.updateStatus = name; appRuntime.changed(); logEvent('update:state'); };
  autoUpdater.on('checking-for-update', () => status('Checking'));
  autoUpdater.on('update-available', () => status('Downloading'));
  autoUpdater.on('update-not-available', () => status('Up to date'));
  autoUpdater.on('error', () => status('Unavailable'));
  autoUpdater.on('update-downloaded', () => { appRuntime.updateReady = true; status('Ready to restart'); appEvent({ type: 'update:ready' }); });
  const updater = updateElectronApp({ updateSource: { type: UpdateSourceType.ElectronPublicUpdateService, repo: repository }, notifyUser: false,
    updateInterval: '1 hour', logger: { log: () => logEvent('update:event'), error: () => logEvent('update:error'), info: () => logEvent('update:info'), warn: () => logEvent('update:warn') } });
  return () => updater.stopUpdates();
}
export const restartToUpdate = () => { if (appRuntime.updateReady) { appRuntime.cancel(); autoUpdater.quitAndInstall(); } };
export const openLogs = () => shell.openPath(app.getPath('logs'));
export const reportProblem = () => shell.openExternal(`${repositoryURL}/issues/new?${new URLSearchParams({ title: 'Kite issue', body: `Kite ${app.getVersion()}\nWindows ${process.getSystemVersion()} (${process.arch})\n\nWhat happened?\n\nSteps to reproduce:\n\nDo not include keys, transcripts, or screenshots containing private information.` })}`);
export function onResume(callback: () => void) { powerMonitor.on('resume', callback); return () => powerMonitor.removeListener('resume', callback); }
