import { BrowserWindow } from 'electron';
import { mkdir, open } from 'node:fs/promises';
import path from 'node:path';
import { safeFilename } from '../tools/impl/create_note';
import { pasteText } from '../tools/clipboard';
import { electronClipboard } from '../tools/electronClipboard';
import { xml } from '../../shared/boardExports';
/** Filenames are generated locally and written exclusively; exports never overwrite a previous board. */
export async function saveBoardFile(documents: string, title: string, extension: string, bytes: Uint8Array | string) {
  if (!/^[a-z]+$/.test(extension)) throw new Error('Invalid export format.');
  const folder = path.join(documents, 'Kite Boards'); await mkdir(folder, { recursive: true });
  for (let i = 1; i <= 1000; i++) { const filename = path.join(folder, `${safeFilename(title.slice(0, 80) || 'Whiteboard')}${i === 1 ? '' : ` (${i})`}.${extension}`);
    let file; try { file = await open(filename, 'wx'); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue; throw error; }
    try { await file.writeFile(bytes); } finally { await file.close(); } return filename;
  } throw new Error('Too many boards with that name.');
}
/** PNG is the only renderer content placed in the handout; notes/title are escaped and scripts/network are disabled. */
export async function boardPdf(title: string, png: Uint8Array, notes: string[]): Promise<Uint8Array> {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  try { const html = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>@page{size:A4;margin:16mm}body{font:12pt system-ui;color:#111}h1{font-size:22pt}img{width:100%;max-height:230mm;object-fit:contain}section{break-before:page}li{break-inside:avoid;margin:0 0 12pt;line-height:1.5}</style><h1>${xml(title)}</h1><img alt="${xml(title)}" src="data:image/png;base64,${Buffer.from(png).toString('base64')}"><section><h2>Lesson notes</h2><ol>${notes.map(note => `<li>${xml(note)}</li>`).join('')}</ol></section>`;
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`); return await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', preferCSSPageSize: true });
  } finally { win.destroy(); }
}
/** A dedicated sandboxed Excalidraw window makes keyboard paste target the editor, never an unrelated foreground app. */
export async function openInExcalidraw(json: string, signal = AbortSignal.timeout(30000)) {
  signal.throwIfAborted();
  const win = new BrowserWindow({ title: 'Kite board in Excalidraw', width: 1200, height: 850, show: true,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: `excalidraw-${Date.now()}` } });
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== 'https://excalidraw.com') event.preventDefault(); });
  try { await win.loadURL('https://excalidraw.com');
  let ready = false; for (let i = 0; i < 100 && !ready; i++) { signal.throwIfAborted(); if (win.isDestroyed()) throw new Error('Excalidraw was closed.');
    ready = await win.webContents.executeJavaScript("!!document.querySelector('.excalidraw canvas')"); if (!ready) await new Promise(r => setTimeout(r,100)); }
  if (!ready) throw new Error('Excalidraw did not become ready. Save the .excalidraw file instead.');
  // Only a read of readiness is injected. The transfer itself uses a localized Ctrl+V keyboard event.
  await pasteText(electronClipboard, json, signal, () => { win.focus(); win.webContents.focus();
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'V', modifiers: ['control'] }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'V', modifiers: ['control'] }); }, ms => new Promise(r => setTimeout(r,Math.max(ms,1000))));
  } catch (error) { if (!win.isDestroyed()) win.destroy(); throw error; }
}
