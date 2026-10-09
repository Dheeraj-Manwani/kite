import { ipcMain } from 'electron';
import { z } from 'zod';
import { backgroundIdSchema } from '../../shared/background';
import type { BackgroundRunService } from '../background/service';
import { trusted } from './trust';

export function registerCareerIPC(service: BackgroundRunService) {
  let available = true;
  const base = { runId: backgroundIdSchema, revision: z.number().int().positive() };
  const prepare = z.object({ ...base, jobKey: z.string().min(1).max(260) }).strict();
  const browser = z.object({ ...base, action: z.enum(['open', 'check']) }).strict();
  const denied = () => ({ ok: false, error: 'Invalid or untrusted career request.' });
  ipcMain.handle('career:prepare', (e, input) => { const parsed = prepare.safeParse(input); return available && trusted(e, 'settings') && parsed.success ? service.createApplication(parsed.data.runId, parsed.data.revision, parsed.data.jobKey) : denied(); });
  ipcMain.handle('career:alerts', (e, input) => { const parsed = z.object(base).strict().safeParse(input); return available && trusted(e, 'settings') && parsed.success ? service.scoutMailBriefing(parsed.data.runId, parsed.data.revision) : denied(); });
  ipcMain.handle('career:browser', (e, input) => { const parsed = browser.safeParse(input); return available && trusted(e, 'settings') && parsed.success ? service.applicationBrowserAction(parsed.data.runId, parsed.data.revision, parsed.data.action) : denied(); });
  return () => { available = false; };
}
