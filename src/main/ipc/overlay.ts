import { ipcMain } from 'electron';
import { getOverlayWindow } from '../window/overlay';
import { createSettingsWindow } from '../window/settings';

export function registerOverlayIPC() {
  ipcMain.on('overlay:setInteractive', (event, isInteractive: boolean) => {
    const win = getOverlayWindow();
    if (win && event.sender === win.webContents && typeof isInteractive === 'boolean') {
      win.setIgnoreMouseEvents(!isInteractive, { forward: true });
    }
  });
  ipcMain.on('settings:open', event => {
    if (event.sender === getOverlayWindow()?.webContents) createSettingsWindow();
  });
}
