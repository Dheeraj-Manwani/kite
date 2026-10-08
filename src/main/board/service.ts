import { classifyBoardCommand, describeScene, layoutScene, markLabel, type BoardAction, type BoardView, type ElementInput, type LessonInput, type LessonStats, type LooseLesson, sanitizeLesson } from '../../shared/board';
import { lessonMetrics } from '../../shared/boardMetrics';
import type { StreamEnd, ToolResult } from '../tools/types';
import { BoardSession, type BoardSessionDeps } from './session';
import { routingHints } from '../ai/routing';
export interface BoardServiceDeps extends Omit<BoardSessionDeps, 'emit'> {
  emit(view: BoardView | null): void;
  enabled(): boolean;
  /** Called when a lesson opens, so a guide or task that also moves the kite can yield. */
  opened?(): void;
  /** Whether captions show (see BoardView.captions); shown when absent. */
  captions?(): boolean;
  now?(): number;
}
interface Stream { session: BoardSession; count: number; base: ElementInput[]; adding: boolean }
/** Owns the one whiteboard lesson on screen and answers its voice commands locally. */
export class BoardService {
  private session?: BoardSession;
  private sequence = 0;
  /** The latest lesson's numbers for the dev panel, and when its model request began (until the first stroke). */
  private stats?: LessonStats;
  private requestedAt?: number;
  /** Presentation mode, until "smaller" or the board is put away. */
  private presenting = false;
  constructor(private deps: BoardServiceDeps) {}
  private now() { return this.deps.now?.() ?? performance.now(); }
  get active() { return !!this.session && !this.session.ended; }
  /**
   * Lessons the model is still writing, by tool call: the session their beats went to, how many arrived, and the
   * board they were written against (for repairs). The final call is matched to its stream by the same call id.
   */
  private streams = new Map<string, Stream>();
  /**
   * Start a lesson, or finish one that was streamed. `requestedAt`: when the model request that wrote it began
   * (performance.now()), for the time to first stroke. `callId`: the tool call, to find its stream.
   */
  start(written: LooseLesson, meta: { requestedAt?: number; callId?: string } = {}): ToolResult {
    if (!this.deps.enabled()) return { ok: false, message: 'The whiteboard is turned off in Settings.' };
    const stream = meta.callId ? this.streams.get(meta.callId) : undefined;
    if (stream && meta.callId) { this.streams.delete(meta.callId); return this.complete(stream, written); }
    const current = this.active ? this.session : undefined, adding = written.mode === 'add' && !!current;
    const base = adding ? current.inputs() : [];
    // Repair instead of reject: the model learns what was changed, and the lesson plays.
    const { lesson, fixes } = sanitizeLesson(written, base.map(e => e.id));
    if (!lesson.beats.length) return { ok: false, message: `Nothing in that lesson could be drawn (${fixes.join('; ')}). Each beat needs a "say" and elements with a type and a position.` };
    this.measure(lesson, base, meta.requestedAt, fixes.length);
    if (adding) { current.insert(lesson.beats); this.deps.log?.('board:add', { count: lesson.beats.length }); }
    else this.open(lesson).start();
    return this.result(lesson.title, adding, fixes);
  }
  /**
   * Beats of a lesson the model is still writing (complete ones only, as written so far). The first opens the board or
   * joins the open one, so drawing starts long before the whole lesson exists; later ones follow it.
   */
  preview(callId: string, written: LooseLesson, meta: { requestedAt?: number } = {}) {
    if (!this.deps.enabled()) return;
    const stream = this.streams.get(callId);
    if (stream) {
      if (stream.session.ended || this.session !== stream.session) return;
      const { lesson } = sanitizeLesson(written, stream.base.map(e => e.id));
      if (written.title?.trim()) stream.session.rename(lesson.title);
      const fresh = lesson.beats.slice(stream.count);
      if (fresh.length) { stream.count = lesson.beats.length; stream.session.append(fresh); }
      return;
    }
    const current = this.active ? this.session : undefined;
    // With a board open, a follow-up and a new topic look alike until the model says which.
    if (current && written.mode === undefined) return;
    const adding = written.mode === 'add' && !!current, base = adding ? current.inputs() : [];
    const { lesson, fixes } = sanitizeLesson(written, base.map(e => e.id));
    if (!lesson.beats.length) return;
    this.measure(lesson, base, meta.requestedAt, fixes.length);
    let session: BoardSession;
    if (adding) { session = current; session.stream(); session.insert(lesson.beats); this.deps.log?.('board:add', { count: lesson.beats.length, streamed: true }); }
    else { session = this.open(lesson); session.stream(); session.start(); }
    this.streams.set(callId, { session, count: lesson.beats.length, base, adding });
  }
  /** The streamed lesson's final input: add what has not arrived yet, settle its title, and let it end. */
  private complete(stream: Stream, written: LooseLesson): ToolResult {
    const { lesson, fixes } = sanitizeLesson(written, stream.base.map(e => e.id));
    if (stream.session.ended || this.session !== stream.session) return { ok: true, message: 'The whiteboard was closed while the lesson was being drawn.', transcript: `(Started a sketch: ${lesson.title})` };
    stream.session.append(lesson.beats.slice(stream.count));
    stream.session.rename(lesson.title);
    stream.session.seal();
    this.measure(lesson, stream.base, undefined, fixes.length, true);
    return this.result(lesson.title, stream.adding, fixes);
  }
  /**
   * A streamed lesson that will never be executed. Cut off or interrupted: the beats that arrived play, and a cut-off
   * turn ends on them. Rejected as invalid: a new board is put away (the model is told, and writes it again).
   */
  endStream(callId: string, end: StreamEnd): ToolResult | undefined {
    const stream = this.streams.get(callId); if (!stream) return undefined;
    this.streams.delete(callId);
    if (stream.session.ended || this.session !== stream.session) return undefined;
    this.deps.log?.('board:streamEnd', { end, count: stream.count });
    if (end === 'rejected' && !stream.adding) { stream.session.stop(); return undefined; }
    stream.session.seal();
    return end === 'truncated' ? { ok: true, message: 'The lesson was cut off; Kite is playing the beats that arrived.', transcript: `(Sketched on the whiteboard: ${stream.session.name})` } : undefined;
  }
  private result(title: string, adding: boolean, fixes: string[]): ToolResult {
    const fixed = fixes.length ? ` Fixed: ${fixes.join('; ')}.` : '';
    return adding ? { ok: true, message: `Added to the whiteboard. Kite is drawing and narrating the new beats itself.${fixed}`, transcript: `(Added to the whiteboard: ${title})` }
      : { ok: true, message: `The whiteboard is open. Kite is drawing each beat and narrating it itself.${fixed}`, transcript: `(Sketched on the whiteboard: ${title})` };
  }
  /** A new lesson replaces whatever is on the board. */
  private open(lesson: LessonInput) {
    this.session?.stop();
    const session: BoardSession = new BoardSession(++this.sequence, lesson.title, lesson.beats, {
      ...this.deps,
      emit: view => {
        if (this.session !== session) return;
        if (view === null) this.session = undefined;
        this.deps.emit(view && this.annotate(view));
      },
      speak: (text, hooks) => this.session === session && this.deps.speak(text, hooks),
      silence: () => { if (this.session === session) this.deps.silence(); },
    });
    this.session = session;
    this.deps.opened?.();
    this.deps.log?.('board:start', { count: lesson.beats.length });
    return session;
  }
  /** `keepClock`: the same lesson, now complete (streamed): its time to first stroke is already measured or running. */
  private measure(lesson: LessonInput, base: ElementInput[], requestedAt: number | undefined, fixes: number, keepClock = false) {
    const m = lessonMetrics(lesson.beats, base);
    const first = keepClock ? this.stats?.firstStrokeMs : undefined;
    this.stats = { repairs: 0, fixes, beats: m.beats, elements: m.elements, ...(first !== undefined ? { firstStrokeMs: first } : {}),
      lint: { overlaps: m.overlaps, overflow: m.overflow, through: m.through, crossings: m.crossings, textOnLines: m.textOnLines, minTextPx: m.minTextPx } };
    if (!keepClock) this.requestedAt = requestedAt;
  }
  /** Every view carries the lesson's stats; the first one that draws stops the first-stroke clock. */
  private annotate(view: BoardView): BoardView {
    view = { ...view, captions: this.deps.captions?.() ?? true, presenting: this.presenting };
    if (!this.stats) return view;
    if (view.drawing && this.requestedAt !== undefined) {
      this.stats = { ...this.stats, firstStrokeMs: Math.round(this.now() - this.requestedAt) }; this.requestedAt = undefined;
      this.deps.log?.('board:lesson', { ...this.stats });
    }
    return { ...view, stats: this.stats };
  }
  /** Token use of the model calls that wrote the latest lesson, known once its call has finished. */
  usage(outputTokens: number | undefined, repairs: number) {
    if (!this.stats) return;
    this.stats = { ...this.stats, outputTokens, repairs };
    this.deps.log?.('board:lesson', { ...this.stats });
    this.refresh();
  }
  /** A voice utterance while a board is open. Returns the spoken reply, or undefined to use the model. */
  command(text: string): string | undefined {
    const session = this.active ? this.session : undefined; if (!session) return undefined;
    const action = classifyBoardCommand(text);
    return action === 'new-request' ? undefined : this.apply(session, action);
  }
  control(action: BoardAction) { const session = this.active ? this.session : undefined; if (session) this.apply(session, action); }
  private apply(session: BoardSession, action: BoardAction): string {
    switch (action) {
      case 'pause': session.pause(); return 'Okay, I’ll wait.';
      case 'resume': return session.resume();
      case 'next': return session.next();
      case 'repeat': return session.repeat();
      case 'replay': return session.replay();
      case 'close': session.stop(); return 'Okay, I’ve put the board away.';
      case 'bigger': case 'smaller': this.presenting = action === 'bigger'; session.refresh(); return '';
    }
  }
  drawn(id: number, key: number) { if (this.session?.id === id) this.session.drew(key); }
  /** System context: when to draw, and what is on the board now. Board text was written by the model, never the screen. */
  context(): string | undefined {
    if (!this.deps.enabled()) return undefined;
    const session = this.active ? this.session : undefined;
    if (!session) return routingHints.board;
    const status = session.state === 'done' ? 'finished' : session.state;
    return `Kite's whiteboard is open with the lesson "${session.name}" (beat ${session.beat + 1} of ${session.count}, ${status}). Its elements, with ids you can reuse:
${describeScene(layoutScene(session.inputs()))}
For a follow-up about it, call explain_on_whiteboard with mode "add": highlight the ids you talk about and draw new elements in free space. Use mode "new" only for a different topic. Kite itself handles "pause", "continue", "next", "repeat", "replay" and "close the board".`;
  }
  /** Describe board elements the user marked while asking, for the user's message. Unknown ids are ignored. */
  marks(ids: string[]): string | undefined {
    const session = this.active ? this.session : undefined; if (!session || !ids.length) return undefined;
    const byId = new Map(session.scene().map(e => [e.id, e]));
    const found = [...new Set(ids)].map(id => byId.get(id)).filter(Boolean).slice(0, 8);
    return found.length ? `On Kite's whiteboard the user marked: ${found.map(markLabel).join(', ')}. Words like "this" or "that" refer to it.` : undefined;
  }
  title() { return this.active ? this.session?.name : undefined; }
  pause() { if (this.active) this.session?.pause(); }
  refresh() { if (this.active) this.session?.refresh(); }
  close() { this.streams.clear(); this.presenting = false; this.session?.stop(); this.session = undefined; }
  /** A built-in lesson for demos and manual testing: no model or key needed. */
  demo() { return this.start(demoLesson); }
}
export const demoLesson: LessonInput = { title: 'How a kite flies', mode: 'new', beats: [
  { say: 'Here’s a kite. It stays up because moving air pushes on its tilted sail.', draw: [
    { id: 'title', type: 'text', x: 60, y: 40, text: 'How a kite flies', size: 'title' },
    { id: 'kite', type: 'diamond', x: 690, y: 250, width: 220, height: 280, label: 'Sail', color: 'blue', fill: 'hachure' },
  ] },
  { say: 'Wind blows in from the left and hits the sail at an angle.', draw: [
    { id: 'wind1', type: 'arrow', points: [{ x: 230, y: 340 }, { x: 640, y: 340 }], color: 'gray', dashed: true, label: 'wind' },
    { id: 'wind2', type: 'arrow', points: [{ x: 230, y: 440 }, { x: 640, y: 440 }], color: 'gray', dashed: true },
  ] },
  { say: 'The sail deflects that air downward, so the air pushes the kite up. That push is lift.', draw: [
    { id: 'lift', type: 'arrow', points: [{ x: 800, y: 235 }, { x: 800, y: 120 }], color: 'green', label: 'Lift' },
  ] },
  { say: 'The same wind also drags the kite backward, away from you.', draw: [
    { id: 'drag', type: 'arrow', points: [{ x: 925, y: 390 }, { x: 1180, y: 390 }], color: 'red', label: 'Drag' },
  ] },
  { say: 'Your string pulls the other way. That tension holds the kite against the wind.', draw: [
    { id: 'you', type: 'ellipse', x: 1220, y: 730, width: 90, height: 90, label: 'You' },
    { id: 'string', type: 'line', points: [{ x: 800, y: 530 }, { x: 1010, y: 640 }, { x: 1225, y: 760 }] },
    { id: 'tension', type: 'arrow', points: [{ x: 880, y: 640 }, { x: 1080, y: 750 }], color: 'orange', label: 'Tension' },
  ] },
  { say: 'Lift up, drag back, tension down. When the three balance, the kite hangs in the sky.', highlight: ['lift', 'drag', 'tension'], draw: [
    { id: 'rule', type: 'text', x: 60, y: 780, text: 'lift + drag + tension = balance', size: 'large', color: 'purple' },
  ] },
] };
