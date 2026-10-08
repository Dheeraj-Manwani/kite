import { BrowserWindow, session } from 'electron';
import { randomUUID } from 'node:crypto';

/** Phase 0 probe: manual browsing only, separate persistent credentials, no Kite preload or privileged IPC. */
export function createBrowserSpike(url: string, options: { visible?: boolean; partition?: string; testOrigin?: string } = {}) {
  const target = new URL(url);
  const allowed = (value: string) => { try { const u = new URL(value); return (u.protocol === 'https:' && !u.username && !u.password) || (!!options.testOrigin && u.origin === options.testOrigin); } catch { return false; } };
  if (!allowed(target.href)) throw new Error('Use an HTTPS address for the browser probe.');
  const profile = session.fromPartition(options.partition ?? `persist:kite-browser-spike-${randomUUID()}`);
  profile.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  profile.setPermissionCheckHandler(() => false);
  profile.on('will-download', event => event.preventDefault());
  const win = new BrowserWindow({ title: 'Kite · isolated browser probe', width: 980, height: 740, show: options.visible !== false,
    webPreferences: { session: profile, contextIsolation: true, sandbox: true, nodeIntegration: false } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, destination) => { if (!allowed(destination)) event.preventDefault(); });
  win.webContents.on('will-redirect', (event, destination) => { if (!allowed(destination)) event.preventDefault(); });
  void win.loadURL(target.href).catch(() => { /* This probe has no task to mark complete on navigation failure. */ });
  return win;
}
