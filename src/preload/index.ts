import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type { CursorPoint, CursorGeometry, KiteAPI, VoiceEvent, VoiceEventType } from '../shared/types';

const api: KiteAPI = {
  setHotkeyRecording: active => ipcRenderer.send('hotkey:recording', active),
  onViewChange(callback) { const listener = (_e: IpcRendererEvent, view: import('../shared/types').View) => callback(view); ipcRenderer.on('view:change', listener); return () => ipcRenderer.removeListener('view:change', listener); },
  onAppEvent(callback) { const listener = (_e: IpcRendererEvent, event: import('../shared/release').AppEvent) => callback(event); ipcRenderer.on('app:event', listener); return () => ipcRenderer.removeListener('app:event', listener); },
  openView: view => ipcRenderer.send('view:open', view),
  listMemory: () => ipcRenderer.invoke('memory:list'),
  editMemory: (id, patch) => ipcRenderer.invoke('memory:edit', id, patch),
  deleteMemory: id => ipcRenderer.invoke('memory:delete', id),
  exportMemory: () => ipcRenderer.invoke('memory:export'),
  undoMemory: token => ipcRenderer.invoke('memory:undo', token),
  onMemoryChanged(callback) { const listener = () => callback(); ipcRenderer.on('memory:changed', listener); return () => ipcRenderer.removeListener('memory:changed', listener); },
  letsFly: from => ipcRenderer.send('onboarding:fly', from),
  listHistory: query => ipcRenderer.invoke('history:list', query),
  listBoards: query => ipcRenderer.invoke('boards:list', query),
  reopenBoard: id => ipcRenderer.invoke('boards:reopen', id),
  boardThumbnail: (id, png) => ipcRenderer.send('boards:thumbnail', id, png),
  historyDetail: id => ipcRenderer.invoke('history:detail', id),
  historyScreenshot: messageId => ipcRenderer.invoke('history:screenshot', messageId),
  deleteHistory: id => ipcRenderer.invoke('history:delete', id),
  exportHistory: id => ipcRenderer.invoke('history:export', id),
  reportFrame: (fps, ms) => ipcRenderer.send('perf:frame', fps, ms),
  getPerf: () => ipcRenderer.invoke('dev:perf'),
  logEvent: (event, data) => ipcRenderer.send('log:event', event, data),
  focusOverlay: () => ipcRenderer.send('overlay:focus'),
  getAbout: () => ipcRenderer.invoke('about:get'),
  aboutAction: action => ipcRenderer.send('about:action', action),
  openKeyPage: provider => ipcRenderer.send('keys:page', provider),
  releaseOverlay: () => ipcRenderer.send('overlay:release'),
  onScreenEvent(callback) { const listener = (_e: IpcRendererEvent, event: import('../shared/vision').ScreenEvent) => callback(event); ipcRenderer.on('screen:event', listener); return () => ipcRenderer.removeListener('screen:event', listener); },
  screenPrepared: (token, images) => ipcRenderer.send('screen:prepared', token, images),
  screenHidden: token => ipcRenderer.send('screen:hidden', token),
  testCapture: () => ipcRenderer.invoke('screen:test'),
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
  approveTool: (id, approved, scope) => ipcRenderer.invoke('tools:approve', scope ? { id, approved, scope } : { id, approved }),
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
  submitAudio: (buffer, id, strokes, marks) => ipcRenderer.invoke('voice:submit', buffer, id, strokes, marks),
  reportAudioResult: (id, result) => ipcRenderer.send('voice:audioResult', id, result),
  setBubbleBounds: bounds => ipcRenderer.send('bubble:bounds', bounds),
  onGuideEvent(callback) {
    const listener = (_event: IpcRendererEvent, view: import('../shared/guide').GuideView | null) => callback(view);
    ipcRenderer.on('guide:state', listener); return () => ipcRenderer.removeListener('guide:state', listener);
  },
  guideControl: action => ipcRenderer.send('guide:control', action),
  setGuideBounds: bounds => ipcRenderer.send('guide:bounds', bounds),
  demoGuide: () => ipcRenderer.invoke('dev:guideDemo'),
  onBoardEvent(callback) {
    const listener = (_event: IpcRendererEvent, view: import('../shared/board').BoardView | null) => callback(view);
    ipcRenderer.on('board:state', listener); return () => ipcRenderer.removeListener('board:state', listener);
  },
  boardControl: action => ipcRenderer.send('board:control', action),
  boardDrawn: (id, key) => ipcRenderer.send('board:drawn', id, key),
  boardStarted: (id, key) => ipcRenderer.send('board:started', id, key),
  boardCue: (id, key, expectedMs, actualMs) => ipcRenderer.send('board:cue', id, key, expectedMs, actualMs),
  setBoardBounds: bounds => ipcRenderer.send('board:bounds', bounds),
  exportBoard: (action, png, title) => ipcRenderer.invoke('board:export', action, png, title),
  editBoard: (id, action) => ipcRenderer.invoke('board:edit', id, action),
  askBoard: (id, ids, question) => ipcRenderer.invoke('board:ask', id, ids, question),
  onBoardImageRequest: callback => { const listener = (_event: IpcRendererEvent, request: { request: string; id: number; revision: string }) => callback(request); ipcRenderer.on('board:imageRequest', listener); return () => ipcRenderer.removeListener('board:imageRequest', listener); },
  boardImage: (request, id, revision, png) => ipcRenderer.send('board:image', request, id, revision, png),
  exportBoardFile: (format, id, revision, content) => ipcRenderer.invoke('board:exportFile', format, id, revision, content),
  demoBoard: () => ipcRenderer.invoke('dev:boardDemo'),
  onTaskEvent(callback) {
    const listener = (_event: IpcRendererEvent, view: import('../shared/agent').TaskView | null) => callback(view);
    ipcRenderer.on('task:state', listener); return () => ipcRenderer.removeListener('task:state', listener);
  },
  taskControl: action => ipcRenderer.send('task:control', action),
  taskChoose: (index, remember) => ipcRenderer.send('task:choose', index, remember === true),
  setTaskBounds: bounds => ipcRenderer.send('task:bounds', bounds),
  printRecentMessages: () => ipcRenderer.invoke('dev:recentMessages'),
  copyText: text => ipcRenderer.invoke('bubble:copy', text),
  onVoiceEvent(callback) {
    const channels: VoiceEventType[] = ['vision:routed', 'vision:done', 'ptt:start', 'ptt:stop', 'ptt:cancel', 'ptt:tooShort',
      'voice:thinking', 'voice:transcript', 'voice:empty', 'voice:aborted', 'llm:delta', 'llm:done', 'llm:error', 'model:changed', 'model:fallback', 'voice:muted', 'voice:metrics', 'tool:approvalRequired', 'tool:decision', 'tool:executing', 'tool:result', 'approval:resume', 'reminder:fired', 'tts:start', 'tts:chunk', 'tts:timestamps', 'tts:done', 'tts:stop', 'tts:error', 'guide:announce'];
    const listener = (_event: IpcRendererEvent, event: VoiceEvent) => callback(event);
    channels.forEach(channel => ipcRenderer.on(channel, listener));
    return () => channels.forEach(channel => ipcRenderer.removeListener(channel, listener));
  },
};
contextBridge.exposeInMainWorld('kite', api);
