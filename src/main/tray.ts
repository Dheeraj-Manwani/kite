import { app, Menu, nativeImage, Tray } from 'electron';
import { createSettingsWindow } from './window/settings';
import type { openPreferences } from './settings/preferences';
import { providerLabels } from './ai/catalog';
export function createKiteTray(preferences: ReturnType<typeof openPreferences>) {
  // Native bitmap: no asset path assumptions in packaged builds.
  const pixels = Buffer.alloc(32 * 32 * 4);
  for (let y = 2; y < 29; y++) for (let x = 2; x < 30; x++) {
    if (Math.abs(x - 16) / 12 + Math.abs(y - 13) / 11 < 1 || (y > 23 && Math.abs(x - 16 - Math.sin(y) * 2) < 1.5)) {
      const i = (y * 32 + x) * 4; pixels[i] = 160; pixels[i + 1] = 95; pixels[i + 2] = 235; pixels[i + 3] = 255;
    }
  }
  const tray = new Tray(nativeImage.createFromBitmap(pixels, { width: 32, height: 32 }));
  tray.setToolTip('Kite · Ctrl + Win to speak');
  const update = () => {
    const { settings, models, keys } = preferences.snapshot();
    const configured = models.filter(m => keys[m.provider]);
    if (keys[settings.model.provider] && !configured.some(m => m.provider === settings.model.provider && m.id === settings.model.id))
      configured.push({ ...settings.model, label: settings.model.id, tier: 'fast', supportsVision: false, supportsTools: false });
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Mute voice', type: 'checkbox', checked: !settings.ttsEnabled, click: () => {
        try { preferences.update({ ttsEnabled: !preferences.get().ttsEnabled }); } catch { createSettingsWindow(); }
      } },
      { label: 'Model', submenu: configured.length ? configured.map(model => ({ label: `${providerLabels[model.provider]} · ${model.label}`,
        type: 'radio' as const, checked: model.provider === settings.model.provider && model.id === settings.model.id,
        click: () => { preferences.update({ model: { provider: model.provider, id: model.id } }); } })) : [{ label: 'Save a provider key in Settings', enabled: false }] },
      { type: 'separator' }, { label: 'Settings', click: () => { createSettingsWindow(); } },
      { label: 'Quit', click: () => app.quit() },
    ]));
  };
  tray.on('double-click', () => createSettingsWindow()); update();
  return { update, destroy: () => tray.destroy() };
}
