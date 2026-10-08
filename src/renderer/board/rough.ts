import type { LaidElement, LaidShape, Point } from '../../shared/board';
import { boardIcons } from '../../shared/boardIcons';
import { getStroke } from 'perfect-freehand';
/**
 * Hand-drawn (Excalidraw-like) outlines, after rough.js: every straight edge is a slightly bowed cubic
 * with jittered ends, drawn twice. Each pass is one continuous path so the pen can trace it. All output is
 * deterministic for a seed, so an element keeps its wobble across re-renders and in exported images.
 */
export interface StrokePlan { d: string; role: 'outline' | 'fill' | 'head' | 'icon'; dashed?: boolean; solidFill?: boolean; ink?: boolean }
export type Rand = () => number;
export function random(seed: number): Rand {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const f = (n: number) => (Math.round(n * 10) / 10).toString();
const maxOffset = 2, bowing = 1;
/** One rough edge from a to b as a cubic Bézier. `move` starts a new subpath; `half` is the lighter overlay pass. */
export function edge(a: Point, b: Point, rand: Rand, move: boolean, half = false, roughness = 1): string {
  const lengthSq = (a.x - b.x) ** 2 + (a.y - b.y) ** 2, length = Math.sqrt(lengthSq);
  const gain = length < 200 ? 1 : length > 500 ? 0.4 : -0.0016668 * length + 1.233334;
  let offset = maxOffset;
  if (offset * offset * 100 > lengthSq) offset = length / 10;
  const amount = (half ? offset / 2 : offset);
  const jitter = (x: number) => roughness * gain * (rand() * 2 * x - x);
  const diverge = 0.2 + rand() * 0.2;
  const midX = jitter(bowing * maxOffset * (b.y - a.y) / 200), midY = jitter(bowing * maxOffset * (a.x - b.x) / 200);
  const start = move ? `M${f(a.x + jitter(amount))} ${f(a.y + jitter(amount))}` : '';
  return `${start}C${f(midX + a.x + (b.x - a.x) * diverge + jitter(amount))} ${f(midY + a.y + (b.y - a.y) * diverge + jitter(amount))} `
    + `${f(midX + a.x + 2 * (b.x - a.x) * diverge + jitter(amount))} ${f(midY + a.y + 2 * (b.y - a.y) * diverge + jitter(amount))} `
    + `${f(b.x + jitter(amount))} ${f(b.y + jitter(amount))}`;
}
/** A closed or open polyline as one continuous rough stroke. */
export function polyline(points: Point[], rand: Rand, closed: boolean, half = false): string {
  const path = closed ? [...points, points[0]] : points;
  let d = '';
  for (let i = 1; i < path.length; i++) d += edge(path[i - 1], path[i], rand, i === 1, half);
  return d;
}
/** Smooth closed-ish curve through points (Catmull-Rom as cubic Béziers). */
function curve(points: Point[]): string {
  let d = `M${f(points[0].x)} ${f(points[0].y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    d += `C${f(p1.x + (p2.x - p0.x) / 6)} ${f(p1.y + (p2.y - p0.y) / 6)} ${f(p2.x - (p3.x - p1.x) / 6)} ${f(p2.y - (p3.y - p1.y) / 6)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return d;
}
/** One loose pass around an ellipse that overshoots its start, like a quick hand-drawn circle. */
export function ellipsePass(cx: number, cy: number, rx: number, ry: number, rand: Rand, pass: number): string {
  const steps = Math.max(10, Math.min(36, Math.round(Math.PI * (rx + ry) / 28)));
  const start = -Math.PI / 2 - 0.6 + rand() * 0.5 + pass * 0.4, overshoot = 0.25 + rand() * 0.3;
  const wobble = Math.min(0.06, 6 / Math.max(rx, ry, 1));
  const points: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = start + (Math.PI * 2 + overshoot) * i / steps, r = 1 + (rand() - 0.5) * 2 * wobble + (pass ? 0.012 : 0);
    points.push({ x: cx + Math.cos(angle) * rx * r, y: cy + Math.sin(angle) * ry * r });
  }
  return curve(points);
}
export function outlinePolygon(e: Pick<LaidShape, 'shape' | 'box'>): Point[] {
  const { x, y, width: w, height: h } = e.box;
  if (e.shape === 'diamond') return [{ x: x + w / 2, y }, { x: x + w, y: y + h / 2 }, { x: x + w / 2, y: y + h }, { x, y: y + h / 2 }];
  if (e.shape === 'ellipse') return Array.from({ length: 28 }, (_, i) => ({ x: x + w / 2 + Math.cos(i / 28 * Math.PI * 2) * w / 2, y: y + h / 2 + Math.sin(i / 28 * Math.PI * 2) * h / 2 }));
  return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
}
/** Parallel hatching at -41° clipped to a convex-or-not polygon (even-odd scanlines), inset slightly. */
export function hachure(polygon: Point[], gap: number, rand: Rand, angle = -41): string {
  const cx = polygon.reduce((n, p) => n + p.x, 0) / polygon.length, cy = polygon.reduce((n, p) => n + p.y, 0) / polygon.length;
  const a = angle * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
  const rotate = (p: Point, s: number) => ({ x: cx + (p.x - cx) * cos - (p.y - cy) * sin * s, y: cy + (p.x - cx) * sin * s + (p.y - cy) * cos });
  const flat = polygon.map(p => rotate(p, -1));
  const ys = flat.map(p => p.y), top = Math.min(...ys), bottom = Math.max(...ys);
  let d = '';
  for (let y = top + gap / 2; y < bottom; y += gap) {
    const xs: number[] = [];
    for (let i = 0; i < flat.length; i++) {
      const p = flat[i], q = flat[(i + 1) % flat.length];
      if ((p.y <= y && q.y > y) || (q.y <= y && p.y > y)) xs.push(p.x + (y - p.y) / (q.y - p.y) * (q.x - p.x));
    }
    xs.sort((m, n) => m - n);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const inset = Math.min(3, (xs[i + 1] - xs[i]) / 4);
      if (xs[i + 1] - xs[i] < 4) continue;
      const from = rotate({ x: xs[i] + inset, y }, 1), to = rotate({ x: xs[i + 1] - inset, y }, 1);
      d += edge(from, to, rand, true, true, 0.7);
    }
  }
  return d;
}
function head(tip: Point, from: Point, rand: Rand, size: number): string {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x), spread = 0.46;
  const wing = (s: number) => ({ x: tip.x - Math.cos(angle + s * spread) * size, y: tip.y - Math.sin(angle + s * spread) * size });
  return edge(wing(1), tip, rand, true, true) + edge(tip, wing(-1), rand, false, true);
}
/** The neighbour a head should aim from: a point about one head-length back along the shaft. */
function behind(points: Point[], end: 'start' | 'end', distance: number): Point {
  const path = end === 'end' ? [...points].reverse() : points;
  let travelled = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], segment = Math.hypot(b.x - a.x, b.y - a.y);
    if (travelled + segment >= distance) { const t = (distance - travelled) / segment; return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
    travelled += segment;
  }
  return path.at(-1);
}
/** Strokes in drawing order: outline passes, then fill, then arrowheads. Text is rendered separately. */
export function elementStrokes(e: LaidElement): StrokePlan[] {
  if (e.kind === 'line' && e.freehand) { const outline = getStroke(e.points.map(p => [p.x, p.y]), { size: 4, thinning: .4, smoothing: .5, simulatePressure: true });
    return outline.length ? [{ d: `M${outline.map(p => p.join(',')).join('L')}Z`, role: 'fill', solidFill: true, ink: true }] : []; }
  const rand = random(e.seed);
  if (e.kind === 'text' || e.kind === 'formula') return [];
  if (e.kind === 'shape') {
    const { x, y, width: w, height: h } = e.box, out: StrokePlan[] = [];
    if (e.shape === 'ellipse') out.push({ d: ellipsePass(x + w / 2, y + h / 2, w / 2, h / 2, rand, 0), role: 'outline' }, { d: ellipsePass(x + w / 2, y + h / 2, w / 2, h / 2, rand, 1), role: 'outline' });
    else { const polygon = outlinePolygon(e); out.push({ d: polyline(polygon, rand, true), role: 'outline' }, { d: polyline(polygon, rand, true, true), role: 'outline' }); }
    if (e.fill === 'hachure') out.push({ d: hachure(outlinePolygon(e), 8, rand), role: 'fill' });
    if (e.fill === 'solid') out.push({ d: e.shape === 'ellipse' ? ellipsePass(x + w / 2, y + h / 2, w / 2 - 1, h / 2 - 1, rand, 0) + 'Z' : polyline(outlinePolygon(e), rand, true, true) + 'Z', role: 'fill', solidFill: true });
    const factor = e.shape === 'ellipse' ? 1.42 : e.shape === 'diamond' ? 1.9 : 1;
    if (e.icon && boardIcons[e.icon]) for (const path of boardIcons[e.icon]) out.push({ role: 'icon',
      d: 'M' + path.map(p => `${f(x + (w - w / factor) / 2 + 16 + p.x * 1.5)} ${f(y + h / 2 - 18 + p.y * 1.5)}`).join('L') });
    return out;
  }
  const points = e.points, dashed = e.dashed;
  if (e.kind === 'line' && e.fill === 'solid') return [{ d: polyline(points, rand, true) + 'Z', role: 'fill', solidFill: true }];
  const out: StrokePlan[] = [{ d: polyline(points, rand, false), role: 'outline', dashed }];
  // Single straight shafts get the second, lighter pass that makes Excalidraw lines look inked.
  if (points.length === 2 && !dashed) out.push({ d: polyline(points, rand, false, true), role: 'outline' });
  if (e.kind === 'arrow') {
    const length = points.reduce((n, p, i) => i ? n + Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) : 0, 0);
    const size = Math.max(8, Math.min(18, length * 0.3));
    if (e.heads !== 'none') out.push({ d: head(points.at(-1), behind(points, 'end', size), rand, size), role: 'head' });
    if (e.heads === 'both') out.push({ d: head(points[0], behind(points, 'start', size), rand, size), role: 'head' });
  }
  return out;
}
