import { assessRisk, classifyTaskCommand, describeAction, formatSnapshot, maxTaskSteps, modifierVk, parseKeys, type AgentAction, type AgentElement, type AgentSnapshot, type AgentWindow, type TaskAction, type TaskLogEntry, type TaskScope, type TaskStatus, type TaskView } from '../../shared/agent';
import type { ScreenBounds } from '../../shared/types';
import { labelScore } from '../guide/grounding';
import type { Decision, StepPrompt } from './model';
import type { ActResult, KeyItem, Target } from './sidecar';
export interface TaskDeps {
  windows(signal: AbortSignal): Promise<AgentWindow[]>;
  snapshot(target: Target, signal: AbortSignal): Promise<AgentSnapshot>;
  act(seq: number, ref: number, action: 'click' | 'focus' | 'set' | 'scroll' | 'selectall', extra: { text?: string; direction?: string }, signal: AbortSignal): Promise<ActResult>;
  keys(target: Target, seq: number, focus: number, items: KeyItem[], signal: AbortSignal): Promise<ActResult>;
  /** Open the app from the Start menu index; false when there is no clear match. */
  launch(app: string, signal: AbortSignal): Promise<boolean>;
  decide(prompt: StepPrompt, signal: AbortSignal): Promise<Decision>;
  /** A screenshot of the app window (vision models only), after the "Kite is looking" indicator. */
  look?(window: AgentWindow, signal: AbortSignal): Promise<Uint8Array | null>;
  displayOf(rect: ScreenBounds): ScreenBounds;
  emit(view: TaskView | null): void;
  say(text: string): void;
  audit(type: string, summary: string, decision: 'approved' | 'denied' | 'auto', result: { ok: boolean; message: string }): void;
  finished(summary: string, status: 'done' | 'failed' | 'stopped'): void;
  log?(event: string, data?: Record<string, unknown>): void;
}
export interface TaskTiming { pointMs: number; settleMs: number; retryMs: number; launchMs: number; wallMs: number; lingerMs: number; rateRetries: number; rateMaxMs: number }
export const taskTiming: TaskTiming = { pointMs: 380, settleMs: 450, retryMs: 700, launchMs: 15_000, wallMs: 8 * 60_000, lingerMs: 7000, rateRetries: 4, rateMaxMs: 25_000 };
/**
 * Milliseconds to wait when a provider error is a rate limit (HTTP 429, or "RPM", "rate limit", "too many
 * requests" in its message, including a retry wrapper's last error), else null. Honors "after N seconds".
 */
export function rateLimitWait(error: unknown, maxMs = taskTiming.rateMaxMs): number | null {
  const chain: unknown[] = [error, (error as { lastError?: unknown })?.lastError, ...((error as { errors?: unknown[] })?.errors ?? [])];
  const limited = chain.some(e => (e as { statusCode?: number })?.statusCode === 429
    || /\b(rate.?limit|too many requests|max (rpm|tpm|rpd)|RPM|TPM|quota exceeded per minute)\b/i.test(String((e as Error)?.message ?? '')));
  if (!limited) return null;
  const hint = chain.map(e => String((e as Error)?.message ?? '').match(/(?:after|in)\s+(\d+(?:\.\d+)?)\s*(s|sec|seconds?)\b/i)).find(Boolean);
  // A requests-per-minute window resets within a minute; without a hint, wait most of one window.
  return Math.min(maxMs, hint ? Math.max(1000, Number(hint[1]) * 1000 + 1500) : 20_000);
}
const abortError = () => new DOMException('Aborted', 'AbortError');
const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) { reject(abortError()); return; }
  const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
  const abort = () => { clearTimeout(timer); reject(abortError()); };
  signal.addEventListener('abort', abort, { once: true });
});
/** Wait for a value supplied later (the user's approval or answer); aborting the step rejects it. */
function waitFor<T>(signal: AbortSignal, register: (resolve: (value: T) => void) => void) {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) { reject(abortError()); return; }
    const abort = () => reject(abortError());
    signal.addEventListener('abort', abort, { once: true });
    register(value => { signal.removeEventListener('abort', abort); resolve(value); });
  });
}
/** The open window that best matches the app the user named (process or title), front window first on ties. */
export function pickWindow(app: string, windows: AgentWindow[]): AgentWindow | null {
  const score = (w: AgentWindow) => Math.max(labelScore(app, w.process), labelScore(app, w.title),
    ...w.title.split(/\s+[-–—|]\s+/).map(part => labelScore(app, part))) + (w.foreground ? 0.03 : 0);
  return windows.map(w => ({ w, s: score(w) })).filter(x => x.s >= 0.62).sort((a, b) => b.s - a.s)[0]?.w ?? null;
}
const failures: Record<string, string> = {
  EGONE: 'That control disappeared.', ESTALE: 'The window changed before I could act.', ENOPATTERN: 'That control can’t be used without moving your mouse.',
  ENOVALUE: 'That field can’t be set directly.', ENOSCROLL: 'That can’t be scrolled.', EPASSWORD: 'I don’t fill in password fields.',
  EBUSY: 'A key was held down, so I didn’t type.', EBLOCKED: 'Windows blocked the key presses; an administrator window may be in front.', ETIMEOUT: 'The app didn’t respond in time.',
};
/**
 * One approved task: look at the app's controls, ask the model for one action, confirm it when it is risky
 * (or when the user chose step-by-step), point at it, do it, and repeat within a strict step budget.
 * Pausing aborts the current step; resuming starts again from a fresh look, so nothing stale is acted on.
 */
export class TaskSession {
  private status: TaskStatus = 'starting';
  private step = 0;
  private message = '';
  private action: string | null = null;
  private risk: string | null = null;
  private target: ScreenBounds | null = null;
  private display: ScreenBounds | null = null;
  private log: TaskLogEntry[] = [];
  private history: string[] = [];
  private window?: AgentWindow;
  private controller = new AbortController();
  private paused = false;
  private finished = false;
  private resumed?: () => void;
  private approval?: (answer: 'allow' | 'allowAll' | 'skip' | 'stop') => void;
  private answer?: (text: string) => void;
  private lookNext = false;
  private misses = 0;
  private failed = 0;
  private wall?: ReturnType<typeof setTimeout>;
  private linger?: ReturnType<typeof setTimeout>;
  constructor(readonly id: number, readonly goal: string, readonly app: string, private scope: TaskScope, private deps: TaskDeps,
    private vision = false, readonly budget = maxTaskSteps, private timing: TaskTiming = taskTiming) {}
  get ended() { return this.finished; }
  get state() { return this.status; }
  get steps() { return this.step; }
  get question() { return this.status === 'asking' ? this.message : null; }
  view(): TaskView {
    return { id: this.id, goal: this.goal, app: this.app, status: this.status, step: this.step, budget: this.budget, scope: this.scope,
      action: this.action, risk: this.risk, message: this.message, target: this.target, display: this.display, log: this.log.slice(-5) };
  }
  private emit() { this.deps.emit(this.view()); }
  private set(status: TaskStatus, message: string) { if (this.finished) return; this.status = status; this.message = message; this.emit(); }
  start() {
    this.wall = setTimeout(() => this.end('failed', 'This is taking too long, so I stopped.'), this.timing.wallMs);
    void this.run();
  }
  private async run() {
    try {
      this.set('starting', `Finding ${this.app}…`);
      this.window = await this.find(this.controller.signal);
      if (this.finished) return;
      if (!this.window) { this.end('failed', `I couldn’t find ${this.app}. Open it and ask me again.`); return; }
      this.display = this.deps.displayOf(this.window.rect);
      while (!this.finished) {
        if (this.paused) { await new Promise<void>(resolve => { this.resumed = resolve; }); continue; }
        if (this.step >= this.budget) { this.end('stopped', `I used all ${this.budget} steps without finishing, so I stopped here.`); return; }
        const signal = this.controller.signal;
        try { await this.turn(signal); }
        catch (error) { if (this.finished || signal.aborted) continue; throw error; }
      }
    } catch (error) {
      this.deps.log?.('task:error', { code: error instanceof Error ? `E${error.name.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 30)}` : 'UNKNOWN' });
      this.end('failed', 'Something went wrong, so I stopped. Nothing else will be clicked or typed.');
    }
  }
  /**
   * Ask the model. A transient error is retried once; a rate limit (free tiers can allow only a few requests
   * a minute) is waited out, visibly, a few times. Neither should end a task that is going well.
   */
  private async decide(prompt: StepPrompt, signal: AbortSignal): Promise<Decision | null> {
    let errors = 0, limits = 0;
    for (;;) {
      try { return await this.deps.decide(prompt, signal); }
      catch (error) {
        if (signal.aborted) throw error;
        this.deps.log?.('task:model', { ok: false, code: error instanceof Error ? `E${error.name.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 30)}` : 'UNKNOWN' });
        const hinted = rateLimitWait(error, this.timing.rateMaxMs);
        // Escalate: a per-minute window may not have reset when the provider's hint says it will.
        const wait = hinted === null ? null : Math.min(this.timing.rateMaxMs, Math.max(hinted, 5000 * 2 ** limits));
        if (wait !== null && limits++ < this.timing.rateRetries) {
          this.set('thinking', `The model is rate-limited, so I’m waiting ${Math.round(wait / 1000)} s before the next step…`);
          await sleep(wait, signal); continue;
        }
        if (wait !== null || errors++ >= 1) return null;
        await sleep(this.timing.retryMs * 2, signal);
      }
    }
  }
  private async find(signal: AbortSignal): Promise<AgentWindow | undefined> {
    const before = await this.deps.windows(signal);
    const open = pickWindow(this.app, before);
    if (open) return open;
    this.set('starting', `Opening ${this.app}…`);
    if (!await this.deps.launch(this.app, signal)) return undefined;
    const known = new Set(before.map(w => w.hwnd)), deadline = Date.now() + this.timing.launchMs;
    while (Date.now() < deadline) {
      await sleep(500, signal);
      const now = await this.deps.windows(signal);
      const found = pickWindow(this.app, now) ?? now.find(w => w.foreground && !known.has(w.hwnd));
      if (found) { await sleep(600, signal); return found; }
    }
    return undefined;
  }
  private note(text: string, ok: boolean, shown = text) {
    this.history.push(`${this.step}. ${text}`);
    this.log.push({ text: shown, ok });
  }
  private async turn(signal: AbortSignal) {
    this.set('thinking', `Looking at ${this.app}…`);
    let snapshot: AgentSnapshot;
    try { snapshot = await this.deps.snapshot({ hwnd: this.window.hwnd, pid: this.window.pid }, signal); this.misses = 0; }
    catch (error) {
      if (signal.aborted) throw error;
      if (++this.misses >= 3) { this.end('failed', `I lost track of ${this.app}, so I stopped.`); return; }
      // The window may have closed or been replaced: look for another window of the same app.
      const windows = await this.deps.windows(signal).catch((failure: unknown): AgentWindow[] => { if (signal.aborted) throw failure; return []; });
      const again = windows.find(w => w.pid === this.window.pid) ?? pickWindow(this.app, windows);
      if (again) this.window = again;
      await sleep(this.timing.retryMs, signal); return;
    }
    this.window = { ...this.window, ...snapshot.window };
    this.display = this.deps.displayOf(this.window.rect);
    const image = this.lookNext && this.vision && this.deps.look ? await this.deps.look(this.window, signal).catch((error: unknown): null => { if (signal.aborted) throw error; return null; }) : null;
    this.lookNext = false;
    const decision = await this.decide({ goal: this.goal, app: this.app, step: this.step + 1, budget: this.budget, history: this.history.slice(-14),
      snapshot, controls: formatSnapshot(snapshot), image, vision: this.vision }, signal);
    signal.throwIfAborted();
    if (!decision) { this.end('failed', 'I couldn’t reach the model, so I stopped. Nothing else will be clicked or typed.'); return; }
    this.step++;
    if (decision.type === 'invalid') { this.note(`Invalid choice: ${decision.reason}.`, false, 'Tried an invalid action'); this.emit(); return; }
    const element = 'ref' in decision && decision.ref !== undefined ? snapshot.elements.find(e => e.ref === decision.ref) : undefined;
    if ('ref' in decision && decision.ref !== undefined && !element) { this.note(`[${decision.ref}] is not in the current control list.`, false, 'Picked a control that isn’t there'); this.emit(); return; }
    switch (decision.type) {
      case 'done': this.end('done', decision.summary); return;
      case 'fail': this.end('failed', decision.reason); return;
      case 'wait': this.note(`Waited ${decision.seconds} s.`, true); this.set('thinking', 'Waiting for the app…'); await sleep(decision.seconds * 1000, signal); return;
      case 'look':
        this.lookNext = this.vision;
        this.note(this.vision ? 'Asked to see the window; the screenshot comes with the next controls.' : 'Screenshots are not available with this model.', this.vision, 'Looked at the window'); return;
      case 'ask_user': {
        this.action = null; this.set('asking', decision.question); this.deps.say(decision.question);
        const answer = await waitFor<string>(signal, resolve => { this.answer = resolve; });
        this.answer = undefined;
        this.note(`Asked “${decision.question}”; the user answered “${answer.slice(0, 300)}”.`, true, `You answered: ${answer.slice(0, 60)}`); return;
      }
    }
    await this.perform(decision, element, snapshot, signal);
  }
  private async perform(action: Extract<AgentAction, { type: 'click' | 'type_text' | 'press_keys' | 'scroll' }>, element: AgentElement | undefined, snapshot: AgentSnapshot, signal: AbortSignal) {
    const summary = describeAction(action, element), focused = snapshot.elements.find(e => e.focused);
    const main = snapshot.layers.find(l => l.main)?.layer;
    const dialogText = snapshot.elements.filter(e => e.layer !== main && (e.role === 'Text' || e.role === 'Document')).map(e => e.name).join(' ');
    const risk = assessRisk(action, { element, focused, process: this.window.process, title: this.window.title, dialogText });
    this.action = summary; this.risk = risk;
    this.target = element?.rect ?? (action.type !== 'click' && action.type !== 'scroll' ? focused?.rect ?? null : null);
    let decision: 'approved' | 'auto' = 'auto';
    if (risk || this.scope === 'once') {
      this.set('approval', risk ?? 'Okay to do this step?');
      if (risk) this.deps.say(`Can I ${summary.charAt(0).toLowerCase()}${summary.slice(1)}? ${risk} Say yes or no.`);
      const answer = await waitFor<'allow' | 'allowAll' | 'skip' | 'stop'>(signal, resolve => { this.approval = resolve; });
      this.approval = undefined;
      if (answer === 'stop') { this.end('stopped', 'Okay, I stopped.'); return; }
      if (answer === 'skip') {
        this.deps.audit(action.type, summary, 'denied', { ok: false, message: 'User declined.' });
        this.note(`${summary}: the user said no. Find another way or finish.`, false, `${summary} (you said no)`); this.risk = null; return;
      }
      if (answer === 'allowAll') this.scope = 'task';
      decision = 'approved'; this.risk = null;
    }
    this.set('acting', summary);
    // Point first: the kite flies to the control so the user sees what is about to happen.
    await sleep(this.timing.pointMs, signal);
    const result = await this.execute(action, element, snapshot, signal);
    const message = result.ok ? result.message : result.message || 'That didn’t work.';
    this.deps.audit(action.type, summary, decision, { ok: result.ok, message });
    this.note(`${summary} → ${message}`, result.ok, summary);
    this.failed = result.ok ? 0 : this.failed + 1;
    if (this.failed >= 3) { this.end('failed', `Three actions in a row didn’t work, so I stopped. ${message}`); return; }
    this.emit();
    await sleep(this.timing.settleMs, signal);
  }
  private async execute(action: Extract<AgentAction, { type: 'click' | 'type_text' | 'press_keys' | 'scroll' }>, element: AgentElement | undefined, snapshot: AgentSnapshot, signal: AbortSignal): Promise<{ ok: boolean; message: string }> {
    const target = { hwnd: this.window.hwnd, pid: this.window.pid };
    const explain = (r: ActResult) => r.code === 'EFOREGROUND' ? `${this.app} wasn’t in front, so I didn’t type anything.` : failures[r.code] ?? 'That didn’t work.';
    // A held modifier (the user's push-to-talk) clears quickly: retry once.
    const keys = async (focus: number, items: KeyItem[]) => {
      let r = await this.deps.keys(target, snapshot.seq, focus, items, signal);
      if (!r.ok && r.code === 'EBUSY') { await sleep(this.timing.retryMs, signal); r = await this.deps.keys(target, snapshot.seq, focus, items, signal); }
      return r;
    };
    if (action.type === 'click') {
      const r = await this.deps.act(snapshot.seq, action.ref, 'click', {}, signal);
      if (!r.ok) return { ok: false, message: explain(r) };
      const done = r.via === 'toggle' ? 'Toggled.' : r.via?.startsWith('select') ? 'Selected.' : r.via === 'expand' ? 'Opened or closed it.' : r.via === 'focus' ? 'Focused it.' : 'Clicked.';
      return { ok: true, message: r.pending ? `${done} The app is still busy, perhaps showing a dialog.` : done };
    }
    if (action.type === 'scroll') {
      const r = await this.deps.act(snapshot.seq, action.ref, 'scroll', { direction: action.direction }, signal);
      return r.ok ? { ok: true, message: 'Scrolled.' } : { ok: false, message: explain(r) };
    }
    if (action.type === 'press_keys') {
      const chord = parseKeys(action.keys);
      if (!chord) return { ok: false, message: 'Unsupported key.' };
      const r = await keys(-1, [{ vk: chord.vk, mods: chord.modifiers.map(modifierVk), times: action.times ?? 1 }]);
      return r.ok ? { ok: true, message: 'Pressed.' } : { ok: false, message: explain(r) };
    }
    const ref = action.ref ?? -1;
    let r: ActResult | undefined;
    // Replacing a field's text is one UI Automation call when the field allows it; otherwise select all and type.
    if (action.replace && element?.patterns.includes('value') && !element.password && !element.readOnly) {
      r = await this.deps.act(snapshot.seq, ref, 'set', { text: action.text }, signal);
      if (!r.ok && r.code !== 'ENOVALUE') return { ok: false, message: explain(r) };
      if (!r.ok) r = undefined;
    }
    // Otherwise select the old text through UI Automation when possible (many fields ignore Ctrl+A), then type over it.
    let selected = false;
    if (!r && action.replace && element?.patterns.includes('text')) {
      const all = await this.deps.act(snapshot.seq, ref, 'selectall', {}, signal);
      selected = all.ok;
    }
    r ??= await keys(selected ? -1 : ref, [...(action.replace && !selected ? [{ vk: 0x41, mods: [modifierVk('ctrl')] }] : []), { text: action.text }]);
    if (!r.ok) return { ok: false, message: explain(r) };
    if (action.submit) {
      const enter = await keys(ref, [{ vk: 0x0d, mods: [] }]);
      if (!enter.ok) return { ok: false, message: `Typed it, but couldn’t press Enter. ${explain(enter)}` };
    }
    return { ok: true, message: action.submit ? 'Typed and pressed Enter.' : 'Typed.' };
  }
  /** Card buttons and voice. Returns nothing; replies are chosen by command(). */
  control(action: TaskAction) {
    if (this.finished) return;
    if (this.status === 'approval' && this.approval && ['allow', 'allowAll', 'skip', 'stop'].includes(action)) { this.approval(action as 'allow' | 'allowAll' | 'skip' | 'stop'); return; }
    if (action === 'stop') this.end('stopped', 'Okay, I stopped.');
    else if (action === 'pause') this.pause('Paused. Say “continue” or press Resume when you’re ready.');
    else if (action === 'resume') this.resume();
  }
  /** Stop acting until resumed. The step in flight is abandoned, and redone from a fresh look. */
  pause(message: string) {
    if (this.finished || this.paused) return;
    this.paused = true; this.controller.abort(); this.controller = new AbortController();
    this.approval = undefined; this.answer = undefined;
    this.action = null; this.risk = null; this.target = null;
    this.set('paused', message);
  }
  resume() {
    if (this.finished || !this.paused) return;
    this.paused = false; this.set('thinking', `Looking at ${this.app}…`);
    const resumed = this.resumed; this.resumed = undefined; resumed?.();
  }
  /** Mouse or keyboard input from the user while Kite is working: stop acting at once. */
  userTookOver() {
    if (['starting', 'thinking', 'acting'].includes(this.status)) this.pause('You took over, so I paused. Say “continue” when you want me to carry on.');
  }
  /** A voice utterance while this task exists. Returns the spoken reply, or undefined to ask the model. */
  command(text: string): string | undefined {
    if (this.finished) return undefined;
    const action = classifyTaskCommand(text);
    if (this.status === 'approval') {
      if (action === 'pause') { this.control('pause'); return 'Okay, I’ll wait.'; }
      if (action === 'new-request' || action === 'resume') return undefined;
      this.control(action);
      return action === 'stop' ? 'Okay, I’ve stopped.' : action === 'skip' ? 'Okay, I won’t do that.' : action === 'allowAll' ? 'Okay. I’ll only ask again for risky steps.' : 'Okay.';
    }
    if (this.status === 'asking' && this.answer) {
      if (action === 'stop') { this.control('stop'); return 'Okay, I’ve stopped.'; }
      if (action === 'pause') { this.control('pause'); return 'Okay, I’ll wait.'; }
      this.answer(text.trim()); return 'Got it.';
    }
    if (action === 'stop') { this.control('stop'); return 'Okay, I’ve stopped.'; }
    if (action === 'pause') { this.control('pause'); return this.paused ? 'Okay, I’ll wait. Say “continue” when you’re ready.' : undefined; }
    if (action === 'resume' && this.paused) { this.control('resume'); return 'Carrying on.'; }
    return undefined;
  }
  /** Finish once: say how it went, record it, and clear the card a little later. */
  end(status: 'done' | 'failed' | 'stopped', message: string, quiet = false) {
    if (this.finished) return;
    this.finished = true; clearTimeout(this.wall);
    this.controller.abort(); this.approval = undefined; this.answer = undefined;
    const resumed = this.resumed; this.resumed = undefined; resumed?.();
    this.status = status; this.message = message; this.action = null; this.risk = null; this.target = null;
    this.deps.emit(this.view());
    if (!quiet) this.deps.say(message);
    this.deps.finished(message, status);
    this.deps.log?.('task:end', { count: this.step, ok: status === 'done' });
    this.linger = setTimeout(() => this.deps.emit(null), this.timing.lingerMs);
  }
  /** Remove the card now (a new task, or the feature was turned off). */
  dispose() { if (!this.finished) this.end('stopped', 'Stopped.', true); clearTimeout(this.linger); this.deps.emit(null); }
}
