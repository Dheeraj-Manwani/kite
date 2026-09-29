import { asksForScreen, markInstruction, type Stroke, type VisionTurn } from '../../shared/vision';
import type { ApprovalCard, ToolDecision, Reminder, AppSettings, ModelEntry, ModelSelection, ProviderId, Timing, VoiceEvent } from '../../shared/types';
import { classifyApproval, ApprovalBroker } from '../tools/approval';
import type { ToolSession } from '../tools/registry';
import { Conversation, ChatMessage } from '../ai/conversation';
import { friendlyError, MissingKeyError } from './errors';
import { describeModel } from '../ai/catalog';
import { withFallback } from '../ai/fallback';
interface Dependencies {
  vision?: {
    start(id: number, signal: AbortSignal, ready: () => boolean, measured: (ms: number) => void): void;
    leave(): void; clear(id: number): void;
    prepare(id: number, strokes: Stroke[], signal: AbortSignal): Promise<VisionTurn | undefined>;
    route(active: ModelEntry): ModelEntry;
    persist(row: number, turn: VisionTurn, signal: AbortSignal): Promise<void>;
  };
  emit(event: VoiceEvent): void;
  getKey(provider: ProviderId): string | undefined;
  transcribe(audio: Uint8Array, key: string, signal: AbortSignal): Promise<string>;
  ask(messages: ChatMessage[], key: string, signal: AbortSignal, onDelta: (text: string) => void, model?: ModelEntry, tools?: ToolSession): Promise<string>;
  history: { createConversation(id: string, now: number): void;
    addMessage(id: string, role: 'user' | 'assistant', content: string, timing: Timing, model?: ModelSelection, interrupted?: boolean): number | void;
    updateMessage?(id: number, timing: Timing, interrupted: boolean): void; voiceAverage?(): number | undefined };
  conversation: Conversation;
  setEscape(active: boolean, abort: () => void): void;
  settings?(): AppSettings;
  describe?(model: ModelSelection): ModelEntry;
  tts?: { start(id: number, settings: AppSettings): void; push(id: number, text: string): void; finish(id: number): void; cancel(): void };
  approvals?: ApprovalBroker;
  tools?(messageId: number | null, signal: AbortSignal, activity: () => void, model?: ModelEntry, captureTiming?: (ms: number) => void): ToolSession;
  now?: () => number;
}
interface Interaction {
  id: number; phase: 'listening' | 'awaiting' | 'processing'; controller: AbortController;
  releasedAt: number; timing: Timing; timeout?: ReturnType<typeof setTimeout>;
  visualContent?: ChatMessage['content']; markTypes?: string;
  text: string; session?: string; userRow?: number; toolsStarted?: boolean; tools?: ToolSession; speechStarted?: boolean; approvalReply?: boolean; reminder?: boolean; model?: ModelEntry; row?: number; saved: boolean;
  llmDone: boolean; playbackDone: boolean; speaking: boolean; ttsStartedAt?: number;
}
export class VoiceController {
  private sequence = 0;
  private closing = false;
  async shutdown() { this.closing = true; this.reminderQueue = []; const sessions = [this.active?.tools, this.suspended?.tools]; this.cancel(); await Promise.all(sessions.map(s => s?.settled())); }
  private active?: Interaction;
  private suspended?: Interaction;
  private reminderQueue: Reminder[] = [];
  reminder(reminder: Reminder) {
    if (this.active) { this.reminderQueue.push(reminder); return; }
    this.preview(reminder.label, false, reminder.id);
  }
  decideApproval(id: string, approved: boolean) { return !this.suspended && !!this.deps.approvals?.decide(id, approved); }
  dismissReminder() { if (this.active?.reminder) this.cancel(); }
  presentApproval(card: ApprovalCard) {
    const job = this.active; if (!job) return;
    this.deps.tts?.cancel(); job.speaking = false;
    this.emit('tool:approvalRequired', job, { approval: card });
    this.beginSpeech(job); if (job.speaking) { this.deps.tts.push(job.id, card.summary); this.deps.tts.finish(job.id); }
  }
  approvalDecision(card: ApprovalCard, decision: ToolDecision) {
    const job = this.suspended ?? this.active; if (!job) return;
    this.deps.tts?.cancel(); job.speaking = false; job.playbackDone = true; job.speechStarted = false;
    this.emit('tool:decision', job, { approval: card, decision });
    // A timed-out voice confirmation cannot authorize a different or later action.
    if (this.suspended && decision === 'timeout') this.cancel('voice:aborted');
  }
  toolEvent(type: 'tool:executing' | 'tool:result', toolName: string, result?: { ok: boolean; message: string }) {
    const job = this.active; if (job) this.emit(type, job, { toolName, text: result?.message, success: result?.ok });
  }
  private now: () => number;
  constructor(private deps: Dependencies) { this.now = deps.now ?? (() => performance.now()); }
  private emit(type: VoiceEvent['type'], job: Interaction, extra: Partial<VoiceEvent> = {}) {
    this.deps.emit({ type, id: job.id, timing: { ...job.timing, totalMs: job.releasedAt ? this.now() - job.releasedAt : 0 }, ...extra });
  }
  private finish(job: Interaction) {
    if (job.visualContent) this.deps.conversation.scrubImages(job.text, job.markTypes, job.visualContent);
    this.deps.vision?.clear(job.id);
    this.deps.vision?.leave();
    if (this.deps.vision) this.emit('vision:done', job);
    clearTimeout(job.timeout);
    if (this.active === job) { this.active = undefined; this.deps.setEscape(false, () => undefined);
      if (!this.closing && this.reminderQueue.length) queueMicrotask(() => { if (!this.active && this.reminderQueue.length) this.reminder(this.reminderQueue.shift()); });
    }
  }
  private save(job: Interaction, interrupted = false) {
    job.timing.totalMs = job.releasedAt ? this.now() - job.releasedAt : 0;
    if (job.row !== undefined) this.deps.history.updateMessage?.(job.row, job.timing, interrupted);
    if (!job.saved && job.session && job.text) {
      const row = this.deps.history.addMessage(job.session, 'assistant', job.text, job.timing, job.model, interrupted);
      if (typeof row === 'number') job.row = row;
      job.saved = true;
      this.deps.conversation.add({ role: 'assistant', content: job.text }, Date.now());
    }
    if (job.timing.voiceToVoiceMs !== undefined) { job.timing.voiceAverageMs = this.deps.history.voiceAverage?.(); this.emit('voice:metrics', job); }
  }
  private complete(job: Interaction) {
    if (job.llmDone && job.playbackDone) { this.save(job); this.finish(job); }
  }
  start() {
    const pending = this.deps.approvals?.current;
    if (pending && this.active && !this.suspended) {
      this.suspended = this.active; this.deps.tts?.cancel(); this.suspended.speaking = false; this.suspended.playbackDone = true;
      clearTimeout(this.suspended.timeout); this.active = undefined;
    } else this.cancel('ptt:cancel');
    const job: Interaction = { id: ++this.sequence, phase: 'listening', controller: new AbortController(),
      releasedAt: 0, timing: { transcribeMs: 0, firstTokenMs: 0, totalMs: 0 }, text: '', approvalReply: !!this.suspended, saved: false, llmDone: false, playbackDone: true, speaking: false };
    this.active = job; this.deps.setEscape(true, () => this.cancel('voice:aborted'));
    job.timeout = setTimeout(() => this.cancel('ptt:cancel'), 60000);
    this.emit('ptt:start', job);
    if (!job.approvalReply) this.deps.vision?.start(job.id, job.controller.signal, () => this.active === job && job.phase === 'listening', ms => { job.timing.captureMs = ms; this.emit('voice:metrics', job); });
    return job.id;
  }
  stop() {
    const job = this.active; if (!job || job.phase !== 'listening') return;
    clearTimeout(job.timeout); job.phase = 'awaiting'; job.releasedAt = this.now();
    job.timeout = setTimeout(() => {
      if (this.active !== job) return;
      this.emit('llm:error', job, { text: 'The microphone didn’t finish recording. Please try again.' });
      if (job.approvalReply) this.cancel('voice:aborted'); else { job.controller.abort(); this.finish(job); }
    }, 10000);
    this.deps.vision?.leave();
    this.emit('ptt:stop', job);
  }
  cancel(type: 'ptt:cancel' | 'ptt:tooShort' | 'voice:aborted' = 'ptt:cancel') {
    const parent = this.suspended; this.suspended = undefined;
    if (parent) { parent.controller.abort(); parent.tools?.close(); this.save(parent, true); clearTimeout(parent.timeout); }
    this.deps.approvals?.deny();
    const job = this.active; if (!job) return;
    job.controller.abort(); job.tools?.close(); this.deps.tts?.cancel(); this.save(job, true); this.emit(type, job); this.finish(job);
  }
  mute() {
    const job = this.active; this.deps.tts?.cancel();
    if (job) { job.playbackDone = true; job.speaking = false; this.emit('voice:muted', job); this.complete(job); }
  }
  ttsEvent(event: VoiceEvent) {
    const job = this.active; if (!job || event.id !== job.id) return;
    if (event.type === 'tts:chunk' && job.timing.ttsFirstAudioMs === undefined) job.timing.ttsFirstAudioMs = this.now() - (job.ttsStartedAt ?? job.releasedAt);
    this.deps.emit(event);
    if (event.type === 'tts:error') { job.speaking = false; job.playbackDone = true; this.complete(job); }
  }
  playback(id: number, type: 'started' | 'ended' | 'failed') {
    const job = this.active; if (!job || job.id !== id || !job.speaking) return;
    if (type === 'started' && job.timing.voiceToVoiceMs === undefined) {
      job.timing.voiceToVoiceMs = this.now() - job.releasedAt;
      if (job.row !== undefined) this.deps.history.updateMessage?.(job.row, job.timing, false);
      job.timing.voiceAverageMs = this.deps.history.voiceAverage?.(); this.emit('voice:metrics', job);
    }
    if (type === 'failed') { this.deps.tts?.cancel(); this.emit('tts:error', job, { text: 'Audio playback is unavailable. Showing text.' }); }
    if (type !== 'started') { job.playbackDone = true; this.complete(job); }
  }
  private beginSpeech(job: Interaction, settings?: AppSettings) {
    job.speechStarted = true;
    settings = this.deps.settings?.() ?? settings;
    if (settings?.ttsEnabled && settings.voiceId && this.deps.tts) {
      job.speaking = true; job.playbackDone = false; job.ttsStartedAt = this.now(); this.deps.tts.start(job.id, settings);
    } else if (settings) this.emit('voice:muted', job);
  }
  preview(text: string, costume = false, reminderId?: number) {
    this.cancel();
    const job: Interaction = { id: ++this.sequence, phase: 'processing', controller: new AbortController(), releasedAt: this.now(),
      timing: { transcribeMs: 0, firstTokenMs: 0, totalMs: 0 }, text, saved: false, llmDone: true, playbackDone: true, speaking: false };
    this.active = job; this.deps.setEscape(true, () => this.cancel('voice:aborted'));
    job.timeout = setTimeout(() => this.cancel(), 60000);
    this.emit('model:changed', job, { text: costume ? text : 'Voice preview' });
    this.beginSpeech(job, this.deps.settings?.()); this.emit('llm:delta', job, { text });
    if (job.speaking) { this.deps.tts.push(job.id, text); this.deps.tts.finish(job.id); }
    if (reminderId !== undefined) { job.reminder = true; this.emit('reminder:fired', job, { text, reminderId }); }
    this.emit('llm:done', job); this.complete(job);
  }
  audioResult(id: number, result: 'empty' | 'micDenied' | 'captureFailed') {
    const job = this.active; if (!job || id !== job.id || job.phase === 'processing') return;
    if (result === 'empty') this.emit('voice:empty', job);
    else this.emit('llm:error', job, { text: result === 'micDenied' ? 'Please allow microphone access in Windows Settings → Privacy & security → Microphone, including desktop apps.' : 'I couldn’t record your microphone. Check the input device and try again.' });
    if (job.approvalReply) this.cancel('voice:aborted'); else { job.controller.abort(); this.finish(job); }
  }
  async submit(id: number, buffer: ArrayBuffer, strokes: Stroke[] = []) {
    const job = this.active; if (!job || id !== job.id || job.phase !== 'awaiting') return;
    clearTimeout(job.timeout); job.phase = 'processing';
    job.timeout = setTimeout(() => {
      if (this.active !== job) return;
      job.controller.abort(); this.deps.tts?.cancel(); this.save(job, true);
      this.emit('llm:error', job, { text: 'That took too long. Please try again.' }); this.finish(job);
    }, 180000);
    const current = () => this.active === job && !job.controller.signal.aborted;
    this.emit('voice:thinking', job); let provider: ProviderId = 'groq';
    try {
      const vision = job.approvalReply ? undefined : await this.deps.vision?.prepare(id, strokes, job.controller.signal);
      if (!current()) return;
      if (vision) job.timing.captureMs = vision.captureMs;
      const groqKey = this.deps.getKey('groq'); if (buffer.byteLength && !groqKey) throw new MissingKeyError('groq');
      const started = this.now();
      const transcript = buffer.byteLength ? (await this.deps.transcribe(new Uint8Array(buffer), groqKey, job.controller.signal)).trim() : '';
      const text = transcript || (vision ? 'What is this?' : '');
      if (!current()) return;
      job.timing.transcribeMs = this.now() - started;
      if (!text) { this.emit('voice:empty', job); if (job.approvalReply) this.cancel('voice:aborted'); else this.finish(job); return; }
      if (job.approvalReply) {
        const parent = this.suspended; const pending = this.deps.approvals?.current;
        this.suspended = undefined;
        if (parent && pending) {
          const decision = classifyApproval(text);
          if (decision !== 'new-request') {
            clearTimeout(job.timeout); this.active = parent;
            parent.timeout = setTimeout(() => this.cancel('voice:aborted'), 180000);
            this.emit('approval:resume', parent, { text: parent.text });
            this.deps.approvals.decide(pending.approvalId, decision === 'approve'); return;
          }
          parent.controller.abort(); parent.tools?.close(); this.save(parent, true);
        }
        job.approvalReply = false;
      }
      this.emit('voice:transcript', job, { text });
      const session = this.deps.conversation.begin(Date.now()); job.session = session.id;
      this.deps.history.createConversation(session.id, Date.now());
      const userRow = this.deps.history.addMessage(session.id, 'user', text, job.timing);
      job.userRow = typeof userRow === 'number' ? userRow : undefined;
      if (vision && job.userRow !== undefined) await this.deps.vision.persist(job.userRow, vision, job.controller.signal);
      if (!current()) return;
      const userMessage: ChatMessage = { role: 'user', content: vision ? [
        { type: 'text', text: `${text}\n${markInstruction(vision.analysis)}` },
        { type: 'image', image: vision.images.overview, mediaType: 'image/jpeg' },
        ...(vision.images.zoom ? [{ type: 'image' as const, image: vision.images.zoom, mediaType: 'image/jpeg' }] : []),
      ] : text };
      if (vision) { job.visualContent = userMessage.content; job.markTypes = vision.analysis.marks.map(m => m.markType).join(', '); }
      this.deps.conversation.add(userMessage, Date.now());
      const settings = this.deps.settings?.();
      const describe = this.deps.describe ?? describeModel;
      job.model = describe(settings?.model ?? { provider: 'moonshot', id: 'kimi-k2.6' });
      const needsVision = !!vision || asksForScreen(text);
      const selectVision = () => {
        if (!needsVision || !this.deps.vision) return;
        const active = job.model; job.model = this.deps.vision.route(active);
        if (active.provider !== job.model.provider || active.id !== job.model.id) this.emit('vision:routed', job, { text: job.model.label });
      };
      selectVision();
      let usedModelCalls = 0;
      const run = async () => {
        if (job.model.supportsTools && !job.tools) {
          job.tools = this.deps.tools?.(job.userRow ?? null, job.controller.signal, () => { job.toolsStarted = true; }, job.model, ms => { job.timing.captureMs = (job.timing.captureMs ?? 0) + ms; this.emit('voice:metrics', job); });
          if (job.tools) job.tools.modelCalls = usedModelCalls;
        }
        provider = job.model.provider;
        const key = this.deps.getKey(provider); if (!key) throw new MissingKeyError(provider);
        return this.deps.ask(this.deps.conversation.context(), key, job.controller.signal, delta => {
          if (!current() || !delta) return;
          if (!job.text) job.timing.firstTokenMs = this.now() - job.releasedAt;
          if (!job.speechStarted) this.beginSpeech(job, settings);
          job.text += delta; this.emit('llm:delta', job, { text: delta });
          if (job.speaking) this.deps.tts.push(job.id, delta);
        }, job.model, job.tools);
      };
      const answer = await withFallback(run, run, () => !!job.text || !!job.toolsStarted, !!settings?.fallbackEnabled, job.controller.signal, () => {
        usedModelCalls = job.tools?.modelCalls ?? 0; job.tools?.close(); job.tools = undefined; job.model = describe(settings.fallback); selectVision(); this.emit('model:fallback', job, { text: job.model.label });
      });
      if (!current()) return;
      job.text = answer; job.llmDone = true; if (job.visualContent) this.deps.conversation.scrubImages(answer, job.markTypes, job.visualContent); this.save(job);
      if (job.speaking) this.deps.tts.finish(job.id);
      this.emit('llm:done', job); this.complete(job);
    } catch (error) {
      if (current()) { if (job.approvalReply) { this.cancel('voice:aborted'); return; } this.deps.tts?.cancel(); this.save(job, !!job.text); this.emit('llm:error', job, friendlyError(error, provider)); this.finish(job); }
    } finally { if (job.visualContent) this.deps.conversation.scrubImages(job.text, job.markTypes, job.visualContent); this.deps.vision?.clear(job.id); }
  }
}
