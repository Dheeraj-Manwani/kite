import { classifyBoardCommand, describeScene, layoutScene, markLabel, type BoardAction, type BoardView, type ElementInput, type LessonInput, type LessonStats } from '../../shared/board';
import { lessonMetrics } from '../../shared/boardMetrics';
import type { ToolResult } from '../tools/types';
import { BoardSession, type BoardSessionDeps } from './session';
import { routingHints } from '../ai/routing';
export interface BoardServiceDeps extends Omit<BoardSessionDeps, 'emit'> {
  emit(view: BoardView | null): void;
  enabled(): boolean;
  /** Called when a lesson opens, so a guide or task that also moves the kite can yield. */
  opened?(): void;
  now?(): number;
}
/** Owns the one whiteboard lesson on screen and answers its voice commands locally. */
export class BoardService {
  private session?: BoardSession;
  private sequence = 0;
  /** The latest lesson's numbers for the dev panel, and when its model request began (until the first stroke). */
  private stats?: LessonStats;
  private requestedAt?: number;
  constructor(private deps: BoardServiceDeps) {}
  private now() { return this.deps.now?.() ?? performance.now(); }
  get active() { return !!this.session && !this.session.ended; }
  /** `requestedAt`: when the model request that wrote this lesson began (performance.now()), for the time to first stroke. */
  start(lesson: LessonInput, meta: { requestedAt?: number } = {}): ToolResult {
    if (!this.deps.enabled()) return { ok: false, message: 'The whiteboard is turned off in Settings.' };
    const current = this.active ? this.session : undefined;
    this.measure(lesson, lesson.mode === 'add' && current ? current.inputs() : [], meta.requestedAt);
    if (lesson.mode === 'add' && current) {
      current.insert(lesson.beats);
      this.deps.log?.('board:add', { count: lesson.beats.length });
      return { ok: true, message: 'Added to the whiteboard. Kite is drawing and narrating the new beats itself. Reply with one short sentence at most; do not repeat the narration.' };
    }
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
    session.start();
    return { ok: true, message: 'The whiteboard is open. Kite is drawing each beat and narrating it itself. Reply with one short sentence such as "Let me sketch it out." Do not repeat or list the narration.' };
  }
  private measure(lesson: LessonInput, base: ElementInput[], requestedAt: number | undefined) {
    const m = lessonMetrics(lesson.beats, base);
    this.stats = { repairs: 0, beats: m.beats, elements: m.elements,
      lint: { overlaps: m.overlaps, overflow: m.overflow, through: m.through, crossings: m.crossings, textOnLines: m.textOnLines, minTextPx: m.minTextPx } };
    this.requestedAt = requestedAt;
  }
  /** Every view carries the lesson's stats; the first one that draws stops the first-stroke clock. */
  private annotate(view: BoardView): BoardView {
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
  close() { this.session?.stop(); this.session = undefined; }
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
