import { app, ipcMain, shell } from 'electron';
import type { AboutInfo, SecretId } from '../../shared/types';
import { appRuntime, openLogs, reportProblem, restartToUpdate } from '../runtime';
import { trusted } from './trust';

// "Get a key" opens only these pages; the renderer sends a provider id, never a URL.
const keyPages: Record<SecretId, string> = {
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  google: 'https://aistudio.google.com/apikey',
  groq: 'https://console.groq.com/keys',
  moonshot: 'https://platform.moonshot.ai/console/api-keys',
  cartesia: 'https://play.cartesia.ai/keys',
};

/** Settings → About and the provider rows' "Get a key" links (docs/ui-ux-improvements.md UX-50, UX-51). */
export function registerAboutIPC() {
  ipcMain.handle('about:get', (event): AboutInfo | null => trusted(event, 'settings')
    ? { version: app.getVersion(), updateStatus: appRuntime.updateStatus, updateReady: appRuntime.updateReady } : null);
  ipcMain.on('about:action', (event, action: unknown) => {
    if (!trusted(event, 'settings')) return;
    if (action === 'logs') void openLogs();
    else if (action === 'report') void reportProblem();
    else if (action === 'restart') restartToUpdate();
  });
  ipcMain.on('keys:page', (event, provider: unknown) => {
    if (trusted(event, 'settings') && typeof provider === 'string' && Object.hasOwn(keyPages, provider)) void shell.openExternal(keyPages[provider as SecretId]);
  });
}
