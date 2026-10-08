import { app, dialog, ipcMain } from 'electron';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { trusted } from './trust';
import type { openDatabase } from '../storage/database';
import { getSettingsWindow } from '../window/settings';
export function registerHistoryIPC(db: ReturnType<typeof openDatabase>, reset: () => Promise<void>) {
  const idOK = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && id.length <= 100;
  ipcMain.handle('history:list', (e, query = '') => trusted(e, 'settings') && typeof query === 'string' && query.length <= 300 ? db.listConversations(query) : []);
  ipcMain.handle('history:detail', (e, id) => trusted(e, 'settings') && idOK(id) ? db.detail(id) : { messages: [], tools: [] });
  // The marked screenshot kept with a question (UX-74), as a data URL; only files inside the screens folder are read.
  ipcMain.handle('history:screenshot', async (e, messageId) => {
    if (!trusted(e, 'settings') || !Number.isSafeInteger(messageId) || messageId < 1) return null;
    const file = db.screenshot(messageId); if (!file) return null;
    const root = path.resolve(app.getPath('userData'), 'screens'), resolved = path.resolve(file), relative = path.relative(root, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
    try { return `data:image/jpeg;base64,${(await readFile(resolved)).toString('base64')}`; } catch { return null; }
  });
  ipcMain.handle('history:delete', async (e, id) => {
    if (!trusted(e, 'settings') || !(id === null || idOK(id))) return { ok: false };
    const choice = await dialog.showMessageBox(getSettingsWindow(), { type: 'warning', buttons: ['Cancel', 'Delete'], defaultId: 0, cancelId: 0,
      message: id === null ? 'Delete all conversation history?' : 'Delete this conversation?', detail: 'Messages, saved whiteboards, tool-call history, and retained screenshots will be removed. Created notes and active reminders remain.' });
    if (choice.response !== 1) return { ok: false };
    await reset();
    const root = path.resolve(app.getPath('userData'), 'screens');
    const files = db.deleteHistory(id);
    let ok = true;
    for (const file of files) {
      const resolved = path.resolve(file), relative = path.relative(root, resolved);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) { ok = false; continue; }
      await unlink(resolved).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') ok = false; });
    }
    return { ok, error: ok ? undefined : 'History removed, but a screenshot file could not be removed. Check the screens folder.' };
  });
  ipcMain.handle('history:export', async (e, id) => {
    if (!trusted(e, 'settings') || !idOK(id)) return { ok: false };
    const data = db.detail(id); if (!data.messages.length) return { ok: false, error: 'Conversation not found.' };
    const result = await dialog.showSaveDialog(getSettingsWindow(), { defaultPath: 'Kite conversation.md', filters: [{ name: 'Markdown', extensions: ['md'] }] });
    if (result.canceled || !result.filePath) return { ok: false };
    const markdown = '# Kite conversation\n\n' + data.messages.map(m => `## ${m.role === 'user' ? 'You' : 'Kite'}\n\n${m.content}\n\n_Model: ${m.model}; latency: ${Math.round(m.total_ms ?? 0)} ms_${m.annotation_json ? '\n\nAnnotation: `' + m.annotation_json + '`' : ''}`).join('\n\n')
      + '\n\n## Tool decisions\n\n' + data.tools.map(t => `- ${t.tool}: ${t.decision} — ${t.summary}`).join('\n');
    try { await writeFile(result.filePath, markdown, 'utf8'); return { ok: true }; } catch { return { ok: false, error: 'Could not export to that location.' }; }
  });
}
