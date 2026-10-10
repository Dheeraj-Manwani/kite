export const repository = 'Dheeraj-Manwani/kite';
export const repositoryURL = `https://github.com/${repository}`;
export const configurableTools = ['open_app', 'web_search', 'get_datetime', 'list_reminders'] as const;
export type ConfigurableTool = typeof configurableTools[number];
export type Modifier = 'Control' | 'Meta' | 'Alt' | 'Shift';
export const modifiers: Modifier[] = ['Control', 'Meta', 'Alt', 'Shift'];
export function validateHotkey(value: unknown): value is Modifier[] {
  return Array.isArray(value) && value.length >= 2 && value.length <= 4 && new Set(value).size === value.length && value.every(key => modifiers.includes(key));
}
/** Kite sizes (docs/design.md §K2, K-14): Large and Extra large help on 4K displays and for low vision. */
export const kiteSizes = { standard: 1, large: 1.3, extraLarge: 1.6 } as const;
export type KiteSize = keyof typeof kiteSizes;
/** Kite colors (docs/design.md §K2, K-15). Each clears 3:1 on every surface the kite flies over, and keeps clear of the
   error red, the gold "look here" color, and success green. The logo and icons stay rose. */
export const kiteSkins = ['rose', 'teal', 'violet', 'sky'] as const;
export type KiteSkin = typeof kiteSkins[number];
/** How much the kite moves on its own (design.md §K5.5, K-15): Lively is the tuned default, Calm keeps it nearly still. */
export const livelinessLevels = ['still', 'subtle', 'playful'] as const;
export type Liveliness = typeof livelinessLevels[number];
export const kitePlacements = ['screenEdge', 'pointer', 'invoked'] as const;
export type KitePlacement = typeof kitePlacements[number];
export const hotkeyLabel = (keys: readonly string[]) => keys.map(k => k === 'Meta' ? 'Win' : k === 'Control' ? 'Ctrl' : k).join(' + ');
export function hotkeyWarning(keys: readonly string[]) {
  if (keys.includes('Alt') && keys.includes('Shift')) return 'Alt + Shift can switch Windows input languages.';
  if (keys.includes('Control') && keys.includes('Shift')) return 'Ctrl + Shift can switch keyboard layouts on some systems.';
  if (keys.includes('Meta')) return 'Windows uses Win for system shortcuts. Test this combination before relying on it.';
  return '';
}
/** `snippet` is present when searching: the best match, with each matched word wrapped in the control characters U+0002 and U+0003. */
export interface ConversationSummary { id: string; started_at: number; preview: string; models: string; count: number; snippet?: string }
export interface HistoryMessage { id: number; role: string; content: string; provider: string; model: string; created_at: number; total_ms: number; first_token_ms: number; voice_to_voice_ms: number | null; annotation_json: string | null; attachments?: number }
export interface HistoryDetail { messages: HistoryMessage[]; tools: import('./types').ToolAudit[] }
export interface OpenConversation { id: string | null; messages: HistoryMessage[]; reason: 'new' | 'resume' | 'deleted' }
export interface PerfSnapshot { mainMB: number; rendererMB: number; rendererFPS: number; frameMs: number; totalMB: number; cpu: number; processes: number; voiceMedianMs: number | null; voiceSamples: number }
/** Where onboarding's stage kite was when "Let's fly" closed the window: screen DIPs, and its scale. */
export interface StageKite { x: number; y: number; scale: number }
export type AppEvent = { type: 'paused'; until: number | null } | { type: 'resumed' | 'update:ready' | 'fault' | 'hotkey:detected' }
  /** Memory: a fact was saved (Undo by token), or saved values to show the user and never a model. */
  | { type: 'memory:saved'; token: string; text: string } | { type: 'memory:show'; text: string }
  | { type: 'background:notice'; text: string }
  | { type: 'onboarding:done'; from: StageKite }
  | { type: 'conversation:show' };
