import { applyBeat, boardLimits, layoutScene, readingMs, speechMs, type BeatInput, type BoardStatus, type BoardView, type ElementInput, type LaidElement } from '../../shared/board';
/** How a spoken beat ended: heard in full, cut off (the user took over), or the voice failed. */
export type SpeechEnd = 'spoken' | 'cut' | 'failed';
export interface BoardSessionDeps {
  emit(view: BoardView | null): void;
  /**
   * Speak a beat quietly. `started` fires when its audio begins (drawing starts then, so the pen matches
   * the words); `done` fires once. Returns false when voice is off: the caption is read instead.
   */
  speak(text: string, hooks: { started(): void; done(end: SpeechEnd): void }): boolean;
  /** Cancel queued or playing lesson speech. */
  silence(): void;
  speed(): number;
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
  constructor(readonly id: number, private title: string, beats: BeatInput[], private deps: BoardSessionDeps, private base: ElementInput[] = [], private timing: BoardTiming = boardTiming) {
    this.beats = beats.slice(0, boardLimits.beats);
  }
  get ended() { return this.finished; }
  get state() { return this.status; }
  get beat() { return this.index; }
  get count() { return this.beats.length; }
  get name() { return this.title; }
  private applied(through: number) { return this.beats.slice(0, through).reduce(applyBeat, this.base); }
  /** Everything on the board right now. */
  scene(): LaidElement[] { return layoutScene(this.applied(this.through)); }
  /** The board as it will look when the whole lesson has played (for follow-up questions). */
  inputs(): ElementInput[] { return this.applied(this.beats.length); }
  private current() { return this.beats[Math.min(this.index, this.beats.length - 1)]; }
  view(): BoardView {
    const beat = this.current(), drawing = this.status === 'playing' && this.started && !this.drawn;
    const elements = this.scene(), present = new Set(elements.map(e => e.id));
    return { id: this.id, title: this.title, status: this.status, beat: this.index, total: this.beats.length,
      caption: this.status === 'done' ? '' : beat.say, note: this.note, elements,
      drawing: drawing ? { key: this.drawKey, beat: this.index, ids: (beat.draw ?? []).map(e => e.id).filter(id => present.has(id)), durationMs: speechMs(beat.say, this.deps.speed()) } : null,
      highlight: this.status === 'playing' && this.started ? (beat.highlight ?? []).filter(id => present.has(id)) : [] };
  }
  private emit() { if (!this.finished) this.deps.emit(this.view()); }
  private later(fn: () => void, ms: number) {
    const timer = setTimeout(() => { this.timers.delete(timer); fn(); }, ms); this.timers.add(timer);
  }
  private cancelWork() { this.generation++; for (const timer of this.timers) clearTimeout(timer); this.timers.clear(); }
  private touch() { clearTimeout(this.idle); this.idle = setTimeout(() => this.stop(), this.timing.idleMs); }
  start() { this.begin(0); }
  private begin(index: number) {
    this.cancelWork(); this.touch();
    const generation = this.generation, stale = () => generation !== this.generation || this.finished;
    this.index = index; this.through = index; this.status = 'playing'; this.note = null;
    this.started = false; this.spoken = false; this.drawn = false;
    const beat = this.current();
    this.emit();
    const onStarted = () => {
      if (stale() || this.started) return;
      this.started = true; this.through = index + 1; this.drawKey++;
      const view = this.view(), key = this.drawKey;
      this.deps.emit(view);
      // Nothing to draw, or the overlay never answers: never wait forever.
      if (!view.drawing?.ids.length) this.drew(key);
      else this.later(() => this.drew(key), view.drawing.durationMs * 1.5 + this.timing.drawSlackMs);
    };
    const reading = () => this.later(() => { if (!stale()) { this.spoken = true; this.advance(); } }, readingMs(beat.say));
    const voiced = this.deps.speak(beat.say, {
      started: onStarted,
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
  }
  /** The overlay finished animating a beat (or its slack timer fired). */
  drew(key: number) {
    if (this.finished || this.status !== 'playing' || !this.started || key !== this.drawKey || this.drawn) return;
    this.drawn = true; this.emit(); this.advance();
  }
  private advance() {
    if (!this.spoken || !this.drawn || this.status !== 'playing') return;
    const generation = this.generation;
    this.later(() => {
      if (generation !== this.generation || this.finished) return;
      if (this.index === this.pauseAfter && this.index < this.beats.length - 1) {
        // Follow-up answered: wait before the rest of the original lesson.
        this.pauseAfter = -1; this.cancelWork();
        this.index++; this.status = 'paused'; this.note = 'Say “continue” to pick up where we left off.'; this.emit(); return;
      }
      if (this.index < this.beats.length - 1) this.begin(this.index + 1); else this.finish();
    }, this.timing.gapMs);
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
    this.cancelWork(); this.touch(); this.deps.silence();
    this.status = 'paused'; this.note = 'Paused. Say “continue” when you’re ready.';
    this.emit();
  }
  resume() {
    if (this.finished) return '';
    if (this.status === 'done') return 'We’re at the end. Say “replay” to watch it again.';
    if (this.status === 'paused') this.begin(this.index);
    return '';
  }
  next() {
    if (this.finished || this.status === 'done') return '';
    this.deps.silence();
    // Paused before an undrawn beat: "next" means that beat.
    if (this.status === 'paused' && this.through === this.index) { this.begin(this.index); return ''; }
    if (this.index >= this.beats.length - 1) { this.finish(); return 'That’s the end of the lesson.'; }
    this.begin(this.index + 1); return '';
  }
  repeat() {
    if (this.finished) return '';
    this.deps.silence(); this.begin(this.index); return '';
  }
  replay() { if (this.finished) return ''; this.deps.silence(); this.pauseAfter = -1; this.begin(0); return ''; }
  /** Follow-up beats: drawn right after what is on the board, keeping everything already drawn. */
  insert(beats: BeatInput[]) {
    if (this.finished || !beats.length) return;
    const added = beats.slice(0, Math.max(0, boardLimits.beats * 2 - this.beats.length));
    if (!added.length) return;
    const at = this.status === 'done' ? this.beats.length : this.through;
    const remaining = this.beats.length - at;
    this.beats.splice(at, 0, ...added);
    this.pauseAfter = remaining > 0 ? at + added.length - 1 : -1;
    this.deps.silence(); this.begin(at);
  }
  /** Overlay reloads or a display change: resend the frame without restarting anything. */
  refresh() { this.emit(); }
  stop() {
    if (this.finished) return;
    this.cancelWork(); this.finished = true; clearTimeout(this.idle);
    this.deps.silence(); this.deps.emit(null); this.deps.log?.('board:closed');
  }
}
