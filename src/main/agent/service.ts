import { screen } from 'electron';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { uIOhook, UiohookKey, type UiohookKeyboardEvent, type UiohookMouseEvent } from 'uiohook-napi';
import type { AgentWindow, TaskAction, TaskScope, TaskView } from '../../shared/agent';
import type { CursorPoint, ModelEntry, ScreenBounds } from '../../shared/types';
import type { ToolResult } from '../tools/types';
import type { Decision, StepPrompt } from './model';
import { TaskSession, type TaskMemory } from './session';
import { routingHints } from '../ai/routing';
import { ActClient } from './sidecar';
import { browserApp, type JobPlan } from '../../shared/job';
import type { Category, Permission, PermissionSettings } from '../../shared/permissions';
export interface TaskServiceDeps {
  directory: string;
  log(event: string, data?: Record<string, unknown>): void;
  enabled(): boolean;
  /** True when Kite's own overlay would receive this click (card, bubble, board). */
  overlayHit(point: CursorPoint): boolean;
  emit(view: TaskView | null): void;
  say(text: string): void;
  launch(app: string): Promise<boolean>;
  look(window: AgentWindow, signal: AbortSignal): Promise<Uint8Array | null>;
  audit(messageId: number | null, tool: string, summary: string, decision: 'approved' | 'denied' | 'auto', result: { ok: boolean; message: string }): void;
  finished(goal: string, app: string, message: string, status: 'done' | 'failed' | 'stopped'): void;
  /** A task is starting: anything else that moves the kite yields. */
  starting?(): void;
  decider(model: ModelEntry, key: string): (prompt: StepPrompt, signal: AbortSignal) => Promise<Decision>;
  /** Browser tasks are jobs: one model call plans them (agent/planner.ts). */
  planner?(model: ModelEntry, key: string): (goal: string, app: string, signal: AbortSignal) => Promise<JobPlan | null>;
  /** The user's permission settings, and saving an "Always" or "Never" answer (ADR 014). */
  permissions?(): PermissionSettings;
  remember?(category: Category, permission: Permission, place: string | null): void;
  memory?: TaskMemory;
}
// Browsers whose executable, given a URL, opens it as a new tab of the last active window. Nothing else is launched.
const browsers: { app: RegExp; exe: string[] }[] = [
  { app: /\bedge\b/i, exe: ['ProgramFiles(x86)', 'ProgramFiles'].map(root => path.join(process.env[root] ?? '', 'Microsoft', 'Edge', 'Application', 'msedge.exe')) },
  { app: /\bchrome\b/i, exe: ['ProgramFiles', 'ProgramFiles(x86)', 'LOCALAPPDATA'].map(root => path.join(process.env[root] ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe')) },
];
/** A job's page in a new tab without the keyboard (Windows won't bring the browser forward while the user types elsewhere). */
function openInBrowser(app: string, url: string): boolean {
  try { if (!/^https?:$/.test(new URL(url).protocol)) return false; } catch { return false; }
  const exe = browsers.find(b => b.app.test(app))?.exe.find(file => file && existsSync(file));
  if (!exe) return false;
  spawn(exe, [url], { detached: true, stdio: 'ignore' }).unref();
  return true;
}
const modifiers = new Set<number>([UiohookKey.Ctrl, UiohookKey.CtrlRight, UiohookKey.Shift, UiohookKey.ShiftRight, UiohookKey.Alt, UiohookKey.AltRight, UiohookKey.Meta, UiohookKey.MetaRight]);
/** Owns the one running task, its sidecar, and the "you took over" detector. */
export class TaskService {
  private session?: TaskSession;
  private sequence = 0;
  private client: ActClient;
  /** Key events are ours while the sidecar types, plus a short tail for the hook to deliver them. */
  private injecting = 0;
  constructor(private deps: TaskServiceDeps) {
    this.client = new ActClient({ directory: deps.directory, excludePid: process.pid, log: deps.log,
      toDip: (rect, awareness) => process.platform === 'win32' && awareness !== 'unaware' ? screen.screenToDipRect(null, rect) : rect });
    uIOhook.on('mousedown', this.mouse); uIOhook.on('keydown', this.key);
  }
  get active() { return !!this.session && !this.session.ended; }
  private mouse = (event: UiohookMouseEvent) => {
    const session = this.active ? this.session : undefined; if (!session) return;
    // Low-level hook coordinates are physical; Kite's own card and board never count as taking over.
    const point = process.platform === 'win32' ? screen.screenToDipPoint({ x: event.x, y: event.y }) : screen.getCursorScreenPoint();
    if (!this.deps.overlayHit(point)) session.userTookOver();
  };
  private key = (event: UiohookKeyboardEvent) => {
    const session = this.active ? this.session : undefined;
    if (!session || this.injecting > 0 || modifiers.has(event.keycode)) return;
    if (event.keycode === UiohookKey.Escape) session.control('stop'); else session.userTookOver();
  };
  start(task: { goal: string; app: string }, scope: TaskScope, model: ModelEntry, key: string | undefined, messageId: number | null): ToolResult {
    if (!this.deps.enabled()) return { ok: false, message: 'Doing tasks is turned off in Settings.' };
    if (process.platform !== 'win32' || !this.client.supported) return { ok: false, message: 'Doing tasks needs Windows UI Automation, which is not available here.' };
    if (!key) return { ok: false, message: 'No key is saved for the jobs model.' };
    if (!model.supportsTools) return { ok: false, message: `${model.label} can’t do tasks. Choose a jobs model with Actions in Settings.` };
    this.session?.dispose();
    this.deps.starting?.();
    const decide = this.deps.decider(model, key), planner = browserApp.test(task.app) ? this.deps.planner?.(model, key) : undefined;
    const display = (rect: ScreenBounds) => screen.getDisplayMatching({ x: Math.round(rect.x), y: Math.round(rect.y), width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) }).bounds;
    const session: TaskSession = new TaskSession(++this.sequence, task.goal, task.app, scope, {
      windows: signal => this.client.windows(signal),
      snapshot: (target, signal) => this.client.snapshot(target, signal),
      find: (target, text, signal) => this.client.find(target, text, signal),
      openUrl: async url => openInBrowser(task.app, url),
      plan: planner ? signal => planner(task.goal, task.app, signal) : undefined,
      act: (seq, ref, action, extra, signal) => this.client.act(seq, ref, action, extra, signal),
      keys: async (target, seq, focus, items, signal) => {
        this.injecting++;
        try { return await this.client.keys(target, seq, focus, items, signal); }
        finally { setTimeout(() => { this.injecting--; }, 250); }
      },
      launch: app => this.deps.launch(app),
      decide, look: model.supportsVision ? (window, signal) => this.deps.look(window, signal) : undefined,
      displayOf: display,
      emit: view => { if (this.session === session) this.deps.emit(view); },
      say: text => { if (this.session === session) this.deps.say(text); },
      audit: (type, summary, decision, result) => this.deps.audit(messageId, `task:${type}`, summary, decision, result),
      finished: (message, status) => this.deps.finished(task.goal, task.app, message, status),
      log: this.deps.log, permissions: this.deps.permissions, remember: this.deps.remember, memory: this.deps.memory,
    }, model.supportsVision);
    this.session = session;
    this.deps.log('task:start', { ok: true });
    session.start();
    return { ok: true, message: `The task is running in ${task.app}. Kite shows its progress on a card, asks the user itself when a step needs confirming, and says when it is done. Reply with one short sentence such as "On it!" Do not describe the steps or claim the result yet.` };
  }
  command(text: string) { return this.active ? this.session?.command(text) : undefined; }
  control(action: TaskAction) { if (this.active) this.session?.control(action); }
  choose(index: number) { if (this.active) this.session?.choose(index); }
  context(): string | undefined {
    if (!this.deps.enabled()) return undefined;
    const s = this.active ? this.session : undefined;
    if (!s) return routingHints.task;
    return `Kite is doing a task in ${s.app}: "${s.goal}" (step ${s.steps} of ${s.budget}, ${s.state}).${s.question ? ` It asked the user: "${s.question}"` : ''} Kite itself handles "stop", "pause", "continue", and yes or no for its confirmations. Calling do_task again replaces this task.`;
  }
  pause() { if (this.active) this.session?.pause('Paused. Say “continue” when you’re ready.'); }
  stop() { if (this.active) this.session?.control('stop'); }
  refresh() { if (this.session) this.deps.emit(this.session.ended ? null : this.session.view()); }
  dispose() {
    this.session?.dispose(); this.session = undefined; this.client.stop();
    uIOhook.removeListener('mousedown', this.mouse); uIOhook.removeListener('keydown', this.key);
  }
}
