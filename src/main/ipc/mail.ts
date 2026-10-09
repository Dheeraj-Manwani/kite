import { dialog, ipcMain, shell } from 'electron';
import { open } from 'node:fs/promises';
import { z } from 'zod';
import type { GmailConnector } from '../connectors/mail/gmail';
import { MailFailure } from '../connectors/mail/errors';
import type { BackgroundRunService } from '../background/service';
import { trusted } from './trust';
import { getSettingsWindow } from '../window/settings';
import { backgroundIdSchema } from '../../shared/background';

export function registerMailIPC(service: BackgroundRunService, mail?: GmailConnector) {
  let available = true;
  const allowed: typeof trusted = (event, kind) => available && trusted(event, kind);
  const denied = () => ({ ok: false, error: 'Mail accounts are unavailable or this request is untrusted.' });
  const accountRequest = z.object({ id: z.string().uuid(), revision: z.number().int().positive() }).strict();
  const safely = async (action: () => Promise<unknown>) => { try { return await action(); } catch (error) { return { ok: false, error: error instanceof MailFailure ? error.message : 'Mail action could not finish. Try again after checking your setup.' }; } };
  ipcMain.handle('mail:state', e => allowed(e, 'settings') && mail ? mail.state() : null);
  ipcMain.handle('mail:configure', async e => {
    const owner = getSettingsWindow(); if (!owner || !allowed(e, 'settings') || !mail) return denied();
    const selected = await dialog.showOpenDialog(owner, { title: 'Import Google Desktop OAuth client JSON', properties: ['openFile'], filters: [{ name: 'Google OAuth client', extensions: ['json'] }] });
    if (selected.canceled) return { ok: true };
    if (!allowed(e, 'settings') || selected.filePaths.length !== 1) return denied();
    return safely(async () => {
      const file = await open(selected.filePaths[0], 'r');
      try {
        const stat = await file.stat(); if (!stat.isFile() || stat.size > 64 * 1024) throw new MailFailure('setup');
        const bytes = Buffer.alloc(stat.size + 1), read = await file.read(bytes, 0, bytes.length, 0); if (read.bytesRead !== stat.size) throw new MailFailure('setup');
        let value: unknown; try { value = JSON.parse(bytes.subarray(0, read.bytesRead).toString('utf8')); } catch { throw new MailFailure('setup'); }
        if (!allowed(e, 'settings')) return denied(); mail.configure(value); return { ok: true };
      } finally { await file.close(); }
    });
  });
  ipcMain.handle('mail:connect', (e, input) => {
    if (!allowed(e, 'settings') || !mail || (input !== undefined && !accountRequest.safeParse(input).success)) return denied();
    return safely(async () => { await mail.connect(input?.id, input?.revision); return { ok: true }; });
  });
  ipcMain.handle('mail:cancelConnect', e => { if (!allowed(e, 'settings') || !mail) return denied(); mail.cancelConnect(); return { ok: true }; });
  ipcMain.handle('mail:disconnect', (e, input) => {
    const parsed = accountRequest.safeParse(input); if (!allowed(e, 'settings') || !mail || !parsed.success) return denied();
    return safely(async () => { const result = await mail.disconnect(parsed.data.id, parsed.data.revision); return { ok: true, ...(!result.revoked ? { error: 'Disconnected on this PC. Google revocation could not be confirmed; remove the app grant in your Google account.' } : {}) }; });
  });
  const source = z.object({ runId: backgroundIdSchema, messageId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/) }).strict();
  ipcMain.handle('mail:source', (e, input) => {
    const parsed = source.safeParse(input); if (!allowed(e, 'settings') || !mail || !parsed.success) return denied();
    const briefing = service.detail(parsed.data.runId)?.briefing, message = briefing?.messages.find(m => m.id === parsed.data.messageId);
    if (!message || !briefing) return denied();
    return safely(async () => { await shell.openExternal(mail.sourceUrl(briefing.email, message.threadId)); return { ok: true }; });
  });
  return () => { available = false; };
}
