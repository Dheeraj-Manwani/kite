import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type { CursorPoint, CursorGeometry, KiteAPI } from '../shared/types';

const api: KiteAPI = {
  onCursorUpdate(callback) {
    const listener = (_event: IpcRendererEvent, point: CursorPoint, geometry: CursorGeometry) => callback(point, geometry);
    ipcRenderer.on('cursor:update', listener);
    return () => ipcRenderer.removeListener('cursor:update', listener);
  },
  onDevPanelToggle(callback) {
    const listener = () => callback();
    ipcRenderer.on('dev:togglePanel', listener);
    return () => ipcRenderer.removeListener('dev:togglePanel', listener);
  },
  setDevPanelBounds: bounds => ipcRenderer.send('dev:panelBounds', bounds),
  setOverlayInteractive: value => ipcRenderer.send('overlay:setInteractive', value),
  openSettings: () => ipcRenderer.send('settings:open'),
};
contextBridge.exposeInMainWorld('kite', api);
