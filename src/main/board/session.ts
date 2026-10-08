import { applyBeat, boardLimits, layoutScene, readingMs, repairBeats, speechMs, type BeatInput, type BoardStatus, type BoardView, type ElementInput, type LaidElement, type LessonInput } from '../../shared/board';
import { cueTimings, type WordTiming } from '../../shared/boardTeaching';
import { applyEdits, moveInput, rerouteInput, type BoardEdit, type BoardEdits } from '../../shared/boardEditing';
import { boardAppearance, type BoardAppearance } from '../../shared/boardDelight';
/** How a spoken beat ended: heard in full, cut off (the user took over), or the voice failed. */
export type SpeechEnd = 'spoken' | 'cut' | 'failed';
export interface BoardSessionDeps {
  emit(view: BoardView | null): void;
  /**
   * Speak a beat quietly. `started` fires when its audio begins (drawing starts then, so the pen matches
   * the words); `done` fires once. Returns false when voice is off: the caption is read instead.
   */
  speak(text: string, hooks: { started(audioId?: number): void; done(end: SpeechEnd): void; timestamps?(words: WordTiming, audioId: number): void; speed?: number }): boolean;
  /** Cancel queued or playing lesson speech. */
  silence(): void;
  speed(): number;
  teaching?(): boolean;
  prefetch?(text: string, speed: number): void;
  cancelPrefetch?(): void;
  log?(event: string, data?: Record<string, unknown>): void;
}
export interface BoardTiming { gapMs: number; drawSlackMs: number; idleMs: number }
export const boardTiming: BoardTiming = { gapMs: 450, drawSlackMs: 5000, idleMs: 30 * 60_000 };
/**
 * One whiteboard lesson: a list of beats, each spoken while its elements are drawn. The next beat starts
 * only when both the speech and the drawing of the current one have finished. A generation counter drops
 * callbacks from beats that were paused, skipped, or replaced.
 */
export class BoardSession {
  private beats: BeatInput[] = [];
  private index = 0;
  /** Beats [0, through) are on the board. */
  private through = 0;
  private status: BoardStatus = 'playing';
  private generation = 0;
  private drawKey = 0;
  private started = false;
  private spoken = false;
  private drawn = false;
  private note: string | null = null;
  /** After inserted (follow-up) beats, stop here and let the user choose to continue the original lesson. */
  private pauseAfter = -1;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private idle?: ReturnType<typeof setTimeout>;
  private finished = false;
  /**
   * While the model is still writing the lesson (streaming), more beats may arrive: reaching the last one that has
   * arrived waits for the next instead of finishing. `tail` is where they go: after the last streamed beat (for a
   * follow-up, before the rest of the original lesson).
   */
  private open = false;
  private waiting = false;
  private tail: number;
  private playbackSpeed = 1;
  private words?: WordTiming;
  private audioId?: number;
  private prepared = '';
  private answered = new Set<number>();
  private answerText?: string;
  private edits: BoardEdits = { elements: [], deleted: [] };
  appearance = boardAppearance();
  restoreAppearance(value?: Partial<BoardAppearance>) { this.appearance = boardAppearance(value); }
  setAppearance(value: BoardAppearance) { this.pause(); this.appearance = boardAppearance(value); this.emit(); }
  private undo: BoardEdits[] = []; private redo: BoardEdits[] = [];
  get canUndo() { return !!this.undo.length; } get canRedo() { return !!this.redo.length; }
  restoreEdits(edits?: BoardEdits) { if (edits) this.edits = { elements: edits.elements.slice(0, 200), deleted: edits.deleted.slice(0, 200) }; }
  edit(action: BoardEdit) {
    if (this.finished) return false;
    const visible = this.visibleInputs(), byId = new Map(visible.map(e => [e.id, e]));
    if (action.type === 'undo' || action.type === 'redo') { const from = action.type === 'undo' ? this.undo : this.redo, to = action.type === 'undo' ? this.redo : this.undo; if (!from.length) return false; this.pause(); to.push(this.edits); this.edits = from.pop(); this.emit(); return true; }
    const elements = new Map(this.edits.elements.map(e => [e.id, e])), deleted = new Set(this.edits.deleted);
    if (action.type === 'add') { if (this.inputs().length >= boardLimits.elements || this.inputs().some(e => e.id === action.element.id)
      || action.element.from && !byId.has(action.element.from) || action.element.to && !byId.has(action.element.to)) return false; elements.set(action.element.id, rerouteInput(action.element)); deleted.delete(action.element.id); }
    else { const e = byId.get(action.id); if (!e) return false;
      if (action.type === 'move') { const moved = moveInput(e, action.dx, action.dy); if ([moved.x, moved.y, ...(moved.points?.flatMap(p => [p.x, p.y]) ?? [])].some(v => v !== undefined && (!Number.isFinite(v) || Math.abs(v) > 100000))) return false; elements.set(e.id, moved); }
      if (action.type === 'label') { if (!['rectangle', 'ellipse', 'diamond', 'text', 'arrow'].includes(e.type)) return false;
        elements.set(e.id, { ...e, ...(e.type === 'text' ? { text: action.text } : { label: action.text }), ...(e.type === 'text' || e.type === 'arrow' ? {} : { width: undefined, height: undefined }) }); }
      if (action.type === 'delete') { const remove = (n: ElementInput) => { if (n.user) elements.delete(n.id); else deleted.add(n.id); }; remove(e); for (const n of this.inputs()) if (n.type === 'arrow' && (n.from === e.id || n.to === e.id)) remove(n); }
    }
    this.pause(); this.undo.push(this.edits); this.undo = this.undo.slice(-30); this.redo = [];
    this.edits = { elements: [...elements.values()], deleted: [...deleted] }; this.emit(); return true;
  }
  constructor(readonly id: number, private title: string, beats: BeatInput[], private deps: BoardSessionDeps, private base: ElementInput[] = [], private timing: BoardTiming = boardTiming, private planned = false) {
    this.beats = planned ? beats.slice(0, boardLimits.beats * 2) : repairBeats(beats.slice(0, boardLimits.beats * 2), base);
    this.tail = this.beats.length;
  }
  get ended() { return this.finished; }
  get state() { return this.status; }
  get beat() { return this.index; }
  get count() { return this.beats.length; }
  get name() { return this.title; }
  /** Still being written: see `open`. */
  get streaming() { return this.open; }
  get question() { return this.status === 'asking' ? this.current().ask : undefined; }
  get answer() { return this.answerText; }
  private speed() { return this.deps.teaching?.() ? this.playbackSpeed : this.deps.speed(); }
  private line() { const beat = this.current(); return beat.ask ? `${beat.say} ${beat.ask}` : beat.say; }
  stream() { this.open = true; }
  rename(title: string) { if (title && title !== this.title) { this.title = title; this.emit(); } }
  private applied(through: number) { return applyEdits(this.beats.slice(0, through).reduce(applyBeat, this.base), this.edits); }
  /** Everything on the board right now. */
  scene(): LaidElement[] { return layoutScene(this.applied(this.through)); }
  /** The board as it will look when the whole lesson has played (for follow-up questions). */
  inputs(): ElementInput[] { return this.applied(this.beats.length); }
  visibleInputs(): ElementInput[] { return this.applied(this.through); }
  script(): LessonInput { return { title: this.title, mode: 'new', beats: [...this.beats], appearance: this.appearance, ...(this.edits.elements.length || this.edits.deleted.length ? { edits: this.edits } : {}) }; }
  private current() { return this.beats[Math.min(this.index, this.beats.length - 1)]; }
  view(): BoardView {
    const beat = this.current(), drawing = this.status === 'playing' && this.started && !this.drawn;
    const elements = this.scene(), present = new Set(elements.map(e => e.id)), teaching = this.deps.teaching?.() ?? false;
    const before = teaching ? layoutScene(this.applied(this.index)) : [], changed = (beat.draw ?? []).filter(e => before.some(old => old.id === e.id)).map(e => e.id);
    return { id: this.id, title: this.title, status: this.status, beat: this.index, total: this.beats.length,
      caption: this.status === 'done' ? '' : this.line(), note: this.note, elements,
      drawing: drawing ? { key: this.drawKey, beat: this.index, ids: (beat.draw ?? []).map(e => e.id).filter(id => present.has(id)), durationMs: speechMs(this.line(), this.speed()),
        ...(teaching ? { cues: cueTimings(beat.draw ?? [], this.line(), beat.cues, this.words, this.speed()), audioId: this.audioId } : {}) } : null,
      highlight: this.status === 'playing' && this.started ? (beat.highlight ?? []).filter(id => present.has(id)) : [],
      ...(teaching ? { teaching, speed: this.playbackSpeed, effects: beat.effects, recap: beat.recap, transition: drawing ? { before, erased: beat.erase ?? [], changed } : undefined } : {}) };
  }
  private emit() { if (!this.finished) this.deps.emit(this.view()); }
  private later(fn: () => void, ms: number) {
    const timer = setTimeout(() => { this.timers.delete(timer); fn(); }, ms); this.timers.add(timer);
  }
  private cancelWork() { this.generation++; for (const timer of this.timers) clearTimeout(timer); this.timers.clear(); }
  private touch() { clearTimeout(this.idle); this.idle = setTimeout(() => this.stop(), this.timing.idleMs); }
  start() { this.begin(0); }
  private begin(index: number) {
    this.cancelWork(); this.touch(); this.waiting = false;
    const generation = this.generation, stale = () => generation !== this.generation || this.finished;
    this.index = index; this.through = index; this.status = 'playing'; this.note = null;
    this.started = false; this.spoken = false; this.drawn = false;
    this.words = undefined; this.audioId = undefined; this.prepared = '';
    const beat = this.current();
    this.emit();
    const onStarted = (audioId?: number) => {
      if (stale() || this.started) return;
      this.audioId ??= audioId;
      this.started = true; this.through = index + 1; this.drawKey++;
      const view = this.view(), key = this.drawKey;
      this.deps.emit(view);
      // Nothing to draw, or the overlay never answers: never wait forever.
      if (!view.drawing?.ids.length && !view.transition?.erased.length && !view.transition?.changed.length && !beat.effects?.length) this.drew(key);
      else this.later(() => this.drew(key), view.drawing.durationMs * 1.5 + this.timing.drawSlackMs);
    };
    const reading = () => this.later(() => { if (!stale()) { this.spoken = true; this.advance(); } }, readingMs(this.line()) / (this.deps.teaching?.() ? this.playbackSpeed : 1));
    const voiced = this.deps.speak(this.line(), {
      started: onStarted,
      ...(this.deps.teaching?.() ? { speed: this.speed(), timestamps: (words: WordTiming, audioId: number) => { if (stale()) return;
        this.words = { words: [...(this.words?.words ?? []), ...words.words], start: [...(this.words?.start ?? []), ...words.start], end: [...(this.words?.end ?? []), ...words.end] }; this.audioId = audioId; this.emit(); } } : {}),
      done: end => {
        if (stale()) return;
        if (end === 'cut') { this.pause(); return; }
        // Audio that never started still means the beat is due: draw it now.
        onStarted();
        // A voice failure should not stall the lesson: let the caption be read instead.
        if (end === 'failed') { reading(); return; }
        this.spoken = true; this.advance();
      },
    });
    this.deps.log?.('board:beat', { count: index + 1 });
    if (!voiced) { onStarted(); reading(); }
    this.prepareNext();
  }
  private prepareNext() {
    if (!this.deps.teaching?.() || this.current().ask || this.status !== 'playing') return;
    const next = this.beats[this.index + 1]; if (!next) return;
    const line = next.ask ? `${next.say} ${next.ask}` : next.say;
    if (line !== this.prepared) { this.prepared = line; this.deps.prefetch?.(line, this.speed()); }
  }
  /** The overlay finished animating a beat (or its slack timer fired). */
  drew(key: number) {
    if (this.finished || this.status !== 'playing' || !this.started || key !== this.drawKey || this.drawn) return;
    this.drawn = true; this.emit(); this.advance();
  }
  private advance() {
    if (!this.spoken || !this.drawn || this.status !== 'playing') return;
    const generation = this.generation;
    this.later(() => { if (generation === this.generation && !this.finished) this.proceed(); }, this.deps.teaching?.() ? Math.min(150, this.timing.gapMs) : this.timing.gapMs);
  }
  /** After a beat: the next one, a pause before the rest of the original lesson, the end, or (streaming) a wait. */
  private proceed() {
    if (this.deps.teaching?.() && this.current().ask && !this.answered.has(this.index)) {
      this.cancelWork(); this.status = 'asking'; this.note = this.current().ask; this.deps.cancelPrefetch?.(); this.emit(); return;
    }
    if (this.open && this.index >= this.tail - 1) { this.waiting = true; return; }
    if (this.index === this.pauseAfter && this.index < this.beats.length - 1) {
      // Follow-up answered: wait before the rest of the original lesson.
      this.pauseAfter = -1; this.cancelWork();
      this.index++; this.status = 'paused'; this.note = 'Say “continue” to pick up where we left off.'; this.emit(); return;
    }
    if (this.index < this.beats.length - 1) this.begin(this.index + 1); else this.finish();
  }
  /** Streamed beats, placed after the last ones that arrived. A lesson waiting for them carries on at once. */
  append(beats: BeatInput[], planned = this.planned) {
    if (this.finished || !beats.length) return;
    const added = beats.slice(0, Math.max(0, boardLimits.beats * 2 - this.beats.length));
    if (!added.length) return;
    this.beats.splice(this.tail, 0, ...(planned ? added : repairBeats(added, this.applied(this.tail))));
    if (this.pauseAfter >= 0) this.pauseAfter = this.tail + added.length - 1;
    this.tail += added.length;
    this.prepareNext();
    if (this.waiting && this.status === 'playing') { this.waiting = false; this.begin(this.index + 1); } else this.emit();
  }
  /** The lesson is complete: no more beats will arrive. */
  seal() {
    if (!this.open) return;
    this.open = false;
    if (this.waiting && this.status === 'playing') { this.waiting = false; this.proceed(); }
  }
  private finish() {
    this.cancelWork(); this.touch();
    this.status = 'done'; this.through = this.beats.length; this.index = this.beats.length - 1; this.started = true; this.drawn = true;
    this.note = 'That’s the picture. Ask me anything about it.';
    this.emit(); this.deps.log?.('board:done', { count: this.beats.length });
  }
  /** Pausing mid-beat shows that beat fully drawn; resuming says it again. */
  pause() {
    if (this.finished || this.status !== 'playing') return;
    this.cancelWork(); this.touch(); this.deps.silence(); this.deps.cancelPrefetch?.();
    this.status = 'paused'; this.note = 'Paused. Say “continue” when you’re ready.';
    this.emit();
  }
  resume() {
    if (this.finished) return '';
    if (this.status === 'done') return 'We’re at the end. Say “replay” to watch it again.';
    if (this.status === 'asking') return this.next();
    if (this.status === 'paused') this.begin(this.index);
    return '';
  }
  next() {
    if (this.finished || this.status === 'done') return '';
    this.deps.silence(); this.deps.cancelPrefetch?.();
    if (this.status === 'asking') this.answered.add(this.index);
    // The newest beat while more are being written: show it whole and wait for the next.
    if (this.open && this.index >= this.tail - 1 && this.status === 'playing') {
      this.cancelWork(); this.started = true; this.spoken = true; this.drawn = true; this.through = this.index + 1; this.waiting = true; this.emit(); return '';
    }
    // Paused before an undrawn beat: "next" means that beat.
    if (this.status === 'paused' && this.through === this.index) { this.begin(this.index); return ''; }
    if (this.index >= this.beats.length - 1) { this.finish(); return 'That’s the end of the lesson.'; }
    this.begin(this.index + 1); return '';
  }
  repeat() {
    if (this.finished) return '';
    this.deps.silence(); this.begin(this.index); return '';
  }
  previous() { return this.jump(Math.max(0, this.index - 1)); }
  jump(index: number) { if (this.finished || !Number.isInteger(index) || index < 0 || index >= this.beats.length) return ''; this.deps.cancelPrefetch?.(); this.deps.silence(); this.answered = new Set([...this.answered].filter(i => i < index)); this.pauseAfter = -1; this.begin(index); return ''; }
  setSpeed(speed: number) { if (!Number.isFinite(speed) || speed < 0.75 || speed > 1.5) return; this.playbackSpeed = speed; this.deps.cancelPrefetch?.(); if (this.status === 'playing') { this.deps.silence(); this.begin(this.index); } else this.emit(); }
  answerQuestion(text: string) { if (this.status !== 'asking') return; this.answerText = text.slice(0, 1200); this.answered.add(this.index); this.status = 'paused'; this.note = 'Let’s look at your answer.'; this.emit(); }
  replay() { if (this.finished) return ''; this.deps.cancelPrefetch?.(); this.answered.clear(); this.answerText = undefined; this.deps.silence(); this.pauseAfter = -1; this.begin(0); return ''; }
  /** Follow-up beats: drawn right after what is on the board, keeping everything already drawn. */
  insert(beats: BeatInput[], planned = this.planned) {
    if (this.finished || !beats.length) return;
    const added = beats.slice(0, Math.max(0, boardLimits.beats * 2 - this.beats.length));
    if (!added.length) return;
    this.answerText = undefined;
    const at = this.status === 'done' ? this.beats.length : this.through;
    const remaining = this.beats.length - at;
    this.beats.splice(at, 0, ...(planned ? added : repairBeats(added, this.applied(at))));
    // Repair the remaining original beats around the inserted follow-up, without moving the prefix.
    if (!planned) this.beats.splice(at + added.length, remaining, ...repairBeats(this.beats.slice(at + added.length), this.applied(at + added.length)));
    this.pauseAfter = remaining > 0 ? at + added.length - 1 : -1;
    this.tail = at + added.length;
    this.deps.silence(); this.begin(at);
  }
  /** Overlay reloads or a display change: resend the frame without restarting anything. */
  refresh() { this.emit(); }
  stop() {
    if (this.finished) return;
    this.cancelWork(); this.finished = true; clearTimeout(this.idle);
    this.deps.cancelPrefetch?.();
    this.deps.silence(); this.deps.emit(null); this.deps.log?.('board:closed');
  }
}
