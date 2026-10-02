import { classifyStep, classifyTaskCommand, describeAction, formatSnapshot, maxTaskSteps, modifierVk, parseKeys, type AgentAction, type AgentElement, type AgentSnapshot, type AgentWindow, type TaskAction, type TaskLogEntry, type TaskScope, type TaskStatus, type TaskView } from '../../shared/agent';
import type { ScreenBounds } from '../../shared/types';
import { addToCart, cartSentence, hostOf, inScope, jobLimits, matchCheckout, matchChoice, orderSummary, pageTotal, pageUrl, paymentPending, placesOrder, readCart, readOrder, unconfirmedVariant, type CartLine, type ChoiceOption, type JobPlan, type JobView, type OrderSummary, type PlacedOrder } from '../../shared/job';
import { priceJump, repeatTolerance, sameItems, lastOrderOf, type PastOrder, type RepeatOrder } from '../../shared/orders';
import { categories, categoryInfo, defaultPermissions, jobCategories, nudgeAfter, permissionTable, placeLabel, placeOf, resolve, ruleFor, rupees, type Category, type Permission, type PermissionSettings, type Resolution, type StepClass } from '../../shared/permissions';
import { labelScore } from '../guide/grounding';
import type { Decision, StepPrompt } from './model';
import type { ActResult, KeyItem, Target } from './sidecar';
import { SidecarError } from '../guide/uia';
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
  /** Browser tasks: plan the job (one model call). Null runs it as a plain task. */
  plan?(signal: AbortSignal): Promise<JobPlan | null>;
  /**
   * Open a web address in a new tab of this browser window without the keyboard, the way a link from another app opens.
   * Used when Windows won't bring the browser forward (the user is typing elsewhere). False when it can't.
   */
  openUrl?(url: string, window: AgentWindow, signal: AbortSignal): Promise<boolean>;
  /** Controls anywhere on the page whose names contain the words, including off-screen ones (a snapshot of matches). */
  find?(target: Target, text: string, signal: AbortSignal): Promise<AgentSnapshot>;
  /** The user's permission settings, read for every step (ADR 014). Defaults to Balanced. */
  permissions?(): PermissionSettings;
  /** "Always" or "Never" on a question: save it for this place, or for every place when place is null. */
  remember?(category: Category, permission: Permission, place: string | null): void;
  /** What Kite remembers about the user (docs/end-to-end-jobs.md §3.4). Absent: no memory. */
  memory?: TaskMemory;
  /** A repeat order the user confirmed before the job started ("same as last time"): the one question it needs (phase 5). */
  repeat?: RepeatOrder | null;
  /**
   * "Stop asking?" (phase 5): count a yes for this kind of step here; true when Kite should now offer, once, to stop asking.
   * `offered` records the answer.
   */
  nudge?: { yes(category: Category, place: string): boolean; offered(category: Category, place: string, accepted: boolean): void };
}
export interface TaskMemory {
  /** The memory as the model may see it: placeholders and masks, for the system prompt. */
  context(): string;
  /** Saved values in text replaced by their placeholders; applied to everything sent to the model. */
  redact(text: string): string;
  /** Placeholders in text to type replaced by their values, when the step runs. */
  fill(text: string): { text: string; missing: string[] };
  /** The user answered a question Kite asked: facts in it may be saved, with a notice. */
  learn(question: string, answer: string, where: string): void;
  /** The user chose an option in a store job: saved as a preference for what was searched. */
  chose(topic: string, choice: string, where: string): void;
  /** An order Kite placed and saw confirmed: saved to the order history. */
  ordered?(order: { number: string; items: string[]; total: string | null; site: string; when: string | null; payment: string | null }): void;
  /** Past orders, newest first: for the price check. */
  orders?(): PastOrder[];
}
type Answer = Exclude<TaskAction, 'pause' | 'resume'>;
const yes = (answer: Answer) => answer === 'allow' || answer === 'allowAll' || answer === 'always' || answer === 'alwaysEverywhere';
export interface TaskTiming { pointMs: number; settleMs: number; retryMs: number; launchMs: number; wallMs: number; lingerMs: number; rateRetries: number; rateMaxMs: number;
  /** While the user pays: how often Kite looks at the page, and how long it waits in all. */
  pollMs?: number; payMs?: number }
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
  private approval?: (answer: Answer) => void;
  private ask: TaskView['ask'] = null;
  private answer?: (value: string | number) => void;
  // A job (a browser errand with a plan): the phase being worked on, its steps, the page, and where Kite may go.
  private plan: JobPlan | null = null;
  private phase = 0;
  private phaseSteps = 0;
  private phaseExtra = 0;
  private url: string | null = null;
  private allowed: string[] = [];
  private choices: ChoiceOption[] | null = null;
  private matches: { text: string; snapshot: AgentSnapshot } | null = null;
  private cartMisses = 0;
  private siteOpened = false;
  private variantsAsked = new Set<string>();
  // Checkout (phase 4): the user asked Kite to check out; the cart it set out with; the order button was pressed.
  private checkout = false;
  private cartLines: CartLine[] = [];
  private placed = false;
  private rememberLabel: string | null = null;
  private rememberChoice = false;
  private checkoutAsked = false;
  private orderView: OrderSummary | null = null;
  private paidBy: string | null = null;
  private pendingNudge: { category: Category; place: string } | null = null;
  private nudge?: () => void;
  private variantQuestions = 0;
  private lookNext = false;
  private misses = 0;
  private failed = 0;
  private wall?: ReturnType<typeof setTimeout>;
  private linger?: ReturnType<typeof setTimeout>;
  constructor(readonly id: number, readonly goal: string, readonly app: string, private scope: TaskScope, private deps: TaskDeps,
    private vision = false, public budget = maxTaskSteps, private timing: TaskTiming = taskTiming) {}
  get ended() { return this.finished; }
  get state() { return this.status; }
  get steps() { return this.step; }
  get question() { return this.status === 'asking' ? this.message : null; }
  view(): TaskView {
    return { id: this.id, goal: this.goal, app: this.app, status: this.status, step: this.step, budget: this.budget, scope: this.scope,
      action: this.action, risk: this.risk, ask: this.status === 'approval' ? this.ask : null, message: this.message, target: this.target, display: this.display, log: this.log.slice(-5), job: this.jobView() };
  }
  private jobView(): JobView | null {
    const plan = this.plan; if (!plan) return null;
    const complete = this.status === 'done';
    return { url: this.url, choices: this.status === 'asking' ? this.choices : null, remember: this.status === 'asking' ? this.rememberLabel : null,
      order: this.status === 'approval' ? this.orderView : null,
      phases: plan.phases.map((p, i) => ({ id: p.id, title: p.title, state: !p.kite ? 'yours' : complete || i < this.phase ? 'done' : i === this.phase && !this.finished ? 'active' : 'pending' })) };
  }
  private emit() { this.deps.emit(this.view()); }
  private set(status: TaskStatus, message: string) { if (this.finished) return; this.status = status; this.message = message; this.emit(); }
  start() {
    this.wall = setTimeout(() => this.end('failed', 'This is taking too long, so I stopped.'), this.timing.wallMs);
    void this.run();
  }
  private async run() {
    try {
      if (this.deps.plan) {
        this.set('starting', 'Planning the job…');
        this.plan = await this.deps.plan(this.controller.signal).catch((error: unknown): null => { if (this.controller.signal.aborted) throw error; return null; });
        if (this.finished) return;
        if (this.plan) {
          this.budget = Math.max(this.budget, jobLimits.steps); this.allowed = [...this.plan.scope];
          clearTimeout(this.wall); this.wall = setTimeout(() => this.end('failed', 'This is taking too long, so I stopped.'), Math.max(this.timing.wallMs, jobLimits.wallMs));
        }
      }
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
  /**
   * The job's first step, done by code: the site in a new tab, so the user's own tab is left alone. Windows won't bring a
   * window forward while the user types elsewhere, so it retries for a few seconds. False when it still can't: then the
   * user is asked to click the browser once, and the step runs again on "continue".
   */
  private async openSite(start: string, signal: AbortSignal) {
    const summary = `Open ${this.plan?.site ?? hostOf(start) ?? start} in a new tab`; this.set('acting', summary);
    let r: ActResult = { ok: false };
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt) await sleep(this.timing.retryMs * 1.5, signal);
      r = await this.deps.keys({ hwnd: this.window.hwnd, pid: this.window.pid }, 0, -1, [{ vk: 0x54, mods: [modifierVk('ctrl')] }, { text: start }, { vk: 0x0d, mods: [] }], signal);
      if (r.code !== 'EFOREGROUND' && r.code !== 'EBUSY') break;
    }
    let opened = r.ok;
    if (r.code === 'EFOREGROUND') {
      if (!await this.deps.openUrl?.(start, this.window, signal)) return false;
      opened = true; await sleep(this.timing.settleMs * 4, signal);
    }
    this.siteOpened = true; this.step++; this.phaseSteps++;
    const message = opened ? 'Opened.' : 'That didn’t work; use go_to.';
    r = { ok: opened };
    this.deps.audit('go_to', summary, 'auto', { ok: r.ok, message });
    this.note(`${summary} → ${message}`, r.ok, summary);
    await sleep(this.timing.settleMs * 3, signal);
    return true;
  }
  /** Ask the user through the card's approval buttons; true to carry on. */
  private async confirm(action: string, risk: string, signal: AbortSignal) {
    this.action = action; this.risk = risk; this.target = null; this.ask = null;
    this.set('approval', risk); this.deps.say(risk);
    const answer = await waitFor<Answer>(signal, resolve => { this.approval = resolve; });
    this.approval = undefined; this.risk = null; this.action = null;
    return yes(answer);
  }
  private async turn(signal: AbortSignal) {
    const phase = this.plan?.phases[this.phase];
    if (phase?.kite && this.phaseSteps >= phase.budget + this.phaseExtra) {
      if (!await this.confirm(phase.title, `${phase.title} is taking longer than usual. Keep going?`, signal)) { this.end('stopped', `Okay, I stopped at “${phase.title}”.`); return; }
      this.phaseExtra += Math.max(4, Math.ceil(phase.budget / 2));
    }
    if (this.plan?.start && !this.siteOpened && !await this.openSite(this.plan.start, signal)) {
      this.pause(`I need ${this.app} in front to open ${this.plan.site ?? 'the site'}. Click on it once, then say “continue”.`); return;
    }
    this.set('thinking', `Looking at ${this.app}…`);
    let snapshot: AgentSnapshot, controls: string;
    const matches = this.matches; this.matches = null;
    if (matches) { snapshot = matches.snapshot; controls = `Matches for “${matches.text}” anywhere on the page (some may be scrolled out of view; clicking them works):\n${formatSnapshot(matches.snapshot)}`; }
    else try { snapshot = await this.deps.snapshot({ hwnd: this.window.hwnd, pid: this.window.pid }, signal); this.misses = 0; controls = formatSnapshot(snapshot); }
    catch (error) {
      if (signal.aborted) throw error;
      this.deps.log?.('task:snapshot', { ok: false, code: error instanceof SidecarError ? error.code : error instanceof Error ? error.name : 'UNKNOWN' });
      if (++this.misses >= 3) { this.end('failed', `I lost track of ${this.app}, so I stopped.`); return; }
      // The window may have closed or been replaced: look for another window of the same app.
      const windows = await this.deps.windows(signal).catch((failure: unknown): AgentWindow[] => { if (signal.aborted) throw failure; return []; });
      const again = windows.find(w => w.pid === this.window.pid) ?? pickWindow(this.app, windows);
      if (again) this.window = again;
      await sleep(this.timing.retryMs, signal); return;
    }
    this.window = { ...this.window, ...snapshot.window };
    this.display = this.deps.displayOf(this.window.rect);
    if (this.plan) {
      this.url = pageUrl(snapshot) ?? this.url;
      const host = hostOf(this.url);
      // The job stays on its site: a page anywhere else asks first, whatever led there.
      if (host && !inScope(host, this.allowed)) {
        const site = this.plan.site ?? 'the site you started on';
        if (!await this.confirm(`Continue on ${host}`, `This page is on ${host}, not ${site}. Keep going here?`, signal)) { this.end('stopped', `Okay, I stopped because the page left ${site}.`); return; }
        this.allowed.push(host);
      }
    }
    if (this.placed && await this.afterPlacing(snapshot, signal)) return;
    const image = this.lookNext && this.vision && this.deps.look ? await this.deps.look(this.window, signal).catch((error: unknown): null => { if (signal.aborted) throw error; return null; }) : null;
    this.lookNext = false;
    // Saved values never reach the model: the controls, the steps so far and the page address carry placeholders instead.
    const redact = (text: string) => this.deps.memory?.redact(text) ?? text;
    const url = this.plan && this.url ? redact(this.url) : this.plan ? this.url : undefined;
    const decision = await this.decide({ goal: redact(this.goal), app: this.app, step: this.step + 1, budget: this.budget, history: this.history.slice(-14).map(redact),
      snapshot: { ...snapshot, window: { ...snapshot.window, title: redact(snapshot.window.title) } }, controls: redact(controls), image, vision: this.vision, forbidden: this.forbidden(),
      memory: this.deps.memory?.context() || undefined, url, job: this.plan ? { plan: this.plan, phase: this.phase, phaseStep: this.phaseSteps } : null }, signal);
    signal.throwIfAborted();
    if (!decision) { this.end('failed', 'I couldn’t reach the model, so I stopped. Nothing else will be clicked or typed.'); return; }
    this.step++; this.phaseSteps++;
    if (decision.type === 'invalid') { this.note(`Invalid choice: ${decision.reason}.`, false, 'Tried an invalid action'); this.emit(); return; }
    const element = 'ref' in decision && decision.ref !== undefined ? snapshot.elements.find(e => e.ref === decision.ref) : undefined;
    if ('ref' in decision && decision.ref !== undefined && !element) { this.note(`[${decision.ref}] is not in the current control list.`, false, 'Picked a control that isn’t there'); this.emit(); return; }
    switch (decision.type) {
      case 'done': if (this.plan) await this.finishJob(snapshot, decision.summary, signal); else this.end('done', decision.summary); return;
      case 'next_phase': await this.nextPhase(snapshot, decision.summary, signal); return;
      case 'go_to': await this.goTo(decision.url, signal); return;
      case 'find': {
        if (!this.deps.find) { this.note('Searching the page is not available here.', false, 'Couldn’t search the page'); return; }
        this.set('thinking', `Looking for “${decision.text}” on the page…`);
        const found = await this.deps.find({ hwnd: this.window.hwnd, pid: this.window.pid }, decision.text, signal);
        if (found.elements.length) this.matches = { text: decision.text, snapshot: found };
        this.note(found.elements.length ? `Looked for “${decision.text}”: ${found.elements.length} matching controls, listed next.` : `Looked for “${decision.text}”: nothing on the page matches.`, found.elements.length > 0, `Looked for “${decision.text}”`);
        return;
      }
      case 'ask_choice': {
        const { picked, answer } = await this.askChoice(decision.question, decision.options, signal), options = decision.options;
        if (picked === 'none') this.note(`Asked “${decision.question}”; the user chose none of the options.`, true, 'You chose none of these');
        else if (typeof picked === 'number') this.note(`Asked “${decision.question}”; the user chose option ${picked + 1}: “${options[picked].label}”${options[picked].ref !== undefined ? ` ([${options[picked].ref}] in that list; look again for its current ref)` : ''}.`, true, `You chose: ${options[picked].label.slice(0, 60)}`);
        else this.note(`Asked “${decision.question}” with options ${options.map((o, i) => `${i + 1}. ${o.label}`).join('; ')}; the user answered “${answer.slice(0, 300)}”.`, true, `You answered: ${answer.slice(0, 60)}`);
        return;
      }
      case 'fail': this.end('failed', decision.reason); return;
      case 'wait': this.note(`Waited ${decision.seconds} s.`, true); this.set('thinking', 'Waiting for the app…'); await sleep(decision.seconds * 1000, signal); return;
      case 'look':
        this.lookNext = this.vision;
        this.note(this.vision ? 'Asked to see the window; the screenshot comes with the next controls.' : 'Screenshots are not available with this model.', this.vision, 'Looked at the window'); return;
      case 'ask_user': {
        this.action = null; this.set('asking', decision.question); this.deps.say(decision.question);
        const answer = String(await waitFor<string | number>(signal, resolve => { this.answer = resolve; }));
        this.answer = undefined;
        this.deps.memory?.learn(decision.question, answer, this.plan?.site ?? this.app);
        this.note(`Asked “${decision.question}”; the user answered “${answer.slice(0, 300)}”.`, true, `You answered: ${answer.slice(0, 60)}`); return;
      }
    }
    if (decision.type === 'click' && element && !await this.variantsConfirmed(element, snapshot, signal)) return;
    await this.perform(decision, element, snapshot, signal);
  }
  /** Show options on the card, say them, and wait: the picked index, "none", or null with the user's own words. */
  private async askChoice(question: string, options: ChoiceOption[], signal: AbortSignal) {
    this.choices = options; this.action = null;
    this.set('asking', question);
    this.deps.say(`${question} ${options.map((o, i) => `Option ${i + 1}: ${o.label}${o.detail ? `, ${o.detail}` : ''}.`).join(' ')}`);
    const answer = await waitFor<string | number>(signal, resolve => { this.answer = resolve; });
    this.answer = undefined; this.choices = null;
    let picked = typeof answer === 'number' ? (answer < 0 ? 'none' : answer) : matchChoice(answer, options);
    if (typeof picked === 'number' && !options[picked]) picked = null;
    // What was chosen for this search is a preference for next time (shown in Memory, with Undo).
    if (typeof picked === 'number' && this.plan?.kind === 'store') this.deps.memory?.chose(this.plan.search ?? this.goal, options[picked].label, this.plan.site ?? this.app);
    return { picked, answer: String(answer) };
  }
  /**
   * The variant floor, decided by code: before "Add to cart" in a store job, an option group whose selected option the
   * user never named (a pre-selected flavour or size) is asked about, at most twice a job. False holds the click back.
   */
  private async variantsConfirmed(element: AgentElement, snapshot: AgentSnapshot, signal: AbortSignal) {
    if (this.plan?.kind !== 'store' || !addToCart.test(element.name.trim()) || this.variantQuestions >= 2) return true;
    const variant = unconfirmedVariant(snapshot, this.goal, this.variantsAsked);
    if (!variant) return true;
    this.variantsAsked.add(variant.key);
    const names = variant.options.map(o => o.name.trim()), now = names[variant.selected];
    if (variant.wanted !== null) {
      this.note(`Not added yet: “${now}” is selected, but the user asked for “${names[variant.wanted]}”. Select it, then add to the cart.`, false, `Selecting ${names[variant.wanted]} first`);
      return false;
    }
    this.variantQuestions++;
    const list = names.length > 2 ? `${names.slice(0, -1).join(', ')} or ${names.at(-1)}` : names.join(' or ');
    const { picked, answer } = await this.askChoice(`Which ${variant.title?.toLowerCase() ?? 'one'} would you like: ${list}? ${now} is selected now.`, variant.options.map(o => ({ label: o.name.trim(), ref: o.ref })), signal);
    if (picked === variant.selected) { this.note(`The user confirmed “${now}”.`, true, `You chose: ${now}`); return true; }
    if (typeof picked === 'number') this.note(`Not added yet: the user chose “${names[picked]}” instead of “${now}”. Select it, then add to the cart.`, true, `You chose: ${names[picked]}`);
    else if (picked === 'none') this.note(`The user wants none of ${list}. Ask what they want, or fail.`, true, 'You chose none of these');
    else this.note(`Asked which of ${list}; the user answered “${answer.slice(0, 300)}”. Act on that before adding to the cart.`, true, `You answered: ${answer.slice(0, 60)}`);
    return false;
  }
  private async nextPhase(snapshot: AgentSnapshot, summary: string, signal: AbortSignal) {
    const plan = this.plan, phase = plan?.phases[this.phase];
    if (!plan || !phase) { this.note('There are no phases in this task; use done when it is complete.', false, 'Tried to move on'); return; }
    this.note(`Finished “${phase.title}”: ${summary}`, true, `${phase.title}: ${summary}`);
    // What Kite picked is said out loud, so a choice made without asking is never silent.
    if (phase.id === 'choose') this.deps.say(summary);
    const next = this.phase + 1;
    if (!plan.phases[next]?.kite) { await this.finishJob(snapshot, summary, signal); return; }
    this.phase = next; this.phaseSteps = 0; this.phaseExtra = 0; this.emit();
  }
  /**
   * The end of a job, in words written by code. A store job ends with the cart read back from the page; when the
   * cart isn't on screen, the agent gets one chance to open it, then Kite says it couldn't check.
   */
  private async finishJob(snapshot: AgentSnapshot, summary: string, signal: AbortSignal) {
    const plan = this.plan;
    if (!plan) { this.end('done', summary); return; }
    if (plan.kind === 'form') { this.end('done', `${summary} I haven’t submitted it; that part is yours.`); return; }
    // Checking out: only an order confirmation read from the page ends the job as ordered.
    if (this.checkout) {
      if (this.placed && await this.afterPlacing(snapshot, signal)) return;
      this.end('done', this.placed ? 'I couldn’t confirm the order went through. Check your orders page before you try again.'
        : 'I stopped before placing the order. It’s ready for you on screen.');
      return;
    }
    const cart = readCart(snapshot);
    if (cart?.lines.length) { await this.checkoutOrHandOver(cartSentence(cart), cart.lines, snapshot, signal); return; }
    if (this.cartMisses++ < 1) {
      this.phase = Math.max(this.phase, plan.phases.findIndex(p => p.id === 'cart'));
      this.note('Finishing needs the cart on screen so Kite can read it back to the user: open the cart page, then call done.', false, 'Opening the cart to check it');
      return;
    }
    this.end('done', `${summary} I couldn’t read the cart back myself, so please check it before you pay.`);
  }
  /**
   * The end of the cart (docs/end-to-end-jobs.md §3.3): who checks out is the Spend money setting. Don't allow hands over;
   * Allow, or Hands-off for this job, carries on; Ask asks "check out yourself, or should I?", with "Remember for this
   * site". The spend limit is not checked here but at Place order, which has its own confirmation.
   */
  private async checkoutOrHandOver(said: string, lines: CartLine[], snapshot: AgentSnapshot, signal: AbortSignal) {
    const plan = this.plan, at = plan.phases.findIndex(p => p.id === 'checkout');
    const base = this.resolve({ category: 'money', reason: '' }, snapshot).base;
    if (at < 0 || base === 'never') { this.end('done', `${said} Check out whenever you’re ready; I’ll leave that to you.`); return; }
    let asked = false;
    // A repeat order was confirmed before the job ("I'll check out like last time"): no second question if the cart is what was ordered then.
    const repeat = this.deps.repeat;
    const confirmed = !!repeat && sameItems(lines.map(l => `${l.quantity && l.quantity > 1 ? `${l.quantity} × ` : ''}${l.name}`), repeat.items);
    if (repeat && !confirmed) this.note('The cart doesn’t match the order being repeated, so the user is asked who checks out.', false, 'The cart differs from last time');
    if (this.scope !== 'handsOff' && base !== 'allow' && !confirmed) {
      asked = true;
      const place = this.place;
      this.choices = [{ label: 'I’ll do it', detail: 'I stop here and leave the cart on screen' }, { label: 'You do it', detail: 'I fill in checkout and ask you before placing the order' }];
      this.rememberLabel = place ? `Remember for ${placeLabel(place)}` : null; this.rememberChoice = false; this.checkoutAsked = true; this.action = null;
      const question = `${said} Do you want to check out yourself, or should I?`;
      this.set('asking', question); this.deps.say(question);
      const answer = await waitFor<string | number>(signal, resolve => { this.answer = resolve; });
      this.answer = undefined; this.choices = null; this.rememberLabel = null; this.checkoutAsked = false;
      const spoken = typeof answer === 'string' ? matchCheckout(answer) : null;
      const who = typeof answer === 'number' ? (answer === 1 ? 'kite' : 'me') : spoken?.who ?? 'me';
      if ((this.rememberChoice || spoken?.remember) && place) this.deps.remember?.('money', who === 'kite' ? 'allow' : 'never', place);
      if (who === 'me') { this.end('done', `Okay. ${said} It’s all yours from here.`, true); return; }
    }
    this.checkout = true; this.cartLines = lines;
    plan.phases[at].kite = true; this.phase = at; this.phaseSteps = 0; this.phaseExtra = 0;
    // A first order is 25–45 steps; checking out gets room of its own on top of what finding it used.
    this.budget = Math.max(this.budget, this.step + 30);
    this.note('The user asked Kite to check out. Go to checkout now: the cart phase is complete.', true, 'Checking out');
    this.deps.say(asked ? 'Okay, I’ll check out. I’ll ask you before I place the order.' : confirmed ? `${said} Checking out like last time.` : `${said} Checking out now.`);
    this.emit();
  }
  private cartNames() { return this.cartLines.map(l => `${l.quantity && l.quantity > 1 ? `${l.quantity} × ` : ''}${l.name}`); }
  /** The last time these items were ordered, for the price check: the same items, or the same single item. */
  private lastTime(): PastOrder | null {
    const orders = this.deps.memory?.orders?.() ?? [], names = this.cartNames();
    return orders.find(o => sameItems(names, o.items)) ?? (this.cartLines.length === 1 ? lastOrderOf(orders, this.cartLines[0].name) : null);
  }
  /** The button that places the order or pays: the one money step Kite confirms even after "you do it". */
  private placesOrder(action: AgentAction, element: AgentElement | undefined, focused: AgentElement | undefined) {
    const target = action.type === 'click' ? element : action.type === 'press_keys' && /^enter$/i.test(action.keys.trim()) ? focused : undefined;
    return !!target && placesOrder.test(`${target.name} ${target.automationId.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')}`.trim());
  }
  /** After the order button: a confirmation ends the job; a payment the user must approve is waited for. False: neither. */
  private async afterPlacing(snapshot: AgentSnapshot, signal: AbortSignal): Promise<boolean> {
    const order = readOrder(snapshot);
    if (order) { this.ordered(order); return true; }
    const pending = paymentPending(snapshot);
    if (pending) { await this.waitForPayment(pending, signal); return true; }
    return false;
  }
  private ordered(order: PlacedOrder) {
    const site = this.plan?.site ?? hostOf(this.url) ?? this.app;
    this.deps.memory?.ordered?.({ number: order.number, items: this.cartNames(), total: order.total, site, when: order.when, payment: this.paidBy });
    for (const p of this.plan?.phases ?? []) p.kite = true;
    this.end('done', `Ordered. Order number ${order.number}${order.total ? `, ${order.total}` : ''}${order.when ? `, arriving ${order.when}` : ''}.`);
  }
  /**
   * The payment handoff: an expected state, not a failure. Kite looks at the page every few seconds without asking the
   * model, until the order is confirmed, the page moves on, the user says they've paid, or ten minutes pass.
   */
  private async waitForPayment(message: string, signal: AbortSignal) {
    const deadline = Date.now() + (this.timing.payMs ?? 10 * 60_000);
    clearTimeout(this.wall); this.wall = setTimeout(() => this.end('failed', 'I couldn’t confirm the order went through. Check your orders page before you pay again.'), (this.timing.payMs ?? 10 * 60_000) + 60_000);
    this.action = null; this.target = null; this.set('waiting', message); this.deps.say(message);
    let nudged = false;
    while (!this.finished) {
      await Promise.race([sleep(this.timing.pollMs ?? 2000, signal), new Promise<void>(resolve => { this.nudge = () => { nudged = true; resolve(); }; })]);
      this.nudge = undefined; signal.throwIfAborted();
      const page = await this.deps.snapshot({ hwnd: this.window.hwnd, pid: this.window.pid }, signal).catch((error: unknown): null => { if (signal.aborted) throw error; return null; });
      if (page) {
        this.url = pageUrl(page) ?? this.url;
        const order = readOrder(page);
        if (order) { this.ordered(order); return; }
        if (!paymentPending(page)) { this.note('The payment page changed without an order confirmation. Look at the page: finish if it shows an error or asks for something.', false, 'The payment page changed'); this.set('thinking', `Looking at ${this.app}…`); return; }
        if (nudged) { nudged = false; this.deps.say('The page still says the payment is pending. I’ll keep watching.'); }
      }
      if (Date.now() > deadline) { this.end('failed', 'I couldn’t confirm the order went through. Check your orders page before you pay again.'); return; }
    }
  }
  private async goTo(url: string, signal: AbortSignal) {
    const host = hostOf(url), summary = describeAction({ type: 'go_to', url });
    if (!host) { this.note(`${url} is not a web address.`, false, 'Tried an invalid address'); return; }
    let decision: 'approved' | 'auto' = 'auto';
    if (!inScope(host, this.allowed)) {
      if (!await this.confirm(summary, `That’s ${host}, outside ${this.plan?.site ?? 'the job’s site'}. Go there?`, signal)) {
        this.deps.audit('go_to', summary, 'denied', { ok: false, message: 'User declined.' });
        this.note(`${summary}: the user said no. Stay on ${this.plan?.site ?? 'the current site'}.`, false, `${summary} (you said no)`); return;
      }
      this.allowed.push(host); decision = 'approved';
    } else {
      // Inside the site, going somewhere is looking around: it asks only when the user's settings say so.
      const resolution = this.resolve({ category: 'look', reason: '' }, null);
      if (resolution.permission === 'never') { this.refuse('go_to', summary, resolution, false); return; }
      if (resolution.permission === 'ask') {
        this.action = summary; this.target = null;
        const answer = await this.askStep(summary, resolution, signal);
        if (answer === 'stop') { this.end('stopped', 'Okay, I stopped.'); return; }
        if (!yes(answer)) { this.deps.audit('go_to', summary, 'denied', { ok: false, message: 'User declined.' }); this.note(`${summary}: the user said no.`, false, `${summary} (you said no)`); return; }
        if (answer === 'allowAll') this.scope = 'task';
        decision = 'approved';
      }
    }
    this.set('acting', summary);
    let r = await this.deps.keys({ hwnd: this.window.hwnd, pid: this.window.pid }, 0, -1, [{ vk: 0x4c, mods: [modifierVk('ctrl')] }, { text: url }, { vk: 0x0d, mods: [] }], signal);
    // Not in front: open it in a new tab instead, which needs no keyboard.
    if (r.code === 'EFOREGROUND' && await this.deps.openUrl?.(url, this.window, signal)) { r = { ok: true, via: 'tab' }; await sleep(this.timing.settleMs * 4, signal); }
    const message = r.ok ? (r.via === 'tab' ? 'Opened in a new tab.' : 'Opened.') : r.code === 'EFOREGROUND' ? `${this.app} wasn’t in front, so I didn’t type the address.` : 'That didn’t work.';
    this.deps.audit('go_to', summary, decision, { ok: r.ok, message });
    this.note(`${summary} → ${message}`, r.ok, summary);
    this.failed = r.ok ? 0 : this.failed + 1;
    if (this.failed >= 3) { this.end('failed', `Three actions in a row didn’t work, so I stopped. ${message}`); return; }
    this.emit();
    await sleep(this.timing.settleMs * 2, signal);
  }
  /** Where this step happens, for the user's per-site and per-app rules: the page's host, else the app. */
  private get place() { return placeOf(hostOf(this.plan ? this.url : null), this.window?.process); }
  /** The user's settings for one step (ADR 014): never, ask, or allow, with the job's start choice and the floor applied. */
  private resolve(step: StepClass, snapshot: AgentSnapshot | null): Resolution {
    return resolve(step, this.deps.permissions?.() ?? defaultPermissions, { place: this.place, amount: step.category === 'money' && snapshot ? pageTotal(snapshot) : null,
      override: this.scope === 'handsOff' ? 'handsOff' : this.scope === 'once' ? 'stepByStep' : null, allowed: this.plan ? jobCategories[this.plan.kind] : null });
  }
  /** Things the user's settings never allow here, for the model's instructions, so it plans around them. */
  private forbidden(): string[] {
    const settings = this.deps.permissions?.() ?? defaultPermissions, table = permissionTable(settings), place = this.place;
    return categories.filter(c => (ruleFor(settings, c, place)?.permission ?? table[c]) === 'never').map(c => categoryInfo[c].verb);
  }
  /** A step the settings don't allow: nothing runs, and the agent is told to hand over rather than try another way round. */
  private refuse(type: string, summary: string, resolution: Resolution, secret: boolean) {
    this.deps.audit(type, summary, 'denied', { ok: false, message: resolution.reason });
    const next = secret ? 'Kite never types passwords, card numbers, one-time codes, CVVs or PINs: ask_user to have the user type it themselves, then continue.'
      : 'Don’t look for another way to do it. If the task needs this step, call done now and say it is ready for the user to finish.';
    this.note(`${summary}: not done. ${resolution.reason} ${next}`, false, `${summary} (not allowed)`);
    this.action = null; this.target = null; this.emit();
  }
  /** Ask about one step on the card and out loud; "always" and "never" are saved for this place or everywhere. */
  private async askStep(summary: string, resolution: Resolution, signal: AbortSignal): Promise<Answer> {
    const place = this.place, category = resolution.category;
    const always = !resolution.floor && resolution.base === 'ask';
    this.ask = { category, label: categoryInfo[category].label, place: place ? placeLabel(place) : null, always };
    this.risk = resolution.reason || null;
    this.set('approval', resolution.reason || 'Okay to do this step?');
    if (resolution.reason) this.deps.say(`Can I ${summary.charAt(0).toLowerCase()}${summary.slice(1)}? ${resolution.reason} Say yes or no.`);
    const answer = await waitFor<Answer>(signal, resolve => { this.approval = resolve; });
    this.approval = undefined; this.ask = null; this.risk = null;
    if ((answer === 'always' || answer === 'alwaysEverywhere') && always) this.deps.remember?.(category, 'allow', answer === 'always' ? place : null);
    // A plain yes where "Always" would have helped counts toward offering to stop asking here.
    if (answer === 'allow' && always && place && this.deps.nudge?.yes(category, place)) this.pendingNudge = { category, place };
    if (answer === 'never' || answer === 'neverEverywhere') this.deps.remember?.(category, 'never', answer === 'never' ? place : null);
    return answer;
  }
  private async perform(action: Extract<AgentAction, { type: 'click' | 'type_text' | 'press_keys' | 'scroll' }>, element: AgentElement | undefined, snapshot: AgentSnapshot, signal: AbortSignal) {
    const summary = describeAction(action, element), focused = snapshot.elements.find(e => e.focused);
    const main = snapshot.layers.find(l => l.main)?.layer;
    const dialogText = snapshot.elements.filter(e => e.layer !== main && (e.role === 'Text' || e.role === 'Document')).map(e => e.name).join(' ');
    const step = classifyStep(action, { element, focused, process: this.window.process, title: this.window.title, dialogText, url: this.plan ? this.url : null, phase: this.plan?.phases[this.phase]?.id });
    let resolution = this.resolve(step, snapshot);
    this.action = summary;
    this.target = element?.rect ?? (action.type !== 'click' && action.type !== 'scroll' ? focused?.rect ?? null : null);
    if (resolution.permission === 'never') { this.refuse(action.type, summary, resolution, step.floor === 'secret'); return; }
    let decision: 'approved' | 'auto' = 'auto';
    const commit = this.checkout && step.category === 'money' && this.placesOrder(action, element, focused);
    // "You do it" covers checkout's steps (address, delivery, payment method) but not the one that places the order.
    if (this.checkout && step.category === 'money' && !commit && resolution.permission === 'ask') resolution = { ...resolution, permission: 'allow' };
    if (commit) {
      const total = pageTotal(snapshot), shown = total === null ? null : rupees(total), summaryNow = orderSummary(snapshot);
      this.paidBy = summaryNow.payment;
      // The price check: far above the last order of the same thing asks, in every mode. A repeat's own yes covers its amount.
      const last = this.lastTime(), repeat = this.deps.repeat;
      const jump = total !== null && last?.total ? total > last.total * priceJump : false;
      const covered = !!repeat?.total && total !== null && total <= repeatTolerance(repeat.total) && this.checkout && sameItems(this.cartNames(), repeat.items);
      if (jump) resolution = { ...resolution, permission: 'ask', floor: true, reason: `That’s ${shown}, more than 1.5 times last time (${rupees(last.total)}).` };
      else if (covered) resolution = { ...resolution, permission: 'allow' };
      else if (repeat?.total && total !== null && resolution.permission === 'ask') resolution = { ...resolution, reason: `That’s ${shown}; you said yes to about ${rupees(repeat.total)}.` };
      if (resolution.permission === 'allow') this.deps.say(`Placing the order${shown ? ` for ${shown}` : ''}${covered ? ', as you said' : ''}.`);
      else {
        // The order card: total, address, payment and delivery as code read them from the page. The address is shown, not spoken.
        const order = orderSummary(snapshot);
        this.orderView = order; this.ask = null; this.risk = resolution.reason;
        // The card lists the address, payment and delivery under the question.
        this.set('approval', `${jump || repeat?.total ? `${resolution.reason} ` : ''}Place the order${order.total ? ` for ${order.total}` : ''}?`);
        this.deps.say(`${jump || repeat?.total ? `${resolution.reason} ` : ''}Place the order${order.total ? ` for ${order.total}` : ''}${order.payment ? `, paying by ${order.payment}` : ''}? The address is on the card. Say yes or no.`);
        const answer = await waitFor<Answer>(signal, resolve => { this.approval = resolve; });
        this.approval = undefined; this.orderView = null; this.risk = null;
        if (answer === 'stop') { this.end('stopped', 'Okay, I stopped. Nothing was ordered.'); return; }
        if (!yes(answer)) {
          this.deps.audit(action.type, summary, 'denied', { ok: false, message: 'User declined.' });
          this.note(`${summary}: the user doesn’t want Kite to place the order. Call done now; the order is ready for them.`, false, 'Not placing the order (you said no)'); return;
        }
        decision = 'approved';
      }
    } else if (resolution.permission === 'ask') {
      const answer = await this.askStep(summary, resolution, signal);
      if (answer === 'stop') { this.end('stopped', 'Okay, I stopped.'); return; }
      if (!yes(answer)) {
        this.deps.audit(action.type, summary, 'denied', { ok: false, message: 'User declined.' });
        this.note(`${summary}: the user said no${answer === 'skip' ? '' : ` and not to ${categoryInfo[resolution.category].verb}${answer === 'never' && this.place ? ' here' : ''} again`}. Find another way or finish.`, false, `${summary} (you said no)`); return;
      }
      if (answer === 'allowAll') this.scope = 'task';
      decision = 'approved';
    }
    this.set('acting', summary);
    // Point first: the kite flies to the control so the user sees what is about to happen.
    await sleep(this.timing.pointMs, signal);
    let run = action;
    if (action.type === 'type_text' && /\{\{/.test(action.text)) {
      // Saved values are typed by code: the model only ever wrote the placeholder.
      const filled = this.deps.memory?.fill(action.text) ?? { text: action.text, missing: [...action.text.matchAll(/\{\{([^}]+)\}\}/g)].map(m => m[1]) };
      if (filled.missing.length) {
        this.deps.audit(action.type, summary, decision, { ok: false, message: 'Nothing saved for that.' });
        this.note(`${summary} → not typed: nothing is saved for ${filled.missing.map(k => `{{${k}}}`).join(', ')}. Ask the user with ask_user.`, false, summary);
        this.emit(); return;
      }
      run = { ...action, text: filled.text };
    }
    const result = await this.execute(run, element, snapshot, signal);
    const message = result.ok ? result.message : result.message || 'That didn’t work.';
    if (commit && result.ok) this.placed = true;
    const nudge = this.pendingNudge; this.pendingNudge = null;
    if (nudge && result.ok) {
      const what = categoryInfo[nudge.category].label, where = placeLabel(nudge.place);
      const accepted = await this.confirm(`Stop asking about “${what}” on ${where}`, `That’s ${nudgeAfter} times you’ve said yes to “${what}” on ${where}. Stop asking about those there?`, signal);
      if (accepted) this.deps.remember?.(nudge.category, 'allow', nudge.place);
      this.deps.nudge?.offered(nudge.category, nudge.place, accepted);
      this.note(accepted ? `The user said Kite can stop asking about “${what}” on ${where}.` : `The user wants to keep being asked about “${what}”.`, true, accepted ? `Won’t ask about “${what}” here again` : 'Will keep asking');
    }
    this.deps.audit(action.type, summary, decision, { ok: result.ok, message });
    this.note(`${summary} → ${message}`, result.ok, summary);
    this.failed = result.ok ? 0 : this.failed + 1;
    if (this.failed >= 3) { this.end('failed', `Three actions in a row didn’t work, so I stopped. ${message}`); return; }
    this.emit();
    await sleep(this.timing.settleMs, signal);
  }
  private async execute(action: Extract<AgentAction, { type: 'click' | 'type_text' | 'press_keys' | 'scroll' }>, element: AgentElement | undefined, snapshot: AgentSnapshot, signal: AbortSignal): Promise<{ ok: boolean; message: string }> {
    const target = { hwnd: this.window.hwnd, pid: this.window.pid };
    // Windows keeps a window in the back while the user types elsewhere. Keys can't reach it then, but UI Automation can.
    const explain = (r: ActResult) => r.code === 'EFOREGROUND' ? `${this.app} isn’t in front, so no keys were sent. Keep going without the keyboard: fill fields with type_text and replace: true, and click buttons (such as Search) instead of pressing Enter.` : failures[r.code] ?? 'That didn’t work.';
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
    // Replacing, or filling an empty field, is one UI Automation call: no keyboard, so it works with the window in the back.
    if ((action.replace || (element && !element.value)) && element?.patterns.includes('value') && !element.password && !element.readOnly) {
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
  /** A choice made on the card: the option's index, or -1 for none of them. */
  choose(index: number, remember = false) {
    if (this.status === 'asking' && this.choices && this.answer && Number.isInteger(index) && index >= -1 && index < this.choices.length) { this.rememberChoice = remember === true; this.answer(index); }
  }
  /** Card buttons and voice. Returns nothing; replies are chosen by command(). */
  control(action: TaskAction) {
    if (this.finished) return;
    if (this.status === 'approval' && this.approval && action !== 'pause' && action !== 'resume') { this.approval(action); return; }
    if (action === 'resume' && this.status === 'waiting') { this.nudge?.(); return; }
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
      const ask = this.ask, where = ask?.place ? ` on ${ask.place}` : '', what = ask ? categoryInfo[ask.category] : null;
      this.control(action);
      if (action === 'stop') return 'Okay, I’ve stopped.';
      if (action === 'skip') return 'Okay, I won’t do that.';
      if (action === 'allowAll') return 'Okay. From here I’ll follow your settings.';
      if ((action === 'always' || action === 'alwaysEverywhere') && what) return ask.always ? `Okay. I won’t ask about “${what.label}” steps${action === 'always' ? where : ''} again.` : 'Okay, this once. I always ask about steps like this one.';
      if ((action === 'never' || action === 'neverEverywhere') && what) return `Okay. I won’t ${what.verb}${action === 'never' ? where : ''}.`;
      return action === 'never' || action === 'neverEverywhere' ? 'Okay, I won’t do that.' : 'Okay.';
    }
    if (this.status === 'waiting') {
      if (action === 'stop') { this.control('stop'); return 'Okay, I’ve stopped watching. Check your orders page to see if it went through.'; }
      if (action === 'resume') { this.nudge?.(); return 'Let me check.'; }
      return undefined;
    }
    if (this.status === 'asking' && this.answer && this.checkoutAsked) {
      if (action === 'stop') { this.control('stop'); return 'Okay, I’ve stopped.'; }
      const m = matchCheckout(text);
      this.answer(text.trim());
      return m?.who === 'kite' ? 'Okay, I’ll check out.' : 'Okay, it’s all yours.';
    }
    if (this.status === 'asking' && this.answer) {
      if (action === 'stop') { this.control('stop'); return 'Okay, I’ve stopped.'; }
      if (action === 'pause') { this.control('pause'); return 'Okay, I’ll wait.'; }
      const choices = this.choices, picked = choices ? matchChoice(text, choices) : null;
      this.answer(text.trim());
      return typeof picked === 'number' ? `Got it: ${choices[picked].label}.` : picked === 'none' ? 'Okay, none of those.' : 'Got it.';
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
