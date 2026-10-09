import { dialog, ipcMain, shell } from 'electron';
import { writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { backgroundIdSchema } from '../../shared/background';
import { BackgroundRunService } from '../background/service';
import { backgroundHealth } from '../background/health';
import { trusted } from './trust';
import { getSettingsWindow } from '../window/settings';
import type { DocumentPreview } from '../background/preview';
import { DocumentFailure } from '../background/executors/documentTypes';

export function registerBackgroundIPC(service: BackgroundRunService, preview?: DocumentPreview) {
  let available = true;
  const allowed: typeof trusted = (event, kind) => available && trusted(event, kind);
  const denied = () => ({ ok: false, error: 'Invalid or untrusted request.' });
  ipcMain.handle('background:snapshot', e => allowed(e, 'either') ? service.snapshot() : null);
  ipcMain.handle('background:health', e => allowed(e, 'settings') ? backgroundHealth() : null);
  ipcMain.handle('background:detail', (e, id, after = 0) => allowed(e, 'settings') && backgroundIdSchema.safeParse(id).success && Number.isSafeInteger(after) && after >= 0 ? service.detail(id, after) : null);
  ipcMain.handle('background:saveSchedule', (e, input) => allowed(e, 'settings') ? service.saveSchedule(input) : denied());
  ipcMain.handle('background:controlSchedule', (e, input) => allowed(e, 'settings') ? service.controlSchedule(input) : denied());
  ipcMain.handle('background:scheduleHistory', (e, input) => allowed(e, 'settings') ? service.scheduleHistory(input) : null);
  ipcMain.handle('background:saveAgent', (e, input) => allowed(e, 'settings') ? service.saveAgent(input) : denied());
  ipcMain.handle('background:archiveAgent', (e, id, revision) => allowed(e, 'settings') && backgroundIdSchema.safeParse(id).success && Number.isSafeInteger(revision) && revision > 0 ? service.archiveAgent(id, revision) : denied());
  ipcMain.handle('background:start', (e, input) => allowed(e, 'either') ? service.enqueue(input) : denied());
  ipcMain.handle('background:control', (e, input) => allowed(e, 'either') ? service.control(input) : denied());
  ipcMain.handle('background:answer', (e, input) => allowed(e, 'settings') ? service.answer(input) : denied());
  ipcMain.handle('background:chooseFiles', async e => {
    const owner = getSettingsWindow(); if (!allowed(e, 'settings') || !owner) return { ok: false, files: [] };
    const result = await dialog.showOpenDialog(owner, { title: 'Choose documents for your agent', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Supported documents', extensions: ['txt', 'md', 'pdf', 'png', 'jpg', 'jpeg'] }, { name: 'PDF', extensions: ['pdf'] }, { name: 'Text and images', extensions: ['txt', 'md', 'png', 'jpg', 'jpeg'] }] });
    if (result.canceled) return { ok: true, files: [] };
    if (!allowed(e, 'settings')) return { ...denied(), files: [] };
    try { return { ok: true, files: await service.attachFiles(result.filePaths) }; }
    catch (error) { return { ok: false, error: error instanceof DocumentFailure ? error.message : error instanceof Error && /^(Choose|The file|This release|Start your)/.test(error.message) ? error.message : 'Choose valid UTF-8 text files up to 2 MB, or plain PDFs and PNG/JPEG images up to 5 MB; up to eight files and 16 MB total.', files: [] }; }
  });
  const artifactRequest = z.object({ runId: backgroundIdSchema, artifactId: z.string().max(80), action: z.enum(['preview', 'open', 'reveal', 'save']) }).strict();
  ipcMain.handle('background:artifact', async (e, value) => {
    const parsed = artifactRequest.safeParse(value); if (!allowed(e, 'settings') || !parsed.success) return denied();
    const { runId, artifactId, action } = parsed.data;
    const filename = await service.artifactPath(runId, artifactId); if (!filename) return { ok: false, error: 'The saved file is missing or changed. Retry the run to recreate it.' };
    if (!allowed(e, 'settings')) return denied();
    const recorded = service.detail(runId)?.run.artifacts.find(a => a.id === artifactId);
    if (!recorded) return denied();
    if (recorded.mediaType !== 'application/pdf' && (action === 'preview' || action === 'open')) return { ok: false, error: 'Mail attachments are untrusted downloads. Save a copy to inspect them in an appropriate application.' };
    if (action === 'preview') {
      const bytes = await service.artifactBytes(runId, artifactId); if (!bytes || !preview || !allowed(e, 'settings')) return denied();
      try { await preview.open(bytes, service.detail(runId).run.artifacts.find(a => a.id === artifactId).name); return { ok: true }; }
      catch { return { ok: false, error: 'The PDF preview could not open. Try Open or Save a copy.' }; }
    }
    if (action === 'reveal') { shell.showItemInFolder(filename); return { ok: true }; }
    if (action === 'open') { const error = await shell.openPath(filename); return { ok: !error, ...(error ? { error: 'Windows could not open the PDF.' } : {}) }; }
    const owner = getSettingsWindow(); if (!owner) return denied();
    const artifact = service.detail(runId)?.run.artifacts.find(a => a.id === artifactId);
    const chosen = await dialog.showSaveDialog(owner, { title: 'Save a copy of your file', defaultPath: artifact?.name, ...(artifact?.mediaType === 'application/pdf' ? { filters: [{ name: 'PDF', extensions: ['pdf'] }] } : {}) });
    if (chosen.canceled || !chosen.filePath) return { ok: true };
    if (!allowed(e, 'settings')) return denied();
    const bytes = await service.artifactBytes(runId, artifactId); if (!bytes) return denied();
    // Exclusive create: overwriting is deliberately a separate capability, not implied by Save a copy.
    try { await writeFile(chosen.filePath, bytes, { flag: 'wx' }); return { ok: true }; }
    catch { return { ok: false, error: 'Choose a new filename; Save a copy does not overwrite existing files.' }; }
  });
  return () => { available = false; };
}
