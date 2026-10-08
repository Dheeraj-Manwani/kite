import { applyBeat, elementBounds, fontSizes, layoutScene, measure, textOf, textWidth, wrapText, type BeatInput, type ElementInput, type LaidElement, type LessonInput, type Point } from './board';
import { sceneMetrics, segmentHitsBox } from './boardMetrics';
import type { ScreenBounds } from './types';

/** Scene diagnostics and deterministic repairs for the coordinate lesson contract. */
export const lintScene = (inputs: ElementInput[]) => sceneMetrics(layoutScene(inputs), undefined, inputs);
const contains = (a: ScreenBounds, b: ScreenBounds) => b.x >= a.x && b.y >= a.y && b.x + b.width <= a.x + a.width && b.y + b.height <= a.y + a.height;
const intersects = (a: ScreenBounds, b: ScreenBounds) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 2 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 2;
const textBox = (e: LaidElement) => { const t = textOf(e); return t && { x: t.x, y: t.y, width: t.width, height: t.height }; };
function collides(a: LaidElement, b: LaidElement) {
  const at = textBox(a), bt = textBox(b);
  if (at && bt && intersects(at, bt)) return true;
  if (a.kind === 'shape' && b.kind === 'shape' && intersects(a.box, b.box) && !contains(a.box, b.box) && !contains(b.box, a.box)) return true;
  if (at && b.kind === 'shape' && intersects(at, b.box) && !contains(b.box, at)) return true;
  if (bt && a.kind === 'shape' && intersects(bt, a.box) && !contains(a.box, bt)) return true;
  return false;
}
/** Enlarge fixed shapes instead of splitting words or clipping their labels. */
function fitLabel(e: ElementInput): ElementInput {
  if (!['rectangle', 'ellipse', 'diamond'].includes(e.type) || !e.label) return e;
  const factor = e.type === 'ellipse' ? 1.42 : e.type === 'diamond' ? 1.9 : 1;
  const longest = Math.max(...e.label.split(/\s+/).map(w => textWidth(w) * fontSizes.medium));
  const width = Math.ceil(Math.max(e.width ?? 0, (longest + 38 + (e.icon ? 60 : 0)) * factor, 120));
  const lines = wrapText(e.label, width / factor - 36 - (e.icon ? 60 : 0), fontSizes.medium);
  const height = Math.ceil(Math.max(e.height ?? 0, (measure(lines, fontSizes.medium).height + 24) * factor, 64));
  return { ...e, width, height };
}
/** Move by the smallest clear horizontal or vertical displacement, preserving intentional containers. */
function place(e: ElementInput, placed: LaidElement[], make: (input: ElementInput) => LaidElement): ElementInput {
  const original = make(e);
  if (!placed.some(p => collides(original, p))) return e;
  const box = original.kind === 'arrow' ? textBox(original) : elementBounds(original);
  if (!box) return e;
  const offsets: Point[] = [];
  for (const p of placed) {
    const boxes = [p.kind === 'shape' ? p.box : textBox(p), textBox(p)].filter(Boolean);
    for (const b of boxes) offsets.push({ x: b.x + b.width + 16 - box.x, y: 0 }, { x: b.x - box.width - 16 - box.x, y: 0 },
      { x: 0, y: b.y + b.height + 16 - box.y }, { x: 0, y: b.y - box.height - 16 - box.y });
  }
  offsets.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
  for (const d of offsets) {
    const candidate = e.type === 'arrow' ? { ...e, labelOffset: { x: (e.labelOffset?.x ?? 0) + d.x, y: (e.labelOffset?.y ?? 0) + d.y } }
      : { ...e, x: (e.x ?? 0) + d.x, y: (e.y ?? 0) + d.y };
    if (!placed.some(p => collides(make(candidate), p))) return candidate;
  }
  return e;
}
/** Repairs return input coordinates, so streaming, model context, exports and saved replay share the same picture. */
export function fixScene(inputs: ElementInput[], pinned: ReadonlySet<string> = new Set()): ElementInput[] {
  const fixed = inputs.map(e => ({ ...fitLabel(e) }));
  const placed: LaidElement[] = [];
  const nodes = fixed.filter(e => ['rectangle', 'ellipse', 'diamond', 'text', 'formula'].includes(e.type));
  // Existing elements are placed first; new beats find free space around them.
  nodes.sort((a, b) => Number(pinned.has(b.id)) - Number(pinned.has(a.id)));
  for (const e of nodes) {
    const make = (v: ElementInput) => layoutScene([v])[0];
    const next = pinned.has(e.id) ? e : place(e, placed, make);
    Object.assign(e, next); placed.push(make(e));
  }
  // An obstructed arrow gets an elbow or a detour outside the obstacle bounds. Bindings are retained.
  const cachedNodes = [...placed];
  for (const e of fixed.filter(e => e.type === 'arrow')) {
    const make = (v: ElementInput) => layoutScene(fixed.map(input => input.id === v.id ? v : input), cachedNodes, v.id)[0];
    let arrow = make(e);
    if (arrow?.kind !== 'arrow') continue;
    const a = arrow.points[0], b = arrow.points.at(-1);
    const obstacles = placed.filter(p => p.kind === 'shape' && p.id !== e.from && p.id !== e.to
      && !contains(p.box, { ...a, width: 0, height: 0 }) && !contains(p.box, { ...b, width: 0, height: 0 }));
    const clear = (v: LaidElement) => v.kind === 'arrow' && !obstacles.some(p => p.kind === 'shape' && v.points.slice(1).some((q, i) => segmentHitsBox(v.points[i], q, p.box)));
    if (!clear(arrow) && obstacles.length) {
      const boxes = obstacles.map(elementBounds), left = Math.min(...boxes.map(r => r.x)) - 24, right = Math.max(...boxes.map(r => r.x + r.width)) + 24;
      const top = Math.min(...boxes.map(r => r.y)) - 24, bottom = Math.max(...boxes.map(r => r.y + r.height)) + 24;
      const routes = [[{ x: a.x, y: b.y }], [{ x: b.x, y: a.y }],
        ...[top, bottom].map(y => [{ x: a.x, y }, { x: b.x, y }]), ...[left, right].map(x => [{ x, y: a.y }, { x, y: b.y }])];
      for (const route of routes) {
        const candidate = { ...e, points: e.from && e.to ? route : [a, ...route, b] };
        const drawn = make(candidate);
        if (drawn && clear(drawn)) { Object.assign(e, candidate); arrow = drawn; break; }
      }
    }
    if (e.label) {
      Object.assign(e, place(e, placed, make));
      placed.push(make(e));
    }
  }
  // Free text lying on lines remains in place, with a paper halo behind its glyphs.
  const scene = layoutScene(fixed), issues = sceneMetrics(scene, undefined, fixed).issues;
  for (const issue of issues.filter(i => i.kind === 'textOnLine')) {
    const e = fixed.find(v => v.id === issue.ids[0]); if (e) e.halo = true;
  }
  return fixed;
}
/** Each beat keeps the previous picture pinned; only repaired/new elements are emitted in its draw list. */
export function repairBeats(beats: BeatInput[], base: ElementInput[] = []): BeatInput[] {
  let scene = base;
  return beats.map(beat => {
    const before = new Map(scene.map(e => [e.id, e]));
    const authored = applyBeat(scene, beat), redraw = new Set((beat.draw ?? []).map(e => e.id));
    const pinned = new Set(scene.filter(e => !redraw.has(e.id)).map(e => e.id));
    scene = fixScene(authored, pinned);
    const draw = scene.filter(e => redraw.has(e.id) || JSON.stringify(e) !== JSON.stringify(before.get(e.id)));
    return { ...beat, draw };
  });
}
export const repairLesson = (lesson: LessonInput, base: ElementInput[] = []): LessonInput => ({ ...lesson, beats: repairBeats(lesson.beats, base) });
