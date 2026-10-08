import { BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import type { PdfStyle } from '../../../shared/background';
import type { RunInput } from '../store';
import { textPdfHtml } from './text';

/** Chromium does the expensive layout in its renderer. One print worker at a time, independent of app windows. */
export class PdfExecutor {
  private tail: Promise<void> = Promise.resolve();
  private windows = new Set<BrowserWindow>();
  async convert(input: RunInput, style: PdfStyle, signal: AbortSignal): Promise<Uint8Array> {
    const previous = this.tail;
    let release: () => void;
    this.tail = new Promise<void>(resolve => { release = resolve; });
    try {
      await previous;
      signal.throwIfAborted();
      const win = new BrowserWindow({ show: false, width: 800, height: 1000, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false, partition: `pdf-${randomUUID()}` } });
      this.windows.add(win);
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      win.webContents.on('will-navigate', event => event.preventDefault());
      win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
      win.webContents.session.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith('data:text/html;') }));
      const stop = () => { if (!win.isDestroyed()) win.destroy(); };
      signal.addEventListener('abort', stop, { once: true });
      try {
        await win.loadURL(`data:text/html;base64,${Buffer.from(textPdfHtml(input.name, input.text, style)).toString('base64')}`);
        signal.throwIfAborted();
        const bytes = await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, generateTaggedPDF: true });
        signal.throwIfAborted(); return bytes;
      } finally { signal.removeEventListener('abort', stop); stop(); this.windows.delete(win); }
    } finally { release(); }
  }
  close() { for (const win of this.windows) if (!win.isDestroyed()) win.destroy(); this.windows.clear(); }
}
