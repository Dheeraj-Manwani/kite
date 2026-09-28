import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { getOverlayWindow } from '../window/overlay';
import { getSettingsWindow } from '../window/settings';
import { isAppURL } from '../window/renderer';

export function trusted(event: IpcMainEvent | IpcMainInvokeEvent, target: 'overlay' | 'settings' | 'either') {
  const sender = event.sender;
  return event.senderFrame === sender.mainFrame && isAppURL(event.senderFrame.url)
    && ((target !== 'settings' && sender === getOverlayWindow()?.webContents)
      || (target !== 'overlay' && sender === getSettingsWindow()?.webContents));
}
