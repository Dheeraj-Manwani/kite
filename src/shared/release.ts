export const repository = 'Dheeraj-Manwani/kite';
export const repositoryURL = `https://github.com/${repository}`;
export const configurableTools = ['open_app', 'web_search', 'get_datetime', 'list_reminders'] as const;
export type ConfigurableTool = typeof configurableTools[number];
export type Modifier = 'Control' | 'Meta' | 'Alt' | 'Shift';
export const modifiers: Modifier[] = ['Control', 'Meta', 'Alt', 'Shift'];
export function validateHotkey(value: unknown): value is Modifier[] {
  return Array.isArray(value) && value.length >= 2 && value.length <= 4 && new Set(value).size === value.length && value.every(key => modifiers.includes(key));
}
export const hotkeyLabel = (keys: readonly string[]) => keys.map(k => k === 'Meta' ? 'Win' : k === 'Control' ? 'Ctrl' : k).join(' + ');
export function hotkeyWarning(keys: readonly string[]) {
  if (keys.includes('Alt') && keys.includes('Shift')) return 'Alt + Shift can switch Windows input languages.';
  if (keys.includes('Control') && keys.includes('Shift')) return 'Ctrl + Shift can switch keyboard layouts on some systems.';
  if (keys.includes('Meta')) return 'Windows uses Win for system shortcuts. Test this combination before relying on it.';
  return '';
}
/** `snippet` is present when searching: the best match, with each matched word wrapped in the control characters U+0002 and U+0003. */
export interface ConversationSummary { id: string; started_at: number; preview: string; models: string; count: number; snippet?: string }
export interface HistoryMessage { id: number; role: string; content: string; provider: string; model: string; created_at: number; total_ms: number; first_token_ms: number; voice_to_voice_ms: number | null; annotation_json: string | null }
export interface HistoryDetail { messages: HistoryMessage[]; tools: import('./types').ToolAudit[] }
export interface PerfSnapshot { mainMB: number; rendererMB: number; rendererFPS: number; frameMs: number; totalMB: number; cpu: number; processes: number; voiceMedianMs: number | null; voiceSamples: number }
export type AppEvent = { type: 'paused'; until: number | null } | { type: 'resumed' | 'update:ready' | 'fault' | 'hotkey:detected' };
