import type { CursorPoint } from '../../shared/types';
/**
 * Draws one beat's elements stroke by stroke, like a hand with a marker: outlines trace along their path,
 * fills and dashed lines fade in under the pen, and text is written left to right. It runs inside the
 * kite's frame loop (no second rAF) and reports the pen nib in overlay coordinates so the kite can hold it.
 */
type Kind = 'stroke' | 'fade' | 'text';
interface Step { node: SVGGraphicsElement; kind: Kind; order: number; duration: number; length: number; element: number; box?: DOMRect; clip?: SVGRectElement | null }
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
  /** Where the nib was when the last stroke ended; the kite waits there between strokes. */
  last: CursorPoint | null = null;
  get playing() { return this.index < this.steps.length; }
  /** `groups` are the element groups to draw, in order; each holds nodes marked with data-kind and data-order. */
  play(key: number, svg: SVGSVGElement, groups: Element[], budgetMs: number, done: () => void, reduced = false) {
    this.cancel();
    this.key = key; this.svg = svg; this.done = done; this.index = 0; this.startedAt = 0; this.gapUntil = 0;
    this.steps = groups.flatMap((group, element) => [...group.querySelectorAll<SVGGraphicsElement>('[data-kind]')].map(node => {
      const kind = node.dataset.kind as Kind, order = Number(node.dataset.order ?? 0);
      // Text is written through a clip that grows over its real rendered extent.
      const box = kind === 'text' ? node.getBBox() : undefined;
      const clip = kind === 'text' ? svg.querySelector<SVGRectElement>(`#${node.dataset.clip} rect`) : undefined;
      const length = node instanceof SVGGeometryElement && kind !== 'text' ? node.getTotalLength() : (box?.width ?? 0) + 8;
      const base = kind === 'text' ? clamp((node.textContent?.length ?? 8) * 34, 160, 1100)
        : kind === 'fade' ? (node.dataset.fill ? 320 : clamp(60 + length * 0.9, 120, 900))
          : clamp(50 + length * (node.dataset.fast ? 0.45 : 0.9), node.dataset.fast ? 60 : 90, 900);
      return { node, kind, order, length, duration: base, element, box, clip };
    }).sort((a, b) => a.order - b.order));
    // Fit the drawing to about 80% of the spoken beat, without drawing absurdly fast or slow.
    const gaps = groups.length * 90, total = this.steps.reduce((n, s) => n + s.duration, 0) + gaps;
    const factor = reduced ? 0 : clamp((budgetMs * 0.8) / Math.max(1, total), 0.5, 2);
    for (const step of this.steps) { step.duration *= factor; this.hide(step); }
    if (!this.steps.length || reduced) this.complete();
  }
  private hide(step: Step) {
    const { node } = step;
    if (step.kind === 'stroke') { node.style.strokeDasharray = `${step.length} ${step.length}`; node.style.strokeDashoffset = String(step.length); }
    else if (step.kind === 'fade') node.style.opacity = '0';
    else if (step.clip && step.box) {
      step.clip.setAttribute('x', String(step.box.x - 4)); step.clip.setAttribute('y', String(step.box.y - 4));
      step.clip.setAttribute('height', String(step.box.height + 8)); step.clip.setAttribute('width', '0');
      node.setAttribute('clip-path', `url(#${node.dataset.clip})`);
    } else node.style.opacity = '0';
  }
  private reveal(step: Step) {
    const { node } = step;
    if (step.kind === 'stroke') { node.style.strokeDasharray = ''; node.style.strokeDashoffset = ''; }
    else if (step.kind === 'fade') node.style.opacity = '';
    else { node.removeAttribute('clip-path'); node.style.opacity = ''; }
  }
  private toScreen(x: number, y: number): CursorPoint | null {
    const matrix = this.svg?.getScreenCTM(); if (!matrix) return null;
    const p = new DOMPoint(x, y).matrixTransform(matrix); return { x: p.x, y: p.y };
  }
  /** Advance; returns the pen nib while a stroke is being drawn, or null between strokes and when finished. */
  tick(now: number): CursorPoint | null {
    const step = this.steps[this.index]; if (!step) return null;
    if (now < this.gapUntil) return null;
    if (!this.startedAt) this.startedAt = now;
    const t = step.duration ? clamp((now - this.startedAt) / step.duration, 0, 1) : 1, e = ease(t);
    let nib: CursorPoint | null = null;
    const { node } = step;
    if (step.kind === 'stroke') {
      node.style.strokeDashoffset = String(step.length * (1 - e));
      const p = (node as SVGGeometryElement).getPointAtLength(step.length * e); nib = this.toScreen(p.x, p.y);
    } else if (step.kind === 'fade') {
      node.style.opacity = String(e);
      if (node instanceof SVGGeometryElement && !node.dataset.fill) { const p = node.getPointAtLength(step.length * e); nib = this.toScreen(p.x, p.y); }
      else { const box = node.getBBox(); nib = this.toScreen(box.x + box.width * e, box.y + box.height * (0.2 + 0.6 * e) + Math.sin(e * 18) * 6); }
    } else if (step.box) {
      const box = step.box;
      step.clip?.setAttribute('width', String(step.length * e));
      if (!step.clip) node.style.opacity = String(e);
      nib = this.toScreen(box.x + box.width * e, box.y + box.height * 0.7 + Math.sin(e * box.width / 7) * box.height * 0.12);
    }
    if (t >= 1) {
      this.reveal(step); this.last = nib ?? this.last; this.index++; this.startedAt = 0;
      const next = this.steps[this.index];
      // A short lift between elements, as the hand moves to the next one.
      if (next && next.element !== step.element) this.gapUntil = now + 90;
      if (!next) this.complete();
    }
    return nib;
  }
  /** Show everything now and report the beat as drawn. */
  complete() {
    for (let i = this.index; i < this.steps.length; i++) this.reveal(this.steps[i]);
    this.index = this.steps.length;
    const done = this.done; this.done = undefined; done?.();
  }
  /** Show everything now without reporting (the beat was paused, skipped, or replaced). */
  cancel() {
    for (let i = this.index; i < this.steps.length; i++) this.reveal(this.steps[i]);
    this.steps = []; this.index = 0; this.done = undefined; this.key = -1;
  }
}
