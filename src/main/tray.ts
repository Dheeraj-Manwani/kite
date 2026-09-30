import { appRuntime, pauseKite, restartToUpdate, openLogs, reportProblem } from './runtime';
import { hotkeyLabel } from '../shared/release';
import { focusOverlayControls, keyboardControlsShortcut } from './window/overlay';
import path from 'node:path';
import { app, Menu, nativeImage, nativeTheme, Tray } from 'electron';
import { createSettingsWindow } from './window/settings';
import type { openPreferences } from './settings/preferences';
import { providerLabels } from './ai/catalog';
export function createKiteTray(preferences: ReturnType<typeof openPreferences>) {
  // The sail, drawn per taskbar theme at 16–32 px (scripts/brand.py): an outline while paused, with a gold dot when an update is ready.
  const icon = () => nativeImage.createFromPath(path.join(app.getAppPath(), 'assets', 'tray',
    `${nativeTheme.shouldUseDarkColors ? 'dark' : 'light'}${appRuntime.pausedUntil ? '-paused' : ''}${appRuntime.updateReady ? '-update' : ''}.ico`));
  const tray = new Tray(icon());
  let menu: Menu | null = null;
  const update = () => {
    tray.setImage(icon());
    const { settings, models, keys } = preferences.snapshot();
    tray.setToolTip(`Kite · ${appRuntime.pausedUntil ? 'Paused' : settings.ttsEnabled ? 'Voice on' : 'Muted'} · ${hotkeyLabel(settings.hotkey)}`);
    const configured = models.filter(m => keys[m.provider]);
    if (keys[settings.model.provider] && !configured.some(m => m.provider === settings.model.provider && m.id === settings.model.id))
      configured.push({ ...settings.model, label: settings.model.id, tier: 'fast', supportsVision: false, supportsTools: false });
    // Grouped for scanning (docs/ui-ux-improvements.md UX-80): who and how, the everyday switches, the windows, help, then Quit.
    const muted = !settings.ttsEnabled, paused = !!appRuntime.pausedUntil;
    menu = Menu.buildFromTemplate([
      { label: `Kite · ${hotkeyLabel(settings.hotkey)} to talk`, enabled: false },
      { type: 'separator' },
      { label: 'Mute voice', type: 'checkbox', checked: muted, click: () => {
        try { preferences.update({ ttsEnabled: !preferences.get().ttsEnabled }); } catch { createSettingsWindow(); }
      } },
      { label: paused ? 'Resume Kite' : 'Pause', ...(paused ? { click: () => pauseKite(0) } : { submenu: [
        { label: 'For 15 minutes', click: () => pauseKite(15) }, { label: 'For 1 hour', click: () => pauseKite(60) }, { label: 'Until I restart Kite', click: () => pauseKite(null) },
      ] }) },
      { label: 'Model', submenu: configured.length ? configured.map(model => ({ label: `${providerLabels[model.provider]} · ${model.label}`,
        type: 'radio' as const, checked: model.provider === settings.model.provider && model.id === settings.model.id,
        click: () => { preferences.update({ model: { provider: model.provider, id: model.id } }); } })) : [{ label: 'Add a provider key in Settings', enabled: false }] },
      { type: 'separator' },
      { label: 'Settings', click: () => { createSettingsWindow(); } },
      { label: 'History', click: () => createSettingsWindow('history') },
      { label: 'Help', submenu: [
        { label: 'Replay tutorial', click: () => createSettingsWindow('onboarding') },
        { label: 'Keyboard controls', accelerator: keyboardControlsShortcut(), registerAccelerator: false, click: focusOverlayControls },
        { label: 'Open logs folder', click: () => { void openLogs(); } },
        { label: 'Report a problem', click: () => { void reportProblem(); } },
      ] },
      ...(appRuntime.updateReady ? [{ type: 'separator' as const }, { label: 'Restart to update', click: restartToUpdate }] : []),
      { type: 'separator' },
      { label: 'Quit Kite', click: () => app.quit() },
    ]);
    tray.setContextMenu(menu);
  };
  nativeTheme.on('updated', update);
  // A left click opens the same menu; the tray has no hidden double-click action.
  tray.on('click', () => { if (menu) tray.popUpContextMenu(menu); }); update();
  return { update, destroy: () => { nativeTheme.removeListener('updated', update); tray.destroy(); } };
}
