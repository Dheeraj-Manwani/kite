import { appRuntime, pauseKite, restartToUpdate, openLogs, reportProblem } from './runtime';
import { hotkeyLabel } from '../shared/release';
import { getOverlayWindow } from './window/overlay';
import { nativeTheme } from 'electron';
import path from 'node:path';
import { app, Menu, nativeImage, Tray } from 'electron';
import { createSettingsWindow } from './window/settings';
import type { openPreferences } from './settings/preferences';
import { providerLabels } from './ai/catalog';
export function createKiteTray(preferences: ReturnType<typeof openPreferences>) {
  const icon = () => nativeImage.createFromPath(path.join(app.getAppPath(), 'assets', appRuntime.updateReady ? 'tray-update.png' : nativeTheme.shouldUseDarkColors ? 'tray-dark.png' : 'tray-light.png'));
  const tray = new Tray(icon());
  const update = () => {
    tray.setImage(icon());
    const { settings, models, keys } = preferences.snapshot();
    tray.setToolTip(`Kite · ${appRuntime.pausedUntil ? 'Paused' : settings.ttsEnabled ? 'Voice on' : 'Muted'} · ${hotkeyLabel(settings.hotkey)}`);
    const configured = models.filter(m => keys[m.provider]);
    if (keys[settings.model.provider] && !configured.some(m => m.provider === settings.model.provider && m.id === settings.model.id))
      configured.push({ ...settings.model, label: settings.model.id, tier: 'fast', supportsVision: false, supportsTools: false });
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: settings.ttsEnabled ? 'Voice on (click to mute)' : 'Muted (click to enable voice)', type: 'checkbox', checked: !settings.ttsEnabled, click: () => {
        try { preferences.update({ ttsEnabled: !preferences.get().ttsEnabled }); } catch { createSettingsWindow(); }
      } },
      { label: 'Model', submenu: configured.length ? configured.map(model => ({ label: `${providerLabels[model.provider]} · ${model.label}`,
        type: 'radio' as const, checked: model.provider === settings.model.provider && model.id === settings.model.id,
        click: () => { preferences.update({ model: { provider: model.provider, id: model.id } }); } })) : [{ label: 'Save a provider key in Settings', enabled: false }] },
      { label: appRuntime.pausedUntil ? 'Paused — resume Kite' : 'Pause Kite', ...(appRuntime.pausedUntil ? { click: () => pauseKite(0) } : { submenu: [
        { label: '15 minutes', click: () => pauseKite(15) }, { label: '1 hour', click: () => pauseKite(60) }, { label: 'Until restart', click: () => pauseKite(null) },
      ] }) },
      { label: appRuntime.updateReady ? 'Restart to update' : `Updates: ${appRuntime.updateStatus}`, enabled: appRuntime.updateReady, click: restartToUpdate },
      { label: 'History', click: () => createSettingsWindow('history') },
      { label: 'Replay tutorial', click: () => createSettingsWindow('onboarding') },
      { label: 'Focus Kite controls (Tab to navigate)', click: () => { const win=getOverlayWindow();win?.setFocusable(true);win?.focus(); } },
      { label: 'Open logs folder', click: () => { void openLogs(); } },
      { label: 'Report a problem', click: () => { void reportProblem(); } },
      { type: 'separator' }, { label: 'Settings', click: () => { createSettingsWindow(); } },
      { label: 'Quit', click: () => app.quit() },
    ]));
  };
  nativeTheme.on('updated', update);
  tray.on('double-click', () => createSettingsWindow()); update();
  return { update, destroy: () => { nativeTheme.removeListener('updated', update); tray.destroy(); } };
}
