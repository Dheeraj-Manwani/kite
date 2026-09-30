import type { ScreenBounds } from '../../shared/types';
import type { GuidePlan, GuideStatus, GuideStep, GuideView } from '../../shared/guide';
import { insideTarget } from './grounding';
/** A grounded step target in global DIP. `done` means UI state already satisfies the step. */
export interface Located { rect: ScreenBounds; display: ScreenBounds; source: 'uia' | 'vision'; verified: boolean; done?: boolean }
export interface GuideSessionDeps {
  locate(step: GuideStep, options: { vision: boolean; signal: AbortSignal; near: ScreenBounds | null }): Promise<Located | null>;
  emit(view: GuideView | null): void;
  /** Speak a line, or cancel pending/playing guide speech with null. */
  announce(text: string | null): void;
  log?(event: string, data?: Record<string, unknown>): void;
}
export interface GuideTiming {
  /** Wait after a correct click so menus and ribbons can open before grounding the next step. */
  settleMs: number;
  /** UI Automation attempts before falling back to vision; UIs often animate in. */
  retryMs: number[];
  pollMs: number; recheckMs: number; idleMs: number; doneMs: number; visionBudget: number;
}
export const guideTiming: GuideTiming = { settleMs: 450, retryMs: [0, 350, 900], pollMs: 2500, recheckMs: 500, idleMs: 10 * 60_000, doneMs: 4000, visionBudget: 6 };
const sleep = (ms: number, signal: AbortSignal) => new Promise<void>(resolve => {
  const timer = setTimeout(resolve, ms); signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
});
const moved = (a: ScreenBounds, b: ScreenBounds) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.width - b.width) + Math.abs(a.height - b.height) > 2;
/**
 * One walkthrough. It only observes: clicks inside the target advance, other input schedules a quiet
 * re-check, and nothing here can synthesize input. A generation counter discards stale grounding.
 */
export class GuideSession {
  private index = 0;
  private completed = 0;
  private status: GuideStatus = 'locating';
  private located: Located | null = null;
  private last: Located | null = null;
  private announced = -1;
  private misses = 0;
  private visionUsed = 0;
  private generation = 0;
  private abort = new AbortController();
  private work?: ReturnType<typeof setTimeout>;
  private idle?: ReturnType<typeof setTimeout>;
  private ending?: ReturnType<typeof setTimeout>;
  private finished = false;
  constructor(readonly id: number, readonly plan: GuidePlan, private deps: GuideSessionDeps, private timing: GuideTiming = guideTiming) {}
  get ended() { return this.finished; }
  get state() { return this.status; }
  private get step() { return this.plan.steps[this.index]; }
  private get isLast() { return this.index >= this.plan.steps.length - 1; }
  view(): GuideView {
    const shown = this.located ?? this.last;
    return { id: this.id, goal: this.plan.goal, app: this.plan.app, index: this.index, total: this.plan.steps.length, completed: this.completed,
      instruction: this.step.instruction, target: this.step.target, status: this.status, rect: shown?.rect ?? null, display: shown?.display ?? null,
      source: this.located?.source ?? null, verified: !!this.located?.verified };
  }
  line() { return `Step ${this.index + 1} of ${this.plan.steps.length}: ${this.step.instruction}`; }
  start() { this.touch(); void this.locate(true); }
  private emit() { if (!this.finished) this.deps.emit(this.view()); }
  private say(text: string) { if (!this.finished) this.deps.announce(text); }
  private touch() { clearTimeout(this.idle); this.idle = setTimeout(() => this.stop(), this.timing.idleMs); }
  private schedule(fn: () => void, ms: number) { clearTimeout(this.work); this.work = setTimeout(fn, ms); }
  private cancelWork() { clearTimeout(this.work); this.generation++; this.abort.abort(); this.abort = new AbortController(); }
  private async locate(announce: boolean) {
    this.cancelWork();
    const generation = this.generation, signal = this.abort.signal, step = this.step, started = performance.now();
    const stale = () => generation !== this.generation || this.finished;
    this.status = 'locating'; this.located = null; this.emit();
    let found: Located | null = null;
    for (const delay of this.timing.retryMs) {
      if (delay) await sleep(delay, signal);
      if (stale()) return;
      found = await this.deps.locate(step, { vision: false, signal, near: this.last?.rect ?? null }).catch((): null => null);
      if (stale()) return;
      if (found) break;
    }
    if (!found && this.visionUsed < this.timing.visionBudget) {
      this.visionUsed++;
      found = await this.deps.locate(step, { vision: true, signal, near: this.last?.rect ?? null }).catch((): null => null);
      if (stale()) return;
    }
    if (found?.done && !this.isLast) { this.advance(true); return; }
    this.located = found; if (found) this.last = found;
    this.status = found ? 'pointing' : 'lost'; this.misses = 0;
    this.emit();
    this.deps.log?.(found ? 'guide:located' : 'guide:lost', { ok: !!found, durationMs: performance.now() - started });
    if (announce && this.announced !== this.index) {
      this.announced = this.index;
      this.say(found ? step.instruction : `${step.instruction} I can't spot “${step.target}” yet. Make sure ${this.plan.app} is in front.`);
    }
    this.poll();
  }
  /** Quiet UI Automation re-check: follow moved windows, notice keyboard progress, detect a vanished target. */
  private async track(fromInput: boolean) {
    if (this.status !== 'pointing' && this.status !== 'lost') return;
    this.cancelWork();
    const generation = this.generation, signal = this.abort.signal, step = this.step;
    const stale = () => generation !== this.generation || this.finished;
    const found = await this.deps.locate(step, { vision: false, signal, near: this.last?.rect ?? null }).catch((): null => null);
    if (stale()) return;
    if (found?.done && !this.isLast) { this.advance(true); return; }
    if (found) {
      const changed = this.status === 'lost' || !this.located || moved(found.rect, this.located.rect);
      this.located = this.last = found; this.status = 'pointing'; this.misses = 0;
      if (changed) this.emit();
      this.poll(); return;
    }
    // The user acted and the next control is already on screen: they took this step another way.
    if (fromInput && !this.isLast) {
      const next = await this.deps.locate(this.plan.steps[this.index + 1], { vision: false, signal, near: this.last?.rect ?? null }).catch((): null => null);
      if (stale()) return;
      if (next) { this.advance(true); return; }
    }
    this.misses++;
    // The UI changed under a target that was visible: look again, with vision if UI Automation cannot.
    if (this.status === 'pointing' && this.misses >= 2) { void this.locate(false); return; }
    this.poll();
  }
  private poll() { if (!this.finished && (this.status === 'pointing' || this.status === 'lost')) this.schedule(() => void this.track(false), this.timing.pollMs); }
  private advance(counted: boolean) {
    this.cancelWork();
    if (counted) this.completed = Math.max(this.completed, this.index + 1);
    this.deps.log?.('guide:step', { count: this.index + 1 });
    if (this.isLast) { this.finish(true); return; }
    this.index++; this.status = 'locating'; this.located = null; this.emit();
    this.schedule(() => void this.locate(true), counted ? this.timing.settleMs : 0);
  }
  private finish(speak: boolean) {
    this.cancelWork(); this.status = 'done'; this.located = null; this.emit();
    if (speak) this.say('All done — nice work!');
    this.deps.log?.('guide:done', { count: this.plan.steps.length });
    // Ending on its own must not cut off (or drop a queued) "All done".
    clearTimeout(this.ending); this.ending = setTimeout(() => this.stop(false), this.timing.doneMs);
  }
  /** A click anywhere (global DIP). Inside the current target advances; elsewhere re-checks the UI. */
  click(point: { x: number; y: number }) {
    if (this.finished || (this.status !== 'pointing' && this.status !== 'lost')) return;
    this.touch();
    if (this.status === 'pointing' && this.located && insideTarget(this.located.rect, point)) { this.advance(true); return; }
    this.schedule(() => void this.track(true), this.timing.recheckMs);
  }
  /** Keyboard input can also change the UI (access keys, arrows, Enter). Debounced. */
  key() {
    if (this.finished || (this.status !== 'pointing' && this.status !== 'lost')) return;
    this.schedule(() => void this.track(true), this.timing.recheckMs);
  }
  pause() {
    if (this.finished || this.status === 'done' || this.status === 'paused') return;
    this.cancelWork(); this.touch(); this.deps.announce(null);
    this.status = 'paused'; this.located = null; this.emit();
  }
  /** `speak` false when the caller already says the step (a voice reply). */
  resume(speak: boolean) {
    if (this.finished || this.status === 'done') return '';
    this.touch(); this.announced = speak ? -1 : this.index;
    if (this.status === 'paused' || this.status === 'lost') void this.locate(true);
    else if (speak) this.say(this.step.instruction);
    return this.line();
  }
  next(speak: boolean) {
    if (this.finished || this.status === 'done') return '';
    this.touch();
    if (this.isLast) { this.finish(speak); return 'All done — nice work!'; }
    this.announced = speak ? -1 : this.index + 1;
    this.advance(false);
    return `Step ${this.index + 1} of ${this.plan.steps.length}: ${this.step.instruction}`;
  }
  back(speak: boolean) {
    if (this.finished || this.status === 'done') return '';
    this.touch(); this.index = Math.max(0, this.index - 1); this.completed = Math.min(this.completed, this.index);
    this.announced = speak ? -1 : this.index;
    void this.locate(true);
    return this.line();
  }
  repeat(speak: boolean) {
    if (this.finished || this.status === 'done') return '';
    this.touch();
    if (this.status === 'pointing') { if (speak) this.say(this.step.instruction); }
    else { this.announced = speak ? -1 : this.index; void this.locate(true); }
    return this.line();
  }
  /** Display or overlay changes: re-ground quietly without re-announcing. */
  relocate() { if (!this.finished && (this.status === 'pointing' || this.status === 'lost')) void this.track(false); }
  stop(silence = true) {
    if (this.finished) return;
    this.cancelWork(); this.finished = true;
    clearTimeout(this.idle); clearTimeout(this.ending);
    if (silence) this.deps.announce(null);
    this.deps.emit(null); this.deps.log?.('guide:stopped');
  }
}
