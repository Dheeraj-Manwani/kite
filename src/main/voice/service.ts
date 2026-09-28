import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, session, Notification } from 'electron';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { openSecrets } from '../settings/secrets';
import { openDatabase } from '../storage/database';
import { Conversation } from '../ai/conversation';
import { transcribeAudio } from '../ai/transcribe';
import { ask } from '../ai/ask';
import { VoiceController } from './controller';
import { startPttHook } from '../input/hook';
import { getOverlayWindow } from '../window/overlay';
import { trusted } from '../ipc/trust';
import { isAppURL } from '../window/renderer';
import { settingsConfig } from '../settings/config';
import type { AppSettings, OperationResult, SecretId } from '../../shared/types';

import { configureProviders } from '../ai/providers';
import { providerIds, describeModel } from '../ai/catalog';
import { openPreferences } from '../settings/preferences';
import { listModels, listVoices, testKey } from '../ai/discovery';
import { TTSService } from './tts';
import { createKiteTray } from '../tray';
import { z } from 'zod';
import { ApprovalBroker } from '../tools/approval';
import { AppIndex } from '../tools/appIndex';
import { ToolSession, waitForTools } from '../tools/registry';
import { createTools } from '../tools/platform';
import { ReminderScheduler } from '../tools/reminders';
const validProvider = (value: unknown): value is SecretId => [...providerIds, 'cartesia'].includes(value as SecretId);
export function startVoiceService() {
  const secrets = openSecrets();
  try { secrets.assertAvailable(); } catch {
    dialog.showErrorBox('Kite: secure storage unavailable', 'OS encryption is unavailable. API keys cannot be saved. No plaintext fallback will be used.');
  }
  const history = openDatabase(path.join(app.getPath('userData'), 'kite.db'));
  configureProviders(secrets);
  const preferences = openPreferences(id => secrets.hasKey(id));
  let ownsEscape = false;
  const emit = (event: import('../../shared/types').VoiceEvent) => { const win = getOverlayWindow(); if (win && !win.isDestroyed()) win.webContents.send(event.type, event); };
  const tts = new TTSService(() => secrets.getKey('cartesia'), event => controller.ttsEvent(event));
  const apps = new AppIndex(); void apps.scan();
  const approvals = new ApprovalBroker(card => controller.presentApproval(card), (card, decision) => controller.approvalDecision(card, decision));
  const reminders = new ReminderScheduler(history, reminder => {
    try { if (Notification.isSupported()) new Notification({ title: 'Kite reminder', body: reminder.label }).show(); }
    catch { console.warn('Kite could not show a Windows notification; delivering the reminder in the overlay.'); }
    controller.reminder(reminder);
  }, () => preferences.get().dryRun);
  const auditChanged = () => {
    const overlay = getOverlayWindow(); if (overlay && !overlay.isDestroyed()) overlay.webContents.send('tools:changed', history.recentTools());
    reminders.refresh();
  };
  const controller = new VoiceController({
    approvals,
    tools: (messageId, signal, activity) => new ToolSession({ definitions: createTools(apps, history, preferences.get()), broker: approvals,
      audit: history, messageId, context: { dryRun: preferences.get().dryRun, signal }, activity, changed: auditChanged,
      event: (type, name, result) => { if (!signal.aborted) controller.toolEvent(type, name, result); } }),
    getKey: provider => secrets.getKey(provider), history,
    conversation: new Conversation(randomUUID, settingsConfig.contextMessages, settingsConfig.inactivityMs),
    transcribe: transcribeAudio, ask, tts,
    settings: preferences.get, describe: model => describeModel(model, preferences.snapshot().models),
    emit,
    setEscape: (active, abort) => {
      if (ownsEscape) globalShortcut.unregister('Escape');
      ownsEscape = false;
      if (active) {
        ownsEscape = globalShortcut.register('Escape', abort);
        if (!ownsEscape) console.warn('Kite could not register Escape for this interaction.');
      }
    },
  });
  const tray = createKiteTray(preferences);
  // Wait until the overlay can receive restored overdue reminders.
  getOverlayWindow()?.webContents.once('did-finish-load', () => reminders.refresh());
  const decisionSchema = z.object({ id: z.string().uuid(), approved: z.boolean() }).strict();
  ipcMain.handle('tools:approve', (event, input: unknown): OperationResult => {
    const parsed = decisionSchema.safeParse(input);
    if (!trusted(event, 'overlay') || !parsed.success) return { ok: false, error: 'Invalid approval.' };
    return { ok: controller.decideApproval(parsed.data.id, parsed.data.approved) };
  });
  ipcMain.handle('tools:recent', event => trusted(event, 'overlay') && !app.isPackaged ? history.recentTools() : []);
  ipcMain.handle('tools:dryRun', (event, input: unknown): OperationResult => {
    const parsed = z.boolean().safeParse(input);
    if (!trusted(event, 'overlay') || app.isPackaged || !parsed.success) return { ok: false };
    preferences.update({ dryRun: parsed.data }); return { ok: true };
  });
  ipcMain.handle('apps:rescan', async (event): Promise<OperationResult> => {
    if (!trusted(event, 'settings')) return { ok: false };
    await apps.scan(); return { ok: true };
  });
  ipcMain.on('reminder:dismiss', event => { if (trusted(event, 'overlay')) controller.dismissReminder(); });
  const unsubscribe = preferences.subscribe((snapshot, old) => {
    if (snapshot.settings.dryRun !== old.dryRun) { controller.cancel('voice:aborted'); reminders.refresh(); }
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('settings:changed', snapshot);
    tray.update();
    if (old.ttsEnabled && !snapshot.settings.ttsEnabled) controller.mute();
    if (old.model.provider !== snapshot.settings.model.provider || old.model.id !== snapshot.settings.model.id) {
      controller.preview(`Running on ${describeModel(snapshot.settings.model, snapshot.models).label} now!`, true);
    }
  });
  ipcMain.handle('settings:get', event => trusted(event, 'either') ? preferences.snapshot() : null);
  ipcMain.handle('settings:update', (event, patch: Partial<AppSettings>): OperationResult => {
    if (!trusted(event, 'settings')) return { ok: false };
    try { preferences.update(patch); return { ok: true }; } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Invalid settings.' }; }
  });
  ipcMain.handle('providers:test', async (event, provider: unknown) => {
    if (!trusted(event, 'settings') || !validProvider(provider)) return { status: 'invalid key' };
    try { return await testKey(provider, secrets.getKey(provider), preferences.get().voiceId); } catch { return { status: 'invalid key' }; }
  });
  ipcMain.handle('models:refresh', async (event, provider: unknown): Promise<OperationResult> => {
    if (!trusted(event, 'settings') || !validProvider(provider) || provider === 'cartesia') return { ok: false };
    try { const key = secrets.getKey(provider); if (!key) return { ok: false, error: 'Save a key first.' };
      preferences.cacheModels(await listModels(provider, key)); return { ok: true };
    } catch { return { ok: false, error: 'Could not refresh models. Test your key and connection.' }; }
  });
  ipcMain.handle('voices:refresh', async (event): Promise<OperationResult> => {
    if (!trusted(event, 'settings')) return { ok: false };
    try { const key = secrets.getKey('cartesia'); if (!key) return { ok: false, error: 'Save a Cartesia key first.' };
      const voices = await listVoices(key); preferences.cacheVoices(voices);
      if (!preferences.get().voiceId && voices[0]) preferences.update({ voiceId: voices[0].id });
      return { ok: true };
    } catch { return { ok: false, error: 'Could not refresh voices. Test your key and connection.' }; }
  });
  ipcMain.handle('voice:preview', (event): OperationResult => {
    if (!trusted(event, 'settings')) return { ok: false };
    if (!preferences.get().ttsEnabled) return { ok: false, error: 'Turn voice on to preview.' };
    controller.preview('Hi, I’m Kite. Ready when you are!'); return { ok: true };
  });
  ipcMain.on('tts:playback', (event, id: number, type: 'started' | 'ended' | 'failed') => {
    if (trusted(event, 'overlay') && Number.isSafeInteger(id) && ['started', 'ended', 'failed'].includes(type)) controller.playback(id, type);
  });
  ipcMain.handle('secrets:has' , (event, provider: unknown) => {
    if (!trusted(event, 'either') || !validProvider(provider)) return false;
    return secrets.hasKey(provider);
  });
  ipcMain.handle('secrets:set', (event, provider: unknown, key: unknown): OperationResult => {
    if (!trusted(event, 'settings') || !validProvider(provider) || typeof key !== 'string') return { ok: false, error: 'Invalid key request.' };
    try { secrets.setKey(provider, key); if (provider === 'cartesia') { controller.mute(); tts.close(); } preferences.notify(); return { ok: true }; }
    catch { return { ok: false, error: 'Could not encrypt and save this key. Check OS encryption and enter a valid key.' }; }
  });
  ipcMain.handle('secrets:delete', (event, provider: unknown): OperationResult => {
    if (!trusted(event, 'settings') || !validProvider(provider)) return { ok: false, error: 'Invalid request.' };
    try { secrets.deleteKey(provider); if (provider === 'cartesia') { controller.mute(); tts.close(); if (preferences.get().ttsEnabled) preferences.update({ ttsEnabled: false }); } preferences.notify(); return { ok: true }; }
    catch { return { ok: false, error: 'Could not delete the saved key.' }; }
  });
  ipcMain.handle('voice:submit', async (event, buffer: unknown, id: unknown): Promise<OperationResult> => {
    if (!trusted(event, 'overlay') || !Number.isSafeInteger(id) || !(buffer instanceof ArrayBuffer) || !buffer.byteLength || buffer.byteLength > settingsConfig.maxAudioBytes) {
      return { ok: false, error: 'Invalid or oversized recording.' };
    }
    await controller.submit(id as number, buffer);
    return { ok: true };
  });
  ipcMain.on('voice:audioResult', (event, id: number, result: 'empty' | 'micDenied' | 'captureFailed') => {
    if (trusted(event, 'overlay') && Number.isSafeInteger(id) && ['empty', 'micDenied', 'captureFailed'].includes(result)) controller.audioResult(id, result);
  });
  ipcMain.handle('dev:recentMessages', (event): OperationResult => {
    if (app.isPackaged || !trusted(event, 'overlay')) return { ok: false };
    try { console.log('Kite last 10 messages:', history.recent()); return { ok: true }; }
    catch { return { ok: false, error: 'Could not read history.' }; }
  });
  ipcMain.handle('bubble:copy', async (event, text: unknown): Promise<OperationResult> => {
    if (!trusted(event, 'overlay') || typeof text !== 'string' || text.length > 64000) return { ok: false };
    try { await clipboard.writeText(text); return { ok: true }; } catch { return { ok: false, error: 'Could not copy text.' }; }
  });
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(permission === 'media' && webContents === getOverlayWindow()?.webContents
      && isAppURL(webContents.getURL()) && isAppURL(details.requestingUrl)
      && 'mediaTypes' in details && details.mediaTypes.every(type => type === 'audio'));
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission, _origin, details) =>
    permission === 'media' && webContents === getOverlayWindow()?.webContents
      && isAppURL(webContents.getURL()) && isAppURL(details.requestingUrl ?? webContents.getURL())
      && details.mediaType === 'audio');
  const stopHook = startPttHook(action => {
    if (action === 'start') controller.start();
    else if (action === 'stop') controller.stop();
    else if (action === 'escape') controller.cancel('voice:aborted');
    else controller.cancel(action === 'tooShort' ? 'ptt:tooShort' : 'ptt:cancel');
  });
  const reset = () => controller.cancel();
  const overlay = getOverlayWindow();
  overlay?.webContents.on('did-start-loading', reset);
  overlay?.webContents.on('render-process-gone', reset);
  overlay?.on('closed', reset);
  return async () => { stopHook(); reminders.stop(); unsubscribe(); await controller.shutdown(); await waitForTools(); tts.close(); tray.destroy(); history.close(); };
}
