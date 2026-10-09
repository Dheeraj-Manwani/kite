import { app, Notification, powerMonitor, shell } from 'electron';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { BackgroundRunService } from './service';
import { BackgroundStore } from './store';
import { PdfExecutor } from './executors/pdf';
import { osCipher } from '../settings/secrets';
import { appRuntime, appEvent } from '../runtime';
import { getOverlayWindow } from '../window/overlay';
import { createSettingsWindow, getSettingsWindow } from '../window/settings';
import { registerBackgroundIPC } from '../ipc/background';
import { openPreferences } from '../settings/preferences';
import { DocumentExecutor } from './executors/documents';
import { DocumentFailure } from './executors/documentTypes';
import { DocumentPreview } from './preview';
import { hashOf } from './artifacts';
import { MailStore } from '../connectors/mail/store';
import { GmailConnector } from '../connectors/mail/gmail';
import { registerMailIPC } from '../ipc/mail';
import { statusLabels } from '../../shared/background';
import { CareerDiscovery } from './career/discovery';
import { CareerBrowser } from './career/browser';
import { registerCareerIPC } from '../ipc/career';

let background: BackgroundRunService | null = null;
export const getBackgroundService = () => background;
export function startBackgroundService() {
  const root = path.join(app.getPath('userData'), 'agent-artifacts'); mkdirSync(root, { recursive: true });
  const store = new BackgroundStore(path.join(app.getPath('userData'), 'background.db'), osCipher), pdf = new PdfExecutor(), documents = new DocumentExecutor(), preview = new DocumentPreview();
  let mailStore: MailStore, mail: GmailConnector;
  const changed = (id?: string) => { if (id) service?.mailChanged(id); for (const win of [getOverlayWindow(), getSettingsWindow()]) if (win && !win.isDestroyed()) win.webContents.send('background:changed'); };
  try { mailStore = new MailStore(path.join(app.getPath('userData'), 'mail.db'), osCipher); mail = new GmailConnector(mailStore, url => shell.openExternal(url), changed); } catch { /* Keep document workflows usable if mail storage needs repair. */ }
  const browser: CareerBrowser = new CareerBrowser((id, destination): boolean => service.applicationMutation(id, destination));
  const service: BackgroundRunService = new BackgroundRunService({ store, root, mail, career: new CareerDiscovery(), browser,
    inspect: (input, bytes) => documents.inspect({ kind: input.kind as 'pdf' | 'png' | 'jpeg', bytes }),
    convert: async (input, style, signal, agent) => {
      if (!input.kind || input.kind === 'text') return pdf.convert({ name: input.name, text: input.text }, style, signal);
      const bytes = store.source(input.sourceId);
      if (!bytes || bytes.length !== input.bytes || hashOf(bytes) !== input.hash) throw new DocumentFailure('invalid');
      return documents.convert({ action: agent.workflow === 'pdf_optimize' ? 'optimize' : 'convert', kind: input.kind, bytes, targetBytes: agent.targetBytes }, signal);
    },
    changed: () => changed(),
    notice: run => {
      const text = `${run.agentName}: ${['inbox_briefing', 'career_scout', 'job_application'].includes(run.workflow) ? statusLabels[run.status] : run.message}`;
      appEvent({ type: 'background:notice', text });
      if (!process.env.KITE_TEST_MODE && Notification.isSupported()) {
        const notice = new Notification({ title: run.status === 'waiting_user' ? 'Kite needs your input' : 'Kite agent update', body: text });
        notice.on('click', () => createSettingsWindow('agents')); notice.show();
      }
    },
  });
  // Load persisted policy independently: a voice startup failure must not fall back to permissive defaults.
  const preferences = openPreferences(() => false);
  service.setSettings(() => ({ permissions: preferences.get().permissions, dryRun: preferences.get().dryRun }));
  background = service; const stopIPC = registerBackgroundIPC(service, preview);
  const stopMailIPC = registerMailIPC(service, mail);
  const stopCareerIPC = registerCareerIPC(service);
  appRuntime.backgroundPause = value => service.setPaused(value);
  const suspend = () => service.setPaused(true, 'sleep'), resume = () => service.setPaused(false, 'sleep');
  powerMonitor.on('suspend', suspend); powerMonitor.on('resume', resume);
  // Dispatch after app composition has supplied the live settings provider.
  queueMicrotask(() => service.start());
  return async () => {
    stopIPC();
    stopMailIPC();
    stopCareerIPC();
    powerMonitor.removeListener('suspend', suspend); powerMonitor.removeListener('resume', resume);
    await service.shutdown(); await mail?.close(); pdf.close(); documents.close(); preview.close(); mailStore?.close(); store.close(); background = null; appRuntime.backgroundPause = () => undefined;
  };
}
