import { applyBeat, boardColors, fitView, layoutScene, panelSize, panelViewport, planCamera, readableTextPx, sceneBounds, textOf, words, type Camera, type BeatInput, type ElementInput, type LaidElement, type LaidShape, type Point, type TextBlock } from './board';
import type { ScreenBounds } from './types';
/**
 * How readable and tidy a board is, as numbers: the whiteboard harness (scripts/board-eval.cjs) scores every
 * lesson with these, and the dev panel shows them per lesson. Pure and deterministic. Coordinates are board units.
 */
export interface SceneMetrics {
  elements: number;
  /** Pairs that collide: shapes overlapping without one containing the other, text on text, text across a shape's outline. */
  overlaps: number;
  /** Total area of those collisions (board units²). */
  overlapArea: number;
  /** Shape labels that do not fit inside their outline, or had a word split across lines to fit. */
  overflow: number;
  /** An arrow or line passing through a shape it does not connect (one count per edge and shape). */
  through: number;
  /** Arrows crossing other arrows. Lines are left out: lifelines and axes are crossed by design. */
  crossings: number;
  /** Text elements and arrow labels lying on an arrow or line that is not their own. */
  textOnLines: number;
  /** Text blocks: text elements and the labels of shapes and arrows. */
  textBlocks: number;
  /**
   * Smallest text on screen, in px, with the default panel on a 1080p display (null when there is no text). For a
   * scene, at the camera that shows all of it; for a lesson, at each beat's camera while that beat is explained.
   */
  minTextPx: number | null;
  /** Text blocks under 14 px on that screen. */
  smallText: number;
  /** Smallest text when the finished board is shown whole. */
  overviewTextPx: number | null;
  /** Distinct colors used. */
  colors: number;
  labelWords: { max: number; mean: number };
  /** Which elements each problem involves, for the gallery and debugging. */
  issues: { kind: 'overlap' | 'overflow' | 'through' | 'crossing' | 'textOnLine'; ids: string[] }[];
}
export interface LessonMetrics extends SceneMetrics {
  beats: number;
  /** Elements each beat draws for the first time. */
  newPerBeat: { max: number; mean: number };
}
/** The screen the harness measures for: 1080p, the default panel, today's camera. */
export const referenceDisplay = { width: 1920, height: 1080 };
export { readableTextPx };
/** Overlaps smaller than this in either direction are rounding, not collisions. */
const touch = 3;

const area = (r: ScreenBounds) => Math.max(0, r.width) * Math.max(0, r.height);
function intersection(a: ScreenBounds, b: ScreenBounds): ScreenBounds | null {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y), w = Math.min(a.x + a.width, b.x + b.width) - x, h = Math.min(a.y + a.height, b.y + b.height) - y;
  return w > touch && h > touch ? { x, y, width: w, height: h } : null;
}
const contains = (outer: ScreenBounds, inner: ScreenBounds, slack = touch) => inner.x >= outer.x - slack && inner.y >= outer.y - slack
  && inner.x + inner.width <= outer.x + outer.width + slack && inner.y + inner.height <= outer.y + outer.height + slack;
const inside = (r: ScreenBounds, p: Point) => p.x > r.x && p.x < r.x + r.width && p.y > r.y && p.y < r.y + r.height;
const shrink = (r: ScreenBounds, by: number): ScreenBounds => ({ x: r.x + by, y: r.y + by, width: Math.max(0, r.width - by * 2), height: Math.max(0, r.height - by * 2) });
const blockBox = (t: TextBlock): ScreenBounds => ({ x: t.x, y: t.y, width: t.width, height: t.height });
const segments = (points: Point[]) => points.slice(1).map((b, i) => [points[i], b] as const);
/** Liang–Barsky: does the segment enter the rectangle's interior? */
function segmentHitsBox(a: Point, b: Point, r: ScreenBounds) {
  if (r.width <= 0 || r.height <= 0) return false;
  let t0 = 0, t1 = 1; const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - r.x], [dx, r.x + r.width - a.x], [-dy, a.y - r.y], [dy, r.y + r.height - a.y]]) {
    if (p === 0) { if (q <= 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t1 - t0 > 1e-9;
}
/** A proper crossing away from both segments' ends (touching at an end or a shared box edge is not a crossing). */
function segmentsCross(a: Point, b: Point, c: Point, d: Point, margin = 6) {
  const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y }, denom = r.x * s.y - r.y * s.x;
  if (Math.abs(denom) < 1e-9) return false;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / denom, u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / denom;
  const lr = Math.hypot(r.x, r.y), ls = Math.hypot(s.x, s.y);
  return t * lr > margin && (1 - t) * lr > margin && u * ls > margin && (1 - u) * ls > margin;
}
// The label box inscribed in each outline (as in layoutShape).
const inscribe = { rectangle: 1, ellipse: 1.42, diamond: 1.9 } as const;
function labelFits(shape: LaidShape) {
  if (!shape.label) return true;
  const f = inscribe[shape.shape];
  return shape.label.width <= shape.box.width / f + touch && shape.label.height <= shape.box.height / f + touch;
}

/** A word of the label broken across lines because the shape is too narrow for it. */
function splitWord(shape: LaidShape, label: string | undefined) {
  if (!shape.label || !label) return false;
  const laid = new Set(shape.label.lines.join(' ').split(/\s+/));
  return label.split(/\s+/).filter(Boolean).some(word => !laid.has(word));
}
/** Lint a laid-out scene. `inputs` (the elements as written) lets it spot labels whose words were split. */
export function sceneMetrics(elements: LaidElement[], display = referenceDisplay, inputs: ElementInput[] = []): SceneMetrics {
  const labels = new Map(inputs.map(e => [e.id, e.label]));
  const shapes = elements.filter((e): e is LaidShape => e.kind === 'shape');
  const texts: { owner: string; box: ScreenBounds; size: number; words: number; free: boolean }[] = [];
  for (const e of elements) {
    const block = e.kind === 'text' ? e.text : e.kind === 'shape' || e.kind === 'arrow' ? e.label : null;
    // `free`: text placed by the model or beside an arrow, rather than inside its own shape.
    if (block && block.lines.some(Boolean)) texts.push({ owner: e.id, box: blockBox(block), size: block.size, words: words(block.lines.join(' ')), free: e.kind !== 'shape' });
  }
  let overlaps = 0, overlapArea = 0;
  const issues: SceneMetrics['issues'] = [];
  const collide = (hit: ScreenBounds | null, ids: string[]) => { if (hit) { overlaps++; overlapArea += area(hit); issues.push({ kind: 'overlap', ids }); } };
  for (let i = 0; i < shapes.length; i++) for (let j = i + 1; j < shapes.length; j++) {
    const a = shapes[i].box, b = shapes[j].box, hit = intersection(a, b);
    if (hit && !contains(a, b) && !contains(b, a)) collide(hit, [shapes[i].id, shapes[j].id]);
  }
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) collide(intersection(texts[i].box, texts[j].box), [texts[i].owner, texts[j].owner]);
  const byId = new Map(shapes.map(s => [s.id, s.box]));
  for (const t of texts) for (const s of shapes) {
    if (s.id === t.owner) continue;
    // A label of a shape that already collides with this one is counted once, as that shape pair.
    const own = byId.get(t.owner);
    if (own && intersection(own, s.box) && !contains(own, s.box) && !contains(s.box, own)) continue;
    const hit = intersection(t.box, s.box);
    if (hit && !contains(s.box, t.box)) collide(hit, [t.owner, s.id]);
  }
  const edges = elements.filter(e => e.kind === 'arrow' || e.kind === 'line');
  let through = 0;
  for (const edge of edges) {
    const ends = [edge.points[0], edge.points.at(-1)], bound = edge.kind === 'arrow' ? [edge.from, edge.to] : [];
    for (const s of shapes) {
      // Its own ends, and containers it starts or ends inside (a frame around a group), are not obstacles.
      if (bound.includes(s.id) || ends.some(p => inside(s.box, p))) continue;
      const core = shrink(s.box, 6);
      if (segments(edge.points).some(([a, b]) => segmentHitsBox(a, b, core))) { through++; issues.push({ kind: 'through', ids: [edge.id, s.id] }); }
    }
  }
  const arrows = edges.filter(e => e.kind === 'arrow');
  let crossings = 0;
  for (let i = 0; i < arrows.length; i++) for (let j = i + 1; j < arrows.length; j++) {
    const a = segments(arrows[i].points), b = segments(arrows[j].points);
    if (a.some(([p, q]) => b.some(([r, s]) => segmentsCross(p, q, r, s)))) { crossings++; issues.push({ kind: 'crossing', ids: [arrows[i].id, arrows[j].id] }); }
  }
  let textOnLines = 0;
  for (const t of texts.filter(t => t.free)) {
    const on = edges.find(edge => edge.id !== t.owner && segments(edge.points).some(([a, b]) => segmentHitsBox(a, b, shrink(t.box, 2))));
    if (on) { textOnLines++; issues.push({ kind: 'textOnLine', ids: [t.owner, on.id] }); }
  }
  const overflowing = shapes.filter(s => !labelFits(s) || splitWord(s, labels.get(s.id)));
  issues.push(...overflowing.map(s => ({ kind: 'overflow' as const, ids: [s.id] })));
  const camera = fitView(sceneBounds(elements), panelViewport(panelSize(display)), 40);
  const onScreen = texts.map(t => t.size * camera.scale);
  const labelWords = texts.map(t => t.words);
  return {
    elements: elements.length, overlaps, overlapArea: Math.round(overlapArea), overflow: overflowing.length,
    through, crossings, textOnLines,
    textBlocks: texts.length,
    minTextPx: smallest(onScreen), smallText: onScreen.filter(px => px < readableTextPx).length, overviewTextPx: smallest(onScreen),
    colors: new Set(elements.map(e => e.color).filter(c => c in boardColors)).size,
    labelWords: summary(labelWords), issues,
  };
}
const smallest = (px: number[]) => px.length ? Math.round(Math.min(...px) * 10) / 10 : null;
function summary(values: number[]) {
  return { max: values.length ? Math.max(...values) : 0, mean: values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10 : 0 };
}
/** Score a whole lesson as it looks when every beat has played, on top of what was already on the board. */
export function lessonMetrics(beats: BeatInput[], base: ElementInput[] = [], display = referenceDisplay): LessonMetrics {
  const seen = new Set(base.map(e => e.id));
  const fresh = beats.map(beat => (beat.draw ?? []).filter(e => !seen.has(e.id) && (seen.add(e.id), true)).length);
  const inputs = beats.reduce(applyBeat, base);
  // Each beat's words, at the camera Kite uses while saying them (planCamera, following on from the beat before).
  const viewport = panelViewport(panelSize(display)), px: number[] = [];
  let board = base, camera: Camera | null = null;
  for (const beat of beats) {
    board = applyBeat(board, beat);
    const scene = layoutScene(board), ids = new Set((beat.draw ?? []).map(e => e.id)), present = scene.filter(e => ids.has(e.id));
    camera = planCamera(scene, present.map(e => e.id), viewport, camera);
    for (const e of present) { const t = textOf(e); if (t?.lines.some(Boolean)) px.push(t.size * camera.scale); }
  }
  const scene = sceneMetrics(layoutScene(inputs), display, inputs);
  return { ...scene, minTextPx: smallest(px), smallText: px.filter(v => v < readableTextPx).length, beats: beats.length, newPerBeat: summary(fresh) };
}
