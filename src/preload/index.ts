import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type { CursorPoint, CursorGeometry, KiteAPI, VoiceEvent, VoiceEventType } from '../shared/types';

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
  approveTool: (id, approved) => ipcRenderer.invoke('tools:approve', { id, approved }),
  getToolCalls: () => ipcRenderer.invoke('tools:recent'),
  onToolCallsChanged(callback) {
    const listener = (_event: IpcRendererEvent, calls: import('../shared/types').ToolAudit[]) => callback(calls);
    ipcRenderer.on('tools:changed', listener); return () => ipcRenderer.removeListener('tools:changed', listener);
  },
  setDryRun: enabled => ipcRenderer.invoke('tools:dryRun', enabled),
  rescanApps: () => ipcRenderer.invoke('apps:rescan'),
  dismissReminder: () => ipcRenderer.send('reminder:dismiss'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: patch => ipcRenderer.invoke('settings:update', patch),
  onSettingsChanged(callback) {
    const listener = (_event: IpcRendererEvent, snapshot: import('../shared/types').SettingsSnapshot) => callback(snapshot);
    ipcRenderer.on('settings:changed', listener); return () => ipcRenderer.removeListener('settings:changed', listener);
  },
  refreshModels: provider => ipcRenderer.invoke('models:refresh', provider),
  testKey: provider => ipcRenderer.invoke('providers:test', provider),
  refreshVoices: () => ipcRenderer.invoke('voices:refresh'),
  previewVoice: () => ipcRenderer.invoke('voice:preview'),
  reportPlayback: (id, event) => ipcRenderer.send('tts:playback', id, event),
  hasKey: provider => ipcRenderer.invoke('secrets:has', provider),
  setKey: (provider, key) => ipcRenderer.invoke('secrets:set', provider, key),
  deleteKey: provider => ipcRenderer.invoke('secrets:delete', provider),
  submitAudio: (buffer, id) => ipcRenderer.invoke('voice:submit', buffer, id),
  reportAudioResult: (id, result) => ipcRenderer.send('voice:audioResult', id, result),
  setBubbleBounds: bounds => ipcRenderer.send('bubble:bounds', bounds),
  printRecentMessages: () => ipcRenderer.invoke('dev:recentMessages'),
  copyText: text => ipcRenderer.invoke('bubble:copy', text),
  onVoiceEvent(callback) {
    const channels: VoiceEventType[] = ['ptt:start', 'ptt:stop', 'ptt:cancel', 'ptt:tooShort',
      'voice:thinking', 'voice:transcript', 'voice:empty', 'voice:aborted', 'llm:delta', 'llm:done', 'llm:error', 'model:changed', 'model:fallback', 'voice:muted', 'voice:metrics', 'tool:approvalRequired', 'tool:decision', 'tool:executing', 'tool:result', 'approval:resume', 'reminder:fired', 'tts:start', 'tts:chunk', 'tts:timestamps', 'tts:done', 'tts:stop', 'tts:error'];
    const listener = (_event: IpcRendererEvent, event: VoiceEvent) => callback(event);
    channels.forEach(channel => ipcRenderer.on(channel, listener));
    return () => channels.forEach(channel => ipcRenderer.removeListener(channel, listener));
  },
};
contextBridge.exposeInMainWorld('kite', api);
