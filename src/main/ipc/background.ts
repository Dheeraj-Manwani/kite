import { dialog, ipcMain, shell } from 'electron';
import { writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { backgroundIdSchema } from '../../shared/background';
import { BackgroundRunService } from '../background/service';
import { backgroundHealth } from '../background/health';
import { trusted } from './trust';
import { getSettingsWindow } from '../window/settings';

export function registerBackgroundIPC(service: BackgroundRunService) {
  let available = true;
  const allowed: typeof trusted = (event, kind) => available && trusted(event, kind);
  const denied = () => ({ ok: false, error: 'Invalid or untrusted request.' });
  ipcMain.handle('background:snapshot', e => allowed(e, 'either') ? service.snapshot() : null);
  ipcMain.handle('background:health', e => allowed(e, 'settings') ? backgroundHealth() : null);
  ipcMain.handle('background:detail', (e, id, after = 0) => allowed(e, 'settings') && backgroundIdSchema.safeParse(id).success && Number.isSafeInteger(after) && after >= 0 ? service.detail(id, after) : null);
  ipcMain.handle('background:saveAgent', (e, input) => allowed(e, 'settings') ? service.saveAgent(input) : denied());
  ipcMain.handle('background:archiveAgent', (e, id, revision) => allowed(e, 'settings') && backgroundIdSchema.safeParse(id).success && Number.isSafeInteger(revision) && revision > 0 ? service.archiveAgent(id, revision) : denied());
  ipcMain.handle('background:start', (e, input) => allowed(e, 'either') ? service.enqueue(input) : denied());
  ipcMain.handle('background:control', (e, input) => allowed(e, 'either') ? service.control(input) : denied());
  ipcMain.handle('background:answer', (e, input) => allowed(e, 'settings') ? service.answer(input) : denied());
  ipcMain.handle('background:chooseFiles', async e => {
    const owner = getSettingsWindow(); if (!allowed(e, 'settings') || !owner) return { ok: false, files: [] };
    const result = await dialog.showOpenDialog(owner, { title: 'Choose text files for your agent', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Text and Markdown', extensions: ['txt', 'md'] }] });
    if (result.canceled) return { ok: true, files: [] };
    if (!allowed(e, 'settings')) return denied();
    try { return { ok: true, files: await service.attachFiles(result.filePaths) }; }
    catch { return { ok: false, error: 'Choose up to eight nonempty UTF-8 .txt or .md files, each at most 100,000 characters and 2 MB.', files: [] }; }
  });
  const artifactRequest = z.object({ runId: backgroundIdSchema, artifactId: z.string().max(80), action: z.enum(['open', 'reveal', 'save']) }).strict();
  ipcMain.handle('background:artifact', async (e, value) => {
    const parsed = artifactRequest.safeParse(value); if (!allowed(e, 'settings') || !parsed.success) return denied();
    const { runId, artifactId, action } = parsed.data;
    const filename = await service.artifactPath(runId, artifactId); if (!filename) return { ok: false, error: 'The saved PDF is missing or changed. Retry the run to recreate it.' };
    if (!allowed(e, 'settings')) return denied();
    if (action === 'reveal') { shell.showItemInFolder(filename); return { ok: true }; }
    if (action === 'open') { const error = await shell.openPath(filename); return { ok: !error, ...(error ? { error: 'Windows could not open the PDF.' } : {}) }; }
    const owner = getSettingsWindow(); if (!owner) return denied();
    const artifact = service.detail(runId)?.run.artifacts.find(a => a.id === artifactId);
    const chosen = await dialog.showSaveDialog(owner, { title: 'Save a copy of your PDF', defaultPath: artifact?.name, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (chosen.canceled || !chosen.filePath) return { ok: true };
    if (!allowed(e, 'settings')) return denied();
    const bytes = await service.artifactBytes(runId, artifactId); if (!bytes) return denied();
    // Exclusive create: overwriting is deliberately a separate capability, not implied by Save a copy.
    try { await writeFile(chosen.filePath, bytes, { flag: 'wx' }); return { ok: true }; }
    catch { return { ok: false, error: 'Choose a new filename; Save a copy does not overwrite existing files.' }; }
  });
  return () => { available = false; };
}
