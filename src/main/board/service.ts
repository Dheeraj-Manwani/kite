import { classifyBoardCommand, describeScene, layoutScene, markLabel, repairLesson, type BoardAction, type BoardView, type ElementInput, type LessonInput, type LessonStats, type LooseLesson, type SavedBoard, sanitizeLesson } from '../../shared/board';
import { randomUUID } from 'node:crypto';
import { lessonMetrics } from '../../shared/boardMetrics';
import type { StreamEnd, ToolResult } from '../tools/types';
import { BoardSession, boardTiming, type BoardSessionDeps } from './session';
import { adaptSavedLesson, type BoardScript } from '../../shared/boardScript';
import { routingHints } from '../ai/routing';
export interface BoardServiceDeps extends Omit<BoardSessionDeps, 'emit'> {
  emit(view: BoardView | null): void;
  enabled(): boolean;
  /** Called when a lesson opens, so a guide or task that also moves the kite can yield. */
  opened?(): void;
  /** Whether captions show (see BoardView.captions); shown when absent. */
  captions?(): boolean;
  now?(): number;
  save?(board: SavedBoard): void;
  structured?(): boolean;
}
interface Stream { session: BoardSession; count: number; base: ElementInput[]; adding: boolean; structureBase?: BoardScript }
/** Owns the one whiteboard lesson on screen and answers its voice commands locally. */
export class BoardService {
  private session?: BoardSession;
  private sequence = 0;
  /** The latest lesson's numbers for the dev panel, and when its model request began (until the first stroke). */
  private stats?: LessonStats;
  private requestedAt?: number;
  /** Presentation mode, until "smaller" or the board is put away. */
  private presenting = false;
  private archive?: { id: string; messageId: number };
  private savedRevision?: string;
  private structure?: BoardScript;
  private planEpoch = 0;
  private planning?: AbortController;
  private parents: { session: BoardSession; structure?: BoardScript; archive?: { id: string; messageId: number }; revision?: string; stats?: LessonStats }[] = [];
  private inheritedStats?: LessonStats;
  constructor(private deps: BoardServiceDeps) {}
  private now() { return this.deps.now?.() ?? performance.now(); }
  get active() { return !!this.session && !this.session.ended; }
  inputs() { return this.active ? this.session.inputs() : []; }
  visibleIds() { return this.active ? this.session.visibleInputs().map(e => e.id) : []; }
  structuredContext() { return this.active ? this.structure : undefined; }
  beginPlan() { this.planning?.abort(); this.planning = new AbortController(); return ++this.planEpoch; }
  planSignal() { return this.planning?.signal; }
  currentPlan(epoch: number) { return this.planEpoch === epoch && this.deps.enabled(); }
  private lesson(written: LooseLesson, base: ElementInput[]) {
    return written.structure ? { lesson: written as LessonInput, fixes: [] as string[] } : sanitizeLesson(written, base.map(e => e.id));
  }
  private rememberStructure(script?: BoardScript, base?: BoardScript) {
    if (!script) { this.structure = undefined; return; }
    this.structure = base ? { ...base, nodes: [...base.nodes, ...script.nodes], edges: [...base.edges, ...script.edges], beats: [...base.beats, ...script.beats] } : script;
  }
  /**
   * Lessons the model is still writing, by tool call: the session their beats went to, how many arrived, and the
   * board they were written against (for repairs). The final call is matched to its stream by the same call id.
   */
  private streams = new Map<string, Stream>();
  /**
   * Start a lesson, or finish one that was streamed. `requestedAt`: when the model request that wrote it began
   * (performance.now()), for the time to first stroke. `callId`: the tool call, to find its stream.
   */
  start(written: LooseLesson, meta: { requestedAt?: number; callId?: string; messageId?: number | null } = {}): ToolResult {
    if (!this.deps.enabled()) return { ok: false, message: 'The whiteboard is turned off in Settings.' };
    const stream = meta.callId ? this.streams.get(meta.callId) : undefined;
    if (stream && meta.callId) { this.streams.delete(meta.callId); return this.complete(stream, written); }
    const current = this.active ? this.session : undefined, adding = written.mode === 'add' && !!current;
    const base = adding ? current.inputs() : [];
    // Repair instead of reject: the model learns what was changed, and the lesson plays.
    const { lesson, fixes } = this.lesson(written, base);
    if (!lesson.beats.length) return { ok: false, message: `Nothing in that lesson could be drawn (${fixes.join('; ')}). Each beat needs a "say" and elements with a type and a position.` };
    this.measure(lesson, base, meta.requestedAt, fixes.length);
    if (adding) { this.rememberStructure(lesson.structure, this.structure); current.insert(lesson.beats, !!lesson.structure); this.deps.log?.('board:add', { count: lesson.beats.length }); }
    else { const session = this.open(lesson, meta.messageId); this.rememberStructure(lesson.structure); session.start(); }
    return this.result(lesson.title, adding, fixes);
  }
  /**
   * Beats of a lesson the model is still writing (complete ones only, as written so far). The first opens the board or
   * joins the open one, so drawing starts long before the whole lesson exists; later ones follow it.
   */
  preview(callId: string, written: LooseLesson, meta: { requestedAt?: number; messageId?: number | null } = {}) {
    if (!this.deps.enabled()) return;
    const stream = this.streams.get(callId);
    if (stream) {
      if (stream.session.ended || this.session !== stream.session) return;
      const { lesson } = this.lesson(written, stream.base);
      this.rememberStructure(lesson.structure, stream.structureBase);
      if (written.title?.trim()) stream.session.rename(lesson.title);
      const fresh = lesson.beats.slice(stream.count);
      if (fresh.length) { stream.count = lesson.beats.length; stream.session.append(fresh, !!lesson.structure); }
      return;
    }
    const current = this.active ? this.session : undefined;
    // With a board open, a follow-up and a new topic look alike until the model says which.
    if (current && written.mode === undefined) return;
    const adding = written.mode === 'add' && !!current, base = adding ? current.inputs() : [];
    const { lesson, fixes } = this.lesson(written, base);
    const structureBase = adding ? this.structure : undefined;
    if (!lesson.beats.length) return;
    this.measure(lesson, base, meta.requestedAt, fixes.length);
    let session: BoardSession;
    if (adding) { session = current; session.stream(); this.rememberStructure(lesson.structure, structureBase); session.insert(lesson.beats, !!lesson.structure); this.deps.log?.('board:add', { count: lesson.beats.length, streamed: true }); }
    else { session = this.open(lesson, meta.messageId); this.rememberStructure(lesson.structure); session.stream(); session.start(); }
    this.streams.set(callId, { session, count: lesson.beats.length, base, adding, structureBase });
  }
  /** The streamed lesson's final input: add what has not arrived yet, settle its title, and let it end. */
  private complete(stream: Stream, written: LooseLesson): ToolResult {
    const { lesson, fixes } = this.lesson(written, stream.base);
    if (stream.session.ended || this.session !== stream.session) return { ok: true, message: 'The whiteboard was closed while the lesson was being drawn.', transcript: `(Started a sketch: ${lesson.title})` };
    this.rememberStructure(lesson.structure, stream.structureBase);
    stream.session.append(lesson.beats.slice(stream.count), !!lesson.structure);
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
    if (end === 'rejected' && !stream.adding) { this.archive = undefined; stream.session.stop(); return undefined; }
    stream.session.seal();
    return end === 'truncated' ? { ok: true, message: 'The lesson was cut off; Kite is playing the beats that arrived.', transcript: `(Sketched on the whiteboard: ${stream.session.name})` } : undefined;
  }
  private result(title: string, adding: boolean, fixes: string[]): ToolResult {
    const changes = [...fixes];
    if ((this.stats?.fixes ?? 0) > fixes.length) changes.push('adjusted scene layout for readability');
    const fixed = changes.length ? ` Fixed: ${changes.join('; ')}.` : '';
    return adding ? { ok: true, message: `Added to the whiteboard. Kite is drawing and narrating the new beats itself.${fixed}`, transcript: `(Added to the whiteboard: ${title})` }
      : { ok: true, message: `The whiteboard is open. Kite is drawing each beat and narrating it itself.${fixed}`, transcript: `(Sketched on the whiteboard: ${title})` };
  }
  /** A new lesson replaces whatever is on the board. */
  private open(lesson: LessonInput, messageId?: number | null, savedId?: string) {
    if (lesson.structure?.navigation === 'child' && this.deps.teaching?.() && this.active && this.parents.length < 8) {
      this.session.seal(); this.session.pause(); this.persist(this.session); this.parents.push({ session: this.session, structure: this.structure, archive: this.archive, revision: this.savedRevision, stats: this.inheritedStats });
    } else { this.session?.stop(); if (lesson.mode !== 'add') { for (const parent of this.parents) parent.session.stop(); this.parents = []; } }
    this.archive = messageId ? { id: savedId ?? randomUUID(), messageId } : undefined;
    this.savedRevision = undefined;
    const session: BoardSession = new BoardSession(++this.sequence, lesson.title, lesson.beats, {
      ...this.deps,
      emit: view => {
        if (this.session !== session) return;
        if (view === null || view.status === 'done') this.persist(session);
        if (view === null) this.session = undefined;
        this.deps.emit(view && this.annotate(view));
      },
      speak: (text, hooks) => this.session === session && this.deps.speak(text, hooks),
      silence: () => { if (this.session === session) this.deps.silence(); },
    }, [], boardTiming, !!lesson.structure);
    this.session = session;
    this.deps.opened?.();
    this.deps.log?.('board:start', { count: lesson.beats.length });
    return session;
  }
  private persist(session: BoardSession) {
    if (!this.archive || !this.deps.save) return;
    const snapshot = { ...this.archive, title: session.name, lesson: { ...session.script(), ...(this.structure ? { structure: this.structure } : {}) }, scene: session.scene() };
    const revision = JSON.stringify(snapshot);
    if (revision === this.savedRevision) return;
    try { this.deps.save(snapshot); this.savedRevision = revision; }
    catch { this.deps.log?.('board:saveFailed'); }
  }
  /** Replay a local lesson with its original history association and archive identity. */
  reopen(saved: SavedBoard): ToolResult {
    if (!this.deps.enabled()) return { ok: false, message: 'The whiteboard is turned off in Settings.' };
    this.measure(saved.lesson, [], undefined, 0);
    const adapted = adaptSavedLesson(saved.lesson);
    const lesson = saved.lesson.structure ? { ...saved.lesson, structure: { ...saved.lesson.structure, navigation: undefined as undefined } } : saved.lesson;
    const session = this.open(lesson, saved.messageId, saved.id);
    this.rememberStructure(adapted.version === 2 ? adapted : undefined); session.start();
    return { ok: true, message: 'Replaying the saved whiteboard.' };
  }
  /** `keepClock`: the same lesson, now complete (streamed): its time to first stroke is already measured or running. */
  private measure(lesson: LessonInput, base: ElementInput[], requestedAt: number | undefined, fixes: number, keepClock = false) {
    const repaired = lesson.structure ? lesson : repairLesson(lesson, base), m = lessonMetrics(repaired.beats, base);
    const changed = repaired.beats.reduce((n, beat, i) => n + (JSON.stringify(beat.draw) !== JSON.stringify(lesson.beats[i].draw) ? 1 : 0), 0);
    const first = keepClock ? this.stats?.firstStrokeMs : undefined;
    if (lesson.structure?.navigation === 'child' && this.active && !keepClock) this.inheritedStats = this.stats;
    this.stats = { repairs: 0, fixes: fixes + changed, beats: m.beats, elements: m.elements, ...(first !== undefined ? { firstStrokeMs: first } : {}),
      lint: { overlaps: m.overlaps, overflow: m.overflow, through: m.through, crossings: m.crossings, textOnLines: m.textOnLines, minTextPx: m.minTextPx } };
    if (!keepClock) this.requestedAt = requestedAt;
  }
  /** Every view carries the lesson's stats; the renderer acknowledgement stops the first-stroke clock. */
  private annotate(view: BoardView): BoardView {
    view = { ...view, captions: this.deps.captions?.() ?? true, presenting: this.presenting, savedId: this.archive?.id, breadcrumbs: this.parents.map(p => p.session.name) };
    if (!this.stats) return view;
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
    if (action === 'new-request' && session.question) session.answerQuestion(text);
    return action === 'new-request' ? undefined : this.apply(session, action);
  }
  control(action: BoardAction) { const session = this.active ? this.session : undefined; if (session) this.apply(session, action); }
  private apply(session: BoardSession, action: BoardAction): string {
    if (typeof action === 'object') { if (action.type === 'jump') return session.jump(action.beat); session.setSpeed(action.speed); return ''; }
    switch (action) {
      case 'pause': session.pause(); return 'Okay, I’ll wait.';
      case 'resume': return session.resume();
      case 'next': return session.next();
      case 'previous': return session.previous();
      case 'back': return this.back();
      case 'repeat': return session.repeat();
      case 'replay': return session.replay();
      case 'close': this.close(); return 'Okay, I’ve put the board away.';
      case 'bigger': case 'smaller': this.presenting = action === 'bigger'; session.refresh(); return '';
    }
  }
  private back() {
    const parent = this.parents.pop(); if (!parent) return 'This is the first board.';
    this.planEpoch++; this.planning?.abort(); this.streams.clear(); this.session?.stop();
    this.session = parent.session; this.structure = parent.structure; this.archive = parent.archive; this.savedRevision = parent.revision; this.stats = parent.stats;
    this.session.refresh(); return 'Back to the previous board. Say “continue” when you’re ready.';
  }
  drawn(id: number, key: number) { if (this.session?.id === id) this.session.drew(key); }
  /** Renderer acknowledgement after font/layout/camera readiness, when its first drawing frame begins. */
  started(id: number, key: number) {
    if (!this.stats || this.requestedAt === undefined || this.session?.id !== id || this.session.view().drawing?.key !== key) return;
    this.stats = { ...this.stats, firstStrokeMs: Math.round(this.now() - this.requestedAt) }; this.requestedAt = undefined;
    this.deps.log?.('board:lesson', { ...this.stats }); this.refresh();
  }
  cue(id: number, key: number, expectedMs: number, actualMs: number) {
    if (this.session?.id !== id || this.session.view().drawing?.key !== key) return;
    this.deps.log?.('board:cue', { expectedMs, actualMs, errorMs: Math.abs(actualMs - expectedMs) });
  }
  /** System context: when to draw, and what is on the board now. Board text was written by the model, never the screen. */
  context(): string | undefined {
    if (!this.deps.enabled()) return undefined;
    const session = this.active ? this.session : undefined;
    if (!session) return routingHints.board;
    const status = session.state === 'done' ? 'finished' : session.state;
    if (this.deps.structured?.()) return `Kite's whiteboard is open with "${session.name}" (beat ${session.beat + 1} of ${session.count}, ${status}).
${session.question ? `Waiting for the user's answer to: ${session.question}` : session.answer ? `The user answered: ${session.answer}. Give kind, accurate feedback in an added beat, then continue teaching.` : ''}
Structure: ${JSON.stringify(this.structure ? { family: this.structure.family, nodes: this.structure.nodes, edges: this.structure.edges } : session.inputs().map(e => ({ id: e.id, label: e.label ?? e.text, from: e.from, to: e.to })))}
For a follow-up, call explain_on_whiteboard with the question in topic, a relevant part in focus, and mode "add". The specialist plans narration and layout. Use mode "new" for a different topic. Kite handles pause, continue, next, repeat, replay and close locally.`;
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
  close() { this.planEpoch++; this.planning?.abort(); this.planning = undefined; this.streams.clear(); this.presenting = false; this.session?.stop(); for (const parent of this.parents) parent.session.stop(); this.parents = []; this.session = undefined; this.structure = undefined; }
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
