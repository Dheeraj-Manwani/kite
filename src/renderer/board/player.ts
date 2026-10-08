import type { CursorPoint } from '../../shared/types';
import type { CueTiming } from '../../shared/boardTeaching';
/**
 * Draws one beat's elements stroke by stroke, like a hand with a marker: outlines trace along their path,
 * fills and dashed lines fade in under the pen, and text is written left to right. It runs inside the
 * kite's frame loop (no second rAF) and reports the pen nib in overlay coordinates so the kite can hold it.
 */
type Kind = 'stroke' | 'fade' | 'text' | 'move' | 'erase' | 'morph';
interface Step { node: SVGGraphicsElement; kind: Kind; order: number; duration: number; length: number; element: number; box?: DOMRect; clip?: SVGRectElement | null;
  startMs?: number; targetD?: string; from?: { x: number; y: number }[]; to?: { x: number; y: number }[] }
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const ease = (t: number) => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
export class BoardPlayer {
  key = -1;
  private steps: Step[] = [];
  private index = 0;
  private startedAt = 0;
  private gapUntil = 0;
  private svg?: SVGSVGElement;
  private done?: () => void;
  private onStart?: () => void;
  private clock?: () => number;
  private beganAt = 0;
  private scheduleIds: string[] = [];
  private cue?: (id: string, expectedMs: number, actualMs: number) => void;
  private cued = new Set<number>();
  /** Where the nib was when the last stroke ended; the kite waits there between strokes. */
  last: CursorPoint | null = null;
  get playing() { return this.index < this.steps.length; }
  /** `groups` are the element groups to draw, in order; each holds nodes marked with data-kind and data-order. */
  /** `delayMs`: the beat is hidden at once and the pen starts after this (while the camera moves to it). */
  play(key: number, svg: SVGSVGElement, groups: Element[], budgetMs: number, done: () => void, reduced = false, delayMs = 0, onStart?: () => void, timing?: { cues: CueTiming[]; clock?: () => number; onCue?(id: string, expectedMs: number, actualMs: number): void }) {
    this.cancel();
    this.key = key; this.svg = svg; this.done = done; this.onStart = onStart; this.index = 0; this.startedAt = 0; this.gapUntil = delayMs ? performance.now() + delayMs : 0;
    this.clock = timing?.clock; this.beganAt = 0; this.scheduleIds = groups.map(g => g.getAttribute('data-el') ?? '');
    this.cue = timing?.onCue; this.cued.clear();
    this.steps = groups.flatMap((group, element) => [...(group.matches('[data-kind]') ? [group as SVGGraphicsElement] : []), ...group.querySelectorAll<SVGGraphicsElement>('[data-kind]')].map(node => {
      const kind = node.dataset.kind as Kind, order = Number(node.dataset.order ?? 0);
      // Text is written through a clip that grows over its real rendered extent.
      const box = kind === 'text' ? node.getBBox() : undefined;
      const clip = kind === 'text' ? svg.querySelector<SVGRectElement>(`#${node.dataset.clip} rect`) : undefined;
      const length = node instanceof SVGGeometryElement && kind !== 'text' ? node.getTotalLength() : (box?.width ?? 0) + 8;
      const base = kind === 'text' ? clamp((node.textContent?.length ?? 8) * 34, 160, 1100)
        : kind === 'fade' ? (node.dataset.fill ? 320 : clamp(60 + length * 0.9, 120, 900))
          : clamp(50 + length * (node.dataset.fast ? 0.45 : 0.9), node.dataset.fast ? 60 : 90, 900);
      const step: Step = { node, kind, order, length, duration: kind === 'move' || kind === 'morph' || kind === 'erase' ? 600 : base, element, box, clip };
      if (kind === 'morph') {
        const old = document.createElementNS('http://www.w3.org/2000/svg', 'path'); old.setAttribute('d', node.dataset.fromPath); step.targetD = node.getAttribute('d');
        const path = node as SVGPathElement, n = 64;
        step.from = Array.from({ length: n }, (_, i) => { const p = old.getPointAtLength(old.getTotalLength() * i / (n - 1)); return { x: p.x, y: p.y }; });
        step.to = Array.from({ length: n }, (_, i) => { const p = path.getPointAtLength(path.getTotalLength() * i / (n - 1)); return { x: p.x, y: p.y }; });
      }
      return step;
    }).sort((a, b) => a.order - b.order));
    // Fit the drawing to about 80% of the spoken beat, without drawing absurdly fast or slow.
    const gaps = groups.length * 90, total = this.steps.reduce((n, s) => n + s.duration, 0) + gaps;
    const factor = reduced ? 0 : clamp((budgetMs * 0.8) / Math.max(1, total), 0.5, 2);
    for (const step of this.steps) { step.duration *= factor; this.hide(step); }
    if (timing) this.updateTiming(timing.cues);
    if (!this.steps.length || reduced) this.complete();
  }
  private hide(step: Step) {
    const { node } = step;
    if (step.kind === 'move') node.setAttribute('transform', `translate(${Number(node.dataset.fromX) || 0} ${Number(node.dataset.fromY) || 0})`);
    else if (step.kind === 'morph') node.setAttribute('d', node.dataset.fromPath);
    else if (step.kind === 'erase') node.style.opacity = '1';
    else if (step.kind === 'stroke') { node.style.strokeDasharray = `${step.length} ${step.length}`; node.style.strokeDashoffset = String(step.length); }
    else if (step.kind === 'fade') node.style.opacity = '0';
    else if (step.clip && step.box) {
      step.clip.setAttribute('x', String(step.box.x - 4)); step.clip.setAttribute('y', String(step.box.y - 4));
      step.clip.setAttribute('height', String(step.box.height + 8)); step.clip.setAttribute('width', '0');
      node.setAttribute('clip-path', `url(#${node.dataset.clip})`);
    } else node.style.opacity = '0';
  }
  private reveal(step: Step) {
    const { node } = step;
    if (step.kind === 'move') node.removeAttribute('transform');
    else if (step.kind === 'morph') node.setAttribute('d', step.targetD);
    else if (step.kind === 'erase') node.style.opacity = '0';
    else if (step.kind === 'stroke') { node.style.strokeDasharray = ''; node.style.strokeDashoffset = ''; }
    else if (step.kind === 'fade') node.style.opacity = '';
    else { node.removeAttribute('clip-path'); node.style.opacity = ''; }
  }
  private toScreen(x: number, y: number, node?: SVGGraphicsElement): CursorPoint | null {
    const matrix = (node ?? this.svg)?.getScreenCTM(); if (!matrix) return null;
    const p = new DOMPoint(x, y).matrixTransform(matrix); return { x: p.x, y: p.y };
  }
  updateTiming(cues: CueTiming[]) {
    for (const [element, id] of this.scheduleIds.entries()) {
      const cue = cues.find(c => c.id === id); if (!cue) continue;
      const steps = this.steps.filter(s => s.element === element), total = steps.reduce((n, s) => n + s.duration, 0); let at = cue.startMs;
      for (const step of steps) { const duration = cue.durationMs * step.duration / Math.max(1, total); step.startMs = at; step.duration = duration; at += duration; }
    }
    const motions = this.steps.filter(s => s.kind === 'move' || s.kind === 'morph');
    const start = Math.min(...motions.map(s => s.startMs ?? 0));
    const duration = Math.min(600, Math.max(80, Math.max(0, ...cues.map(c => c.startMs + c.durationMs)) - start));
    for (const step of motions) { step.startMs = start; step.duration = duration; }
  }
  /** Advance; returns the pen nib while a stroke is being drawn, or null between strokes and when finished. */
  tick(now: number): CursorPoint | null {
    const step = this.steps[this.index]; if (!step) return null;
    if (now < this.gapUntil) return null;
    if (!this.beganAt) this.beganAt = now;
    const clock = this.clock?.(), elapsed = clock !== undefined && clock >= 0 ? clock : now - this.beganAt;
    // A swap moves both values and all bound arrows together, rather than one box into the other.
    for (const motion of this.steps.filter(s => s.kind === 'move' || s.kind === 'morph')) {
      if (elapsed < motion.startMs) continue;
      const k = ease(clamp((elapsed - motion.startMs) / motion.duration, 0, 1)), node = motion.node;
      if (!this.cued.has(motion.element)) { this.cued.add(motion.element); this.cue?.(this.scheduleIds[motion.element], motion.startMs, elapsed); }
      if (motion.kind === 'move') node.setAttribute('transform', `translate(${(Number(node.dataset.fromX) || 0) * (1 - k)} ${(Number(node.dataset.fromY) || 0) * (1 - k)})`);
      else node.setAttribute('d', 'M' + motion.from.map((p, i) => `${p.x + (motion.to[i].x - p.x) * k} ${p.y + (motion.to[i].y - p.y) * k}`).join('L'));
    }
    if (step.startMs !== undefined && elapsed < step.startMs) return null;
    if (step.startMs !== undefined && !this.cued.has(step.element)) { this.cued.add(step.element); this.cue?.(this.scheduleIds[step.element], step.startMs, elapsed); }
    const started = this.onStart; this.onStart = undefined; started?.();
    if (!this.startedAt) this.startedAt = now;
    const t = step.duration ? clamp((step.startMs !== undefined ? elapsed - step.startMs : now - this.startedAt) / step.duration, 0, 1) : 1, e = ease(t);
    let nib: CursorPoint | null = null;
    const { node } = step;
    if (step.kind === 'move') {
      node.setAttribute('transform', `translate(${(Number(node.dataset.fromX) || 0) * (1 - e)} ${(Number(node.dataset.fromY) || 0) * (1 - e)})`);
      const box = node.getBBox(); nib = this.toScreen(box.x + box.width / 2, box.y + box.height / 2, node);
    } else if (step.kind === 'morph') node.setAttribute('d', 'M' + step.from.map((p, i) => `${p.x + (step.to[i].x - p.x) * e} ${p.y + (step.to[i].y - p.y) * e}`).join('L'));
    else if (step.kind === 'erase') { node.style.opacity = String(1 - e); const box = node.getBBox(); nib = this.toScreen(box.x + box.width * e, box.y + box.height * (0.2 + 0.6 * e), node); }
    else if (step.kind === 'stroke') {
      node.style.strokeDashoffset = String(step.length * (1 - e));
      const p = (node as SVGGeometryElement).getPointAtLength(step.length * e); nib = this.toScreen(p.x, p.y, node);
    } else if (step.kind === 'fade') {
      node.style.opacity = String(e);
      if (node instanceof SVGGeometryElement && !node.dataset.fill) { const p = node.getPointAtLength(step.length * e); nib = this.toScreen(p.x, p.y, node); }
      else { const box = node.getBBox(); nib = this.toScreen(box.x + box.width * e, box.y + box.height * (0.2 + 0.6 * e) + Math.sin(e * 18) * 6, node); }
    } else if (step.box) {
      const box = step.box;
      step.clip?.setAttribute('width', String(step.length * e));
      if (!step.clip) node.style.opacity = String(e);
      nib = this.toScreen(box.x + box.width * e, box.y + box.height * 0.7 + Math.sin(e * box.width / 7) * box.height * 0.12, node);
    }
    if (t >= 1) {
      this.reveal(step); this.last = nib ?? this.last; this.index++; this.startedAt = 0;
      const next = this.steps[this.index];
      // A short lift between elements, as the hand moves to the next one.
      if (next && next.element !== step.element && next.startMs === undefined) this.gapUntil = now + 90;
      if (!next) this.complete();
      else if (step.startMs !== undefined && next.startMs !== undefined && elapsed >= next.startMs) return this.tick(now);
    }
    return nib;
  }
  /** Show everything now and report the beat as drawn. */
  complete() {
    if (this.steps.length) { const started = this.onStart; this.onStart = undefined; started?.(); }
    for (let i = this.index; i < this.steps.length; i++) this.reveal(this.steps[i]);
    this.index = this.steps.length;
    const done = this.done; this.done = undefined; done?.();
  }
  /** Show everything now without reporting (the beat was paused, skipped, or replaced). */
  cancel() {
    for (let i = this.index; i < this.steps.length; i++) this.reveal(this.steps[i]);
    this.steps = []; this.index = 0; this.done = undefined; this.onStart = undefined; this.key = -1;
  }
}
