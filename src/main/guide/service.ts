import { screen } from 'electron';
import { generateText } from 'ai';
import { uIOhook, type UiohookMouseEvent } from 'uiohook-napi';
import type { CursorPoint, ModelEntry, ProviderId, ScreenBounds } from '../../shared/types';
import { classifyGuideCommand, type GuideAction, type GuidePlan, type GuideStep, type GuideView } from '../../shared/guide';
import { captureDisplay, prepareImages } from '../vision/service';
import { getModel } from '../ai/providers';
import { providerOptionsFor } from '../ai/ask';
import { routingHints } from '../ai/routing';
import type { ToolResult } from '../tools/types';
import { alreadyDone, matchTarget, neighbours, snapToElement, visionAllowed } from './grounding';
import { GuideSession, type Located } from './session';
import { UiaClient } from './uia';
import { locateWithVision } from './vision';
export interface GuideServiceDeps {
  directory: string;
  emit(view: GuideView | null): void;
  announce(text: string | null): void;
  enabled(): boolean;
  visionModel(): ModelEntry | undefined;
  getKey(provider: ProviderId): string | undefined;
  /** True when Kite's own overlay would receive this click (bubble, card, annotation). */
  overlayHit(point: CursorPoint): boolean;
  log(event: string, data?: Record<string, unknown>): void;
}
const displayOf = (rect: ScreenBounds) => screen.getDisplayMatching({ x: Math.round(rect.x), y: Math.round(rect.y), width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) });
export class GuideService {
  private session?: GuideSession;
  private sequence = 0;
  /** Process of the window the guide last found a control in: vision may only look at that app. */
  private guidedProcess?: string;
  private uia: UiaClient;
  constructor(private deps: GuideServiceDeps) {
    this.uia = new UiaClient({ directory: deps.directory, excludePid: process.pid, log: deps.log,
      toDip: (rect, awareness) => process.platform === 'win32' && awareness !== 'unaware' ? screen.screenToDipRect(null, rect) : rect });
    uIOhook.on('mousedown', this.mouse); uIOhook.on('keydown', this.key);
  }
  private mouse = (event: UiohookMouseEvent) => {
    const session = this.session; if (!session) return;
    // Low-level hook coordinates are physical; the cursor fallback is already DIP.
    const point = process.platform === 'win32' ? screen.screenToDipPoint({ x: event.x, y: event.y }) : screen.getCursorScreenPoint();
    if (!this.deps.overlayHit(point)) session.click(point);
  };
  private key = () => this.session?.key();
  get active() { return !!this.session; }
  start(plan: GuidePlan): ToolResult {
    if (!this.deps.enabled()) return { ok: false, message: 'Guide mode is turned off in Settings.' };
    this.session?.stop(); this.guidedProcess = undefined;
    const session: GuideSession = new GuideSession(++this.sequence, plan, {
      locate: (step, options) => this.locate(plan, step, options),
      emit: view => {
        if (this.session !== session) return;
        if (view === null) this.session = undefined;
        this.deps.emit(view);
      },
      announce: text => { if (this.session === session) this.deps.announce(text); },
      log: this.deps.log,
    });
    this.session = session;
    this.deps.log('guide:start', { count: plan.steps.length });
    session.start();
    return { ok: true, message: 'The guide is running. Kite is flying to step 1 and will say each step itself. Reply with one short sentence such as "Follow me!" Do not list or repeat the steps.' };
  }
  private async locate(plan: GuidePlan, step: GuideStep, options: { vision: boolean; signal: AbortSignal; near: ScreenBounds | null }): Promise<Located | null> {
    const snapshot = await this.uia.snapshot(options.signal);
    options.signal.throwIfAborted();
    if (snapshot) {
      const match = matchTarget(snapshot.elements, step, options.near);
      if (match) {
        this.guidedProcess = snapshot.window.process;
        return { rect: match.element.rect, display: displayOf(match.element.rect).bounds, source: 'uia', verified: true, done: alreadyDone(match.element),
          nearby: neighbours(snapshot.elements, match.element.rect) };
      }
    }
    if (!options.vision) return null;
    if (!visionAllowed(snapshot?.window.process, this.guidedProcess, this.uia.lastError)) return null;
    const model = this.deps.visionModel(), key = model && this.deps.getKey(model.provider);
    if (!model || !key) return null;
    const signal = AbortSignal.any([options.signal, AbortSignal.timeout(25_000)]);
    const display = snapshot ? displayOf(snapshot.window.rect) : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const started = performance.now();
    try {
      const found = await locateWithVision({ plan, step, signal,
        capture: async captureSignal => {
          const captured = await captureDisplay(display.id, captureSignal);
          const images = await prepareImages(captured, [], captureSignal);
          return { image: images.overview, display: captured.display };
        },
        generate: async (prompt, image, generateSignal) => (await generateText({
          model: getModel(model.provider, model.id, { getKey: () => key }), maxRetries: 0, maxOutputTokens: 1000, abortSignal: generateSignal,
          providerOptions: providerOptionsFor(model),
          messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image', image, mediaType: 'image/jpeg' }] }],
        })).text,
      });
      this.deps.log('guide:vision', { ok: !!found, durationMs: performance.now() - started });
      if (!found) return null;
      // Verify against the accessibility tree: snap to the real control under the proposed box.
      const element = snapshot ? snapToElement(found.rect, snapshot.elements, step) : null;
      if (snapshot) this.guidedProcess = snapshot.window.process;
      const rect = element?.rect ?? found.rect;
      return { rect, display: found.display.bounds, source: 'vision', verified: !!element, nearby: snapshot ? neighbours(snapshot.elements, rect) : [] };
    } catch {
      options.signal.throwIfAborted();
      this.deps.log('guide:vision', { ok: false, durationMs: performance.now() - started, code: 'EVISION' });
      return null;
    }
  }
  /**
   * Development only: tour up to three menus or tabs of the foreground window. Exercises the sidecar,
   * pointing, and click tracking without a model. Menus and tabs navigate; they never change documents.
   */
  async demo(): Promise<boolean> {
    const snapshot = await this.uia.snapshot();
    if (!snapshot) return false;
    const names = new Set<string>();
    const steps = snapshot.elements.filter(e => (e.role === 'MenuItem' || e.role === 'TabItem') && e.enabled && e.name.trim() && !/^(system|close|minimize|maximize|restore)$/i.test(e.name)
      && !names.has(e.name) && !!names.add(e.name)).slice(0, 3)
      .map((e): GuideStep => ({ instruction: `Click ${e.name}.`, target: e.name, role: e.role === 'TabItem' ? 'tab' : 'menu item' }));
    if (!steps.length) return false;
    return this.start({ goal: 'Tour this window', app: snapshot.window.process || 'this app', steps }).ok;
  }
  /** A voice utterance while a guide exists. Returns the spoken reply, or undefined to use the model. */
  command(text: string): string | undefined {
    const session = this.session; if (!session) return undefined;
    const action = classifyGuideCommand(text);
    return action === 'new-request' ? undefined : this.apply(session, action, false);
  }
  control(action: GuideAction) { const session = this.session; if (session) this.apply(session, action, true); }
  private apply(session: GuideSession, action: GuideAction, speak: boolean): string {
    switch (action) {
      case 'pause': session.pause(); return 'Okay, I’ll wait. Say “continue” when you’re ready.';
      case 'resume': return session.resume(speak);
      case 'next': return session.next(speak);
      case 'back': return session.back(speak);
      case 'repeat': return session.repeat(speak);
      case 'stop': session.stop(); return 'Okay, I’ve stopped the guide.';
    }
  }
  /** Extra system context: when to offer guides, and what the running guide is doing. */
  context(): string | undefined {
    if (!this.deps.enabled()) return undefined;
    const session = this.session;
    if (!session) return routingHints.guide;
    const v = session.view();
    return `A show_me_how guide is ${v.status === 'paused' ? 'paused' : 'running'}: "${v.goal}" in ${v.app}, step ${v.index + 1} of ${v.total}: ${v.instruction} Kite itself handles "wait", "continue", "next", "back", "repeat" and "stop". Calling show_me_how again replaces this guide.`;
  }
  pause() { this.session?.pause(); }
  relocate() { this.session?.relocate(); }
  refresh() { if (this.session) this.deps.emit(this.session.view()); }
  stop() { this.session?.stop(); }
  dispose() {
    this.stop(); this.uia.stop();
    uIOhook.removeListener('mousedown', this.mouse); uIOhook.removeListener('keydown', this.key);
  }
}
