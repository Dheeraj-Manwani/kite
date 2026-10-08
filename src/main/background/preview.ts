import { BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';

/** Displays only an already-verified immutable PDF buffer. No filesystem URLs or trusted Kite preload. */
export class DocumentPreview {
  private windows = new Set<BrowserWindow>();
  async open(bytes: Uint8Array, name: string) {
    if (this.windows.size >= 3) throw new Error('Close a PDF preview before opening another.');
    const id = randomUUID(), url = `https://kite-preview.invalid/${id}.pdf`;
    const win = new BrowserWindow({ title: `Kite PDF preview · ${name}`, width: 920, height: 800, show: false, autoHideMenuBar: true,
      // Chromium's built-in viewer needs its own JavaScript. Document actions are rejected by admission;
      // the viewer has no preload and its session cannot make external requests.
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, plugins: true, partition: `document-preview-${id}` } });
    this.windows.add(win);
    const profile = win.webContents.session;
    profile.setPermissionRequestHandler((_wc, _permission, callback) => callback(false)); profile.setPermissionCheckHandler(() => false);
    profile.on('will-download', event => event.preventDefault());
    // Locally handled HTTPS lets Chromium's PDF extension read this immutable buffer.
    // This URL never reaches DNS or the network, and contains no filesystem location.
    profile.protocol.handle('https', request => request.url === url ? new Response(new Uint8Array(bytes).buffer, { headers: { 'Content-Type': 'application/pdf', 'Content-Length': String(bytes.length), 'Cache-Control': 'no-store' } }) : new Response(null, { status: 404 }));
    profile.webRequest.onBeforeRequest((details, callback) => callback({ cancel: details.url !== url && !['chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/', 'chrome://resources/', 'blob:', 'data:'].some(prefix => details.url.startsWith(prefix)) }));
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault()); win.webContents.on('will-redirect', event => event.preventDefault());
    win.once('closed', () => { this.windows.delete(win); profile.protocol.unhandle('https'); });
    try { await win.loadURL(url); if (!win.isDestroyed()) win.show(); }
    catch { if (!win.isDestroyed()) win.destroy(); throw new Error('Preview could not load.'); }
    return win;
  }
  close() { for (const win of this.windows) if (!win.isDestroyed()) win.destroy(); }
}


