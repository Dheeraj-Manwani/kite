/** Global screen coordinates in device-independent pixels. */
export interface CursorPoint { x: number; y: number }
export interface ScreenBounds extends CursorPoint { width: number; height: number }
export interface CursorGeometry { origin: CursorPoint; display: ScreenBounds }
export type KiteMood = 'idle' | 'listening' | 'thinking' | 'talking';
export type ProviderId = 'openai' | 'anthropic' | 'google' | 'groq' | 'moonshot';
export type SecretId = ProviderId | 'cartesia';
export interface ModelSelection { provider: ProviderId; id: string }
export interface ModelEntry extends ModelSelection { label: string; supportsVision: boolean; supportsTools: boolean; tier: 'flagship' | 'fast' | 'budget' }
export interface VoiceChoice { id: string; name: string }
export interface AppSettings { onboardingComplete: boolean; hotkey: import('./release').Modifier[]; launchOnStartup: boolean; reducedMotion: boolean; toolApprovals: Partial<Record<import('./release').ConfigurableTool, boolean>>; visionModel: ModelSelection; screenWithoutAsking: boolean; keepScreenshots: boolean; model: ModelSelection; fallbackEnabled: boolean; fallback: ModelSelection; ttsEnabled: boolean; voiceId: string; speed: number; dryRun: boolean; searchEngine: 'google' | 'bing' | 'duckduckgo' }
export interface SettingsSnapshot { settings: AppSettings; models: ModelEntry[]; voices: VoiceChoice[]; keys: Record<SecretId, boolean> }
export type KeyStatus = 'ok' | 'invalid key' | 'no credit / rate-limited' | 'network error' | 'model unavailable';
export interface Timing { captureMs?: number; transcribeMs: number; firstTokenMs: number; totalMs: number; ttsFirstAudioMs?: number; voiceToVoiceMs?: number; voiceAverageMs?: number }
export type VoiceEventType = 'ptt:start' | 'ptt:stop' | 'ptt:cancel' | 'ptt:tooShort'
  | 'voice:thinking' | 'voice:transcript' | 'voice:empty' | 'voice:aborted'
  | 'vision:routed' | 'vision:done' | 'llm:delta' | 'llm:done' | 'llm:error' | 'model:changed' | 'model:fallback' | 'voice:muted' | 'voice:metrics'
  | 'tool:approvalRequired' | 'tool:decision' | 'tool:executing' | 'tool:result' | 'approval:resume' | 'reminder:fired'
  | 'tts:start' | 'tts:chunk' | 'tts:timestamps' | 'tts:done' | 'tts:stop' | 'tts:error';
export interface VoiceEvent { type: VoiceEventType; id: number; text?: string; timing?: Timing; settings?: boolean;
  approval?: ApprovalCard; decision?: ToolDecision; toolName?: string; success?: boolean; reminderId?: number;
  audio?: ArrayBuffer; timestamps?: { words: string[]; start: number[]; end: number[] }; }
export type ToolDecision = 'approved' | 'denied' | 'timeout' | 'auto';
export interface ApprovalCard { approvalId: string; toolName: string; summary: string; input: unknown; expiresAt: number; dryRun: boolean }
export interface ToolAudit { id: number; message_id: number | null; tool: string; input_json: string; summary: string; decision: ToolDecision; result_json: string | null; error: string | null; dry_run: number; duration_ms: number; created_at: number }
export interface Reminder { id: number; at: number; label: string; status: 'pending' | 'fired' | 'cancelled' }
export interface OperationResult { ok: boolean; error?: string }
export interface KiteAPI {
  setHotkeyRecording(active: boolean): void;
  onViewChange(callback: (view: 'settings' | 'history' | 'onboarding') => void): () => void;
  onAppEvent(callback: (event: import('./release').AppEvent) => void): () => void;
  openView(view: 'settings' | 'history' | 'onboarding'): void;
  listHistory(query?: string): Promise<import('./release').ConversationSummary[]>;
  historyDetail(id: string): Promise<import('./release').HistoryDetail>;
  deleteHistory(id: string | null): Promise<OperationResult>;
  exportHistory(id: string): Promise<OperationResult>;
  reportFrame(fps: number, frameMs: number): void;
  getPerf(): Promise<import('./release').PerfSnapshot>;
  logEvent(event: 'renderer:ready' | 'renderer:error', data?: { durationMs?: number }): void;
  focusOverlay(): void;

  onScreenEvent(callback: (event: import('./vision').ScreenEvent) => void): () => void;
  screenPrepared(token: string, images: import('./vision').VisionImages | null): void;
  screenHidden(token: string): void;
  testCapture(): Promise<OperationResult & { path?: string }>;
  onCursorUpdate(callback: (point: CursorPoint, geometry: CursorGeometry) => void): () => void;
  onDevPanelToggle(callback: () => void): () => void;
  setDevPanelBounds(bounds: ScreenBounds | null): void;
  setOverlayInteractive(isInteractive: boolean): void;
  openSettings(): void;
  hasKey(provider: SecretId): Promise<boolean>;
  setKey(provider: SecretId, key: string): Promise<OperationResult>;
  deleteKey(provider: SecretId): Promise<OperationResult>;
  approveTool(approvalId: string, approved: boolean): Promise<OperationResult>;
  getToolCalls(): Promise<ToolAudit[]>;
  onToolCallsChanged(callback: (calls: ToolAudit[]) => void): () => void;
  setDryRun(enabled: boolean): Promise<OperationResult>;
  rescanApps(): Promise<OperationResult>;
  dismissReminder(): void;
  getSettings(): Promise<SettingsSnapshot>;
  updateSettings(patch: Partial<AppSettings>): Promise<OperationResult>;
  onSettingsChanged(callback: (snapshot: SettingsSnapshot) => void): () => void;
  refreshModels(provider: ProviderId): Promise<OperationResult>;
  testKey(provider: SecretId): Promise<{ status: KeyStatus }>;
  refreshVoices(): Promise<OperationResult>;
  previewVoice(): Promise<OperationResult>;
  reportPlayback(id: number, event: 'started' | 'ended' | 'failed'): void;
  onVoiceEvent(callback: (event: VoiceEvent) => void): () => void;
  submitAudio(buffer: ArrayBuffer, interactionId: number, strokes?: import('./vision').Stroke[]): Promise<OperationResult>;
  reportAudioResult(interactionId: number, result: 'empty' | 'micDenied' | 'captureFailed'): void;
  setBubbleBounds(bounds: ScreenBounds | null): void;
  printRecentMessages(): Promise<OperationResult>;
  copyText(text: string): Promise<OperationResult>;
}
