import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type { CursorPoint, KiteAPI } from '../shared/types';

const api: KiteAPI = {
  onCursorUpdate(callback) {
    const listener = (_event: IpcRendererEvent, point: CursorPoint) => callback(point);
    ipcRenderer.on('cursor:update', listener);
    return () => ipcRenderer.removeListener('cursor:update', listener);
  },
  setOverlayInteractive: value => ipcRenderer.send('overlay:setInteractive', value),
  openSettings: () => ipcRenderer.send('settings:open'),
};
contextBridge.exposeInMainWorld('kite', api);
