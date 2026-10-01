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
export interface AppSettings { onboardingComplete: boolean; hotkey: import('./release').Modifier[]; launchOnStartup: boolean; reducedMotion: boolean; toolApprovals: Partial<Record<import('./release').ConfigurableTool, boolean>>; visionModel: ModelSelection; screenWithoutAsking: boolean; keepScreenshots: boolean; model: ModelSelection; fallbackEnabled: boolean; fallback: ModelSelection; ttsEnabled: boolean; voiceId: string; speed: number; dryRun: boolean; searchEngine: 'google' | 'bing' | 'duckduckgo'; guideMode: boolean; whiteboard: boolean; computerUse: boolean; kiteSize: import('./release').KiteSize; earcons: boolean }
export interface AboutInfo { version: string; updateStatus: string; updateReady: boolean }
export interface SettingsSnapshot { settings: AppSettings; models: ModelEntry[]; voices: VoiceChoice[]; keys: Record<SecretId, boolean> }
export type KeyStatus = 'ok' | 'invalid key' | 'no credit / rate-limited' | 'network error' | 'model unavailable';
export interface Timing { captureMs?: number; transcribeMs: number; firstTokenMs: number; totalMs: number; ttsFirstAudioMs?: number; voiceToVoiceMs?: number; voiceAverageMs?: number }
export type VoiceEventType = 'ptt:start' | 'ptt:stop' | 'ptt:cancel' | 'ptt:tooShort'
  | 'voice:thinking' | 'voice:transcript' | 'voice:empty' | 'voice:aborted'
  | 'vision:routed' | 'vision:done' | 'llm:delta' | 'llm:done' | 'llm:error' | 'model:changed' | 'model:fallback' | 'voice:muted' | 'voice:metrics'
  | 'tool:approvalRequired' | 'tool:decision' | 'tool:executing' | 'tool:result' | 'approval:resume' | 'reminder:fired'
  | 'tts:start' | 'tts:chunk' | 'tts:timestamps' | 'tts:done' | 'tts:stop' | 'tts:error' | 'guide:announce';
export interface VoiceEvent { type: VoiceEventType; id: number; text?: string; title?: string; setup?: boolean; timing?: Timing; settings?: boolean;
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
  /** "Let's fly": close onboarding and hand its kite (client px in this window) to the overlay. */
  letsFly(from: import('./release').StageKite): void;
  listHistory(query?: string): Promise<import('./release').ConversationSummary[]>;
  historyDetail(id: string): Promise<import('./release').HistoryDetail>;
  /** The marked screenshot kept with a question, as a data URL, or null (UX-74). */
  historyScreenshot(messageId: number): Promise<string | null>;
  deleteHistory(id: string | null): Promise<OperationResult>;
  exportHistory(id: string): Promise<OperationResult>;
  reportFrame(fps: number, frameMs: number): void;
  getPerf(): Promise<import('./release').PerfSnapshot>;
  logEvent(event: 'renderer:ready' | 'renderer:error', data?: { durationMs?: number }): void;
  focusOverlay(): void;
  getAbout(): Promise<AboutInfo | null>;
  aboutAction(action: 'logs' | 'report' | 'restart'): void;
  openKeyPage(provider: SecretId): void;
  releaseOverlay(): void;

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
  approveTool(approvalId: string, approved: boolean, scope?: import('./agent').TaskScope): Promise<OperationResult>;
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
  /** `marks`: ids of whiteboard elements the user drew over while speaking. */
  submitAudio(buffer: ArrayBuffer, interactionId: number, strokes?: import('./vision').Stroke[], marks?: string[]): Promise<OperationResult>;
  reportAudioResult(interactionId: number, result: 'empty' | 'micDenied' | 'captureFailed'): void;
  setBubbleBounds(bounds: ScreenBounds | null): void;
  onGuideEvent(callback: (view: import('./guide').GuideView | null) => void): () => void;
  guideControl(action: import('./guide').GuideAction): void;
  setGuideBounds(bounds: ScreenBounds | null): void;
  demoGuide(): Promise<OperationResult>;
  onBoardEvent(callback: (view: import('./board').BoardView | null) => void): () => void;
  boardControl(action: import('./board').BoardAction): void;
  boardDrawn(id: number, key: number): void;
  setBoardBounds(bounds: ScreenBounds | null): void;
  exportBoard(action: 'copy' | 'save', png: Uint8Array, title: string): Promise<OperationResult>;
  demoBoard(): Promise<OperationResult>;
  onTaskEvent(callback: (view: import('./agent').TaskView | null) => void): () => void;
  taskControl(action: import('./agent').TaskAction): void;
  setTaskBounds(bounds: ScreenBounds | null): void;
  printRecentMessages(): Promise<OperationResult>;
  copyText(text: string): Promise<OperationResult>;
}
