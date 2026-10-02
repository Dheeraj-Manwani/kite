import { dialog, ipcMain } from 'electron';
import { writeFile } from 'node:fs/promises';
import { trusted } from './trust';
import { getSettingsWindow } from '../window/settings';
import type { MemoryStore } from '../memory/store';
import type { OperationResult } from '../../shared/types';
/**
 * The Memory view (docs/end-to-end-jobs.md §3.4): list, edit, delete, delete everything, export; and the overlay's Undo.
 * Values go only to Kite's own windows, never to a model.
 */
export function registerMemoryIPC(memory: MemoryStore) {
  const idOK = (id: unknown): id is number => Number.isSafeInteger(id) && (id as number) > 0;
  ipcMain.handle('memory:list', e => trusted(e, 'settings') ? memory.facts() : []);
  ipcMain.handle('memory:edit', (e, id: unknown, patch: unknown): OperationResult => {
    const p = patch as { label?: unknown; value?: unknown } | null;
    if (!trusted(e, 'settings') || !idOK(id) || !p || typeof p !== 'object' || Object.keys(p).some(k => k !== 'label' && k !== 'value')
      || (p.label !== undefined && (typeof p.label !== 'string' || !p.label.trim() || p.label.length > 80))
      || (p.value !== undefined && (typeof p.value !== 'string' || !p.value.trim() || p.value.length > 500))) return { ok: false, error: 'Invalid change.' };
    const result = memory.edit(id, { label: p.label as string | undefined, value: p.value as string | undefined });
    return result.ok === false ? { ok: false, error: result.reason } : { ok: true };
  });
  ipcMain.handle('memory:delete', async (e, id: unknown): Promise<OperationResult> => {
    if (!trusted(e, 'settings') || !(id === null || idOK(id))) return { ok: false };
    if (id === null) {
      const choice = await dialog.showMessageBox(getSettingsWindow(), { type: 'warning', buttons: ['Cancel', 'Forget everything'], defaultId: 0, cancelId: 0,
        message: 'Forget everything Kite remembers about you?', detail: 'Your profile, addresses and preferences are removed from this PC. Conversations in History keep what was said in them.' });
      if (choice.response !== 1) return { ok: false };
      memory.forgetAll(); return { ok: true };
    }
    return { ok: memory.forget(id as number) };
  });
  ipcMain.handle('memory:export', async (e): Promise<OperationResult> => {
    if (!trusted(e, 'settings')) return { ok: false };
    const result = await dialog.showSaveDialog(getSettingsWindow(), { defaultPath: 'Kite memory.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (result.canceled || !result.filePath) return { ok: false };
    const facts = memory.facts().map(({ kind, key, label, value, source, created, updated }) => ({ kind, key, label, value, source, created: new Date(created).toISOString(), updated: new Date(updated).toISOString() }));
    try { await writeFile(result.filePath, JSON.stringify({ exported: new Date().toISOString(), facts }, null, 2), 'utf8'); return { ok: true }; }
    catch { return { ok: false, error: 'Could not export to that location.' }; }
  });
  ipcMain.handle('memory:undo', (e, token: unknown): OperationResult => trusted(e, 'overlay') && typeof token === 'string' && token.length <= 64 ? { ok: memory.undo(token) } : { ok: false });
}
