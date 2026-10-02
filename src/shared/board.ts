import type { ScreenBounds } from './types';
/**
 * Whiteboard model shared by main (layout, context for the model) and the overlay (drawing).
 * Coordinates are board units on a 1600 × 900 canvas; the overlay zooms the board to fit.
 * Everything here is pure and deterministic so both processes agree on every shape.
 */
export const canvas = { width: 1600, height: 900 };
/** Excalidraw's open-color palette: a stroke and a matching pastel fill. */
export const boardColors = {
  black: { stroke: '#1e1e1e', fill: '#ced4da' },
  gray: { stroke: '#868e96', fill: '#e9ecef' },
  red: { stroke: '#e03131', fill: '#ffc9c9' },
  orange: { stroke: '#f08c00', fill: '#ffec99' },
  green: { stroke: '#2f9e44', fill: '#b2f2bb' },
  teal: { stroke: '#0c8599', fill: '#96f2d7' },
  blue: { stroke: '#1971c2', fill: '#a5d8ff' },
  purple: { stroke: '#9c36b5', fill: '#eebefa' },
} as const;
export type BoardColor = keyof typeof boardColors;
export const boardColorNames = Object.keys(boardColors) as BoardColor[];
export const shapeKinds = ['rectangle', 'ellipse', 'diamond'] as const;
export type ShapeKind = typeof shapeKinds[number];
export const elementTypes = [...shapeKinds, 'text', 'arrow', 'line'] as const;
export type ElementType = typeof elementTypes[number];
export const fills = ['none', 'hachure', 'solid'] as const;
export type BoardFill = typeof fills[number];
export const textSizes = ['small', 'medium', 'large', 'title'] as const;
export type TextSize = typeof textSizes[number];
export type Point = { x: number; y: number };

/** One model-authored element. Which fields matter depends on `type` (see the tool schema). */
export interface ElementInput {
  id: string; type: ElementType;
  x?: number; y?: number; width?: number; height?: number;
  label?: string; text?: string; size?: TextSize; align?: 'left' | 'center';
  color?: BoardColor; fill?: BoardFill;
  from?: string; to?: string; points?: Point[]; dashed?: boolean; heads?: 'end' | 'both' | 'none';
}
export interface BeatInput { say: string; draw?: ElementInput[]; highlight?: string[]; erase?: string[] }
export interface LessonInput { title: string; mode?: 'new' | 'add'; beats: BeatInput[] }
export const boardLimits = { beats: 16, perBeat: 24, elements: 200 };

export interface TextBlock { lines: string[]; size: number; x: number; y: number; width: number; height: number; align: 'left' | 'center' }
interface Laid { id: string; color: BoardColor; seed: number }
export interface LaidShape extends Laid { kind: 'shape'; shape: ShapeKind; box: ScreenBounds; label: TextBlock | null; fill: BoardFill }
export interface LaidText extends Laid { kind: 'text'; box: ScreenBounds; text: TextBlock }
export interface LaidArrow extends Laid { kind: 'arrow'; points: Point[]; label: TextBlock | null; dashed: boolean; heads: 'end' | 'both' | 'none'; from?: string; to?: string }
export interface LaidLine extends Laid { kind: 'line'; points: Point[]; dashed: boolean }
export type LaidElement = LaidShape | LaidText | LaidArrow | LaidLine;

// Text metrics for the handwriting stack (Ink Free, Segoe Print): generous so labels fit their shapes.
export const fontSizes: Record<TextSize, number> = { small: 16, medium: 20, large: 28, title: 38 };
export const charWidth = 0.56, lineHeight = 1.3;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const coord = (v: number | undefined, fallback = 0) => clamp(Number.isFinite(v) ? v : fallback, -2000, 6000);

/** Greedy word wrap by estimated width. Explicit newlines are kept; long words are split. */
export function wrapText(text: string, maxWidth: number, size: number): string[] {
  const max = Math.max(4, Math.floor(maxWidth / (size * charWidth)));
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r/g, '').split('\n')) {
    let line = '';
    for (let word of paragraph.split(/\s+/).filter(Boolean)) {
      while (word.length > max) {
        if (line) { lines.push(line); line = ''; }
        lines.push(word.slice(0, max)); word = word.slice(max);
      }
      if (!word) continue;
      if (!line) line = word;
      else if (line.length + 1 + word.length <= max) line += ' ' + word;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  while (lines.length > 1 && !lines.at(-1)) lines.pop();
  return lines;
}
export function measure(lines: string[], size: number) {
  return { width: Math.max(0, ...lines.map(l => l.length)) * size * charWidth, height: lines.length * size * lineHeight };
}
/** FNV-1a: an element keeps its wobble while it is redrawn or moved. */
export function seedOf(id: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
// The label box inscribed in each outline, relative to the outline size.
const inscribe: Record<ShapeKind, number> = { rectangle: 1, ellipse: 1.42, diamond: 1.9 };
const minimum: Record<ShapeKind, [number, number]> = { rectangle: [120, 64], ellipse: [130, 84], diamond: [150, 104] };
function layoutShape(e: ElementInput): LaidShape {
  const shape = e.type as ShapeKind, size = fontSizes.medium, factor = inscribe[shape], padX = 18, padY = 12;
  const inner = e.width !== undefined ? Math.max(40, e.width / factor - padX * 2) : 220;
  const lines = e.label ? wrapText(e.label, inner, size) : [];
  const m = measure(lines, size);
  const width = clamp(e.width ?? Math.max(minimum[shape][0], (m.width + padX * 2) * factor), 16, 3000);
  const height = clamp(e.height ?? Math.max(minimum[shape][1], (m.height + padY * 2) * factor), 16, 3000);
  const box = { x: coord(e.x), y: coord(e.y), width, height };
  const label = lines.length ? { lines, size, x: box.x + width / 2 - m.width / 2, y: box.y + height / 2 - m.height / 2, width: m.width, height: m.height, align: 'center' as const } : null;
  return { id: e.id, kind: 'shape', shape, box, label, fill: e.fill ?? 'none', color: e.color ?? 'black', seed: seedOf(e.id) };
}
function layoutText(e: ElementInput): LaidText {
  const size = fontSizes[e.size ?? 'medium'], align = e.align ?? 'left';
  const lines = wrapText(e.text ?? e.label ?? '', e.width ?? (e.size === 'title' ? 1400 : 520), size);
  const m = measure(lines, size), x = coord(e.x), y = coord(e.y);
  const left = align === 'center' ? x - m.width / 2 : x;
  const text = { lines, size, x: left, y, width: m.width, height: m.height, align };
  return { id: e.id, kind: 'text', box: { x: left, y, width: m.width, height: m.height }, text, color: e.color ?? 'black', seed: seedOf(e.id) };
}
const center = (r: ScreenBounds): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
/** Where a ray from the shape's centre toward `toward` leaves its outline, plus a small gap. */
export function boundaryPoint(shape: Pick<LaidShape, 'shape' | 'box'>, toward: Point, gap = 8): Point {
  const c = center(shape.box), dx = toward.x - c.x, dy = toward.y - c.y, hw = shape.box.width / 2, hh = shape.box.height / 2;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return c;
  const t = shape.shape === 'ellipse' ? 1 / Math.hypot(dx / hw, dy / hh)
    : shape.shape === 'diamond' ? 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh)
      : Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  const along = Math.min(length, t * length + gap);
  return { x: c.x + dx / length * along, y: c.y + dy / length * along };
}
export function pathLength(points: Point[]) { let n = 0; for (let i = 1; i < points.length; i++) n += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y); return n; }
/** Point at a fraction of a polyline's length, with the local direction. */
export function pointAlong(points: Point[], fraction: number): { point: Point; angle: number } {
  const total = pathLength(points); let remaining = clamp(fraction, 0, 1) * total;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], segment = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= segment || i === points.length - 1) {
      const t = segment ? Math.min(1, remaining / segment) : 0;
      return { point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    remaining -= segment;
  }
  return { point: points[0] ?? { x: 0, y: 0 }, angle: 0 };
}
/** An arrow's place among several joining the same two elements: its perpendicular offset and where its label sits. */
interface Slot { offset: number; along: number }
function layoutArrow(e: ElementInput, shapes: Map<string, LaidShape | LaidText>, slot: Slot): LaidArrow | null {
  const from = e.from ? shapes.get(e.from) : undefined, to = e.to ? shapes.get(e.to) : undefined;
  const waypoints = (e.points ?? []).map(p => ({ x: coord(p.x), y: coord(p.y) }));
  const outline = (target: LaidShape | LaidText) => target.kind === 'shape' ? target : { shape: 'rectangle' as const, box: target.box };
  let points: Point[];
  if (from && to && from !== to) {
    points = [boundaryPoint(outline(from), waypoints[0] ?? center(to.box)), ...waypoints, boundaryPoint(outline(to), waypoints.at(-1) ?? center(from.box))];
  } else if (from && waypoints.length) points = [boundaryPoint(outline(from), waypoints[0]), ...waypoints];
  else if (to && waypoints.length) points = [...waypoints, boundaryPoint(outline(to), waypoints.at(-1))];
  else points = waypoints;
  if (points.length < 2 || pathLength(points) < 4) return null;
  if (slot.offset && points.length === 2 && from && to) {
    // Parallel arrows between the same pair (a request and its reply) sit side by side, but never leave their boxes.
    const [a, b] = points, length = Math.hypot(b.x - a.x, b.y - a.y), ux = -(b.y - a.y) / length, uy = (b.x - a.x) / length;
    const extent = (box: ScreenBounds) => Math.abs(ux) * box.width / 2 + Math.abs(uy) * box.height / 2;
    const room = Math.max(0, Math.min(extent(from.box), extent(to.box)) - 8), offset = Math.max(-room, Math.min(room, slot.offset));
    points = [{ x: a.x + ux * offset, y: a.y + uy * offset }, { x: b.x + ux * offset, y: b.y + uy * offset }];
  }
  let label: TextBlock | null = null;
  if (e.label) {
    const size = fontSizes.small, lines = wrapText(e.label, 180, size), m = measure(lines, size);
    const { point, angle } = pointAlong(points, slot.along);
    // Beside the shaft, never on it: move along the normal (the upper side, or the right of a vertical arrow)
    // just far enough for the label's box to clear the line at any angle.
    let nx = -Math.sin(angle), ny = Math.cos(angle);
    if (ny > 1e-6 || (Math.abs(ny) <= 1e-6 && nx < 0)) { nx = -nx; ny = -ny; }
    if (Math.abs(ny) < 0.2) { nx = Math.abs(nx); ny = 0; }
    const clear = Math.abs(nx) * m.width / 2 + Math.abs(ny) * m.height / 2 + 6;
    label = { lines, size, x: point.x + nx * clear - m.width / 2, y: point.y + ny * clear - m.height / 2, width: m.width, height: m.height, align: 'center' };
  }
  return { id: e.id, kind: 'arrow', points, label, dashed: !!e.dashed, heads: e.heads ?? 'end', color: e.color ?? 'black', seed: seedOf(e.id),
    ...(from ? { from: e.from } : {}), ...(to ? { to: e.to } : {}) };
}
/** Lay out a whole scene in input order. Arrows bind to shapes wherever they are; broken references are dropped. */
export function layoutScene(inputs: ElementInput[]): LaidElement[] {
  const placed = new Map<string, LaidShape | LaidText>();
  for (const e of inputs) {
    if ((shapeKinds as readonly string[]).includes(e.type)) placed.set(e.id, layoutShape(e));
    else if (e.type === 'text' && (e.text ?? e.label)) placed.set(e.id, layoutText(e));
  }
  const pairs = new Map<string, string[]>();
  for (const e of inputs) if (e.type === 'arrow' && e.from && e.to && e.from !== e.to && !e.points?.length) {
    const key = [e.from, e.to].sort().join('\u0000'); pairs.set(key, [...(pairs.get(key) ?? []), e.id]);
  }
  const byId = new Map(inputs.map(e => [e.id, e]));
  const slotOf = (e: ElementInput): Slot => {
    if (e.type !== 'arrow' || !e.from || !e.to || e.points?.length) return { offset: 0, along: 0.5 };
    const group = pairs.get([e.from, e.to].sort().join('\u0000')) ?? [];
    if (group.length < 2) return { offset: 0, along: 0.5 };
    // One geometric frame for either direction: flip when the arrow runs "backwards". Labelled groups spread
    // wider, and their labels are staggered along the shaft so they never stack.
    const sign = e.from < e.to ? 1 : -1, k = group.indexOf(e.id) - (group.length - 1) / 2;
    const spacing = group.some(id => byId.get(id)?.label) ? 28 : 18, along = Math.max(0.22, Math.min(0.78, 0.5 + k * 0.22));
    return { offset: k * spacing * sign, along: sign > 0 ? along : 1 - along };
  };
  const out: LaidElement[] = [];
  for (const e of inputs) {
    const laid = placed.get(e.id);
    if (laid && (e.type === 'text' || (shapeKinds as readonly string[]).includes(e.type))) out.push(laid);
    else if (e.type === 'arrow') { const arrow = layoutArrow(e, placed, slotOf(e)); if (arrow) out.push(arrow); }
    else if (e.type === 'line') {
      const points = (e.points ?? []).map(p => ({ x: coord(p.x), y: coord(p.y) }));
      if (points.length >= 2) out.push({ id: e.id, kind: 'line', points, dashed: !!e.dashed, color: e.color ?? 'black', seed: seedOf(e.id) });
    }
  }
  return out;
}
/** Apply one beat: `draw` adds or replaces by id (keeping first-drawn order), then `erase` removes. */
export function applyBeat(inputs: ElementInput[], beat: Pick<BeatInput, 'draw' | 'erase'>): ElementInput[] {
  const next = [...inputs];
  for (const e of beat.draw ?? []) {
    const index = next.findIndex(n => n.id === e.id);
    if (index >= 0) next[index] = e; else next.push(e);
  }
  const erase = new Set(beat.erase ?? []);
  // Arrows bound to an erased element go with it.
  return next.filter(e => !erase.has(e.id) && !(e.type === 'arrow' && ((e.from && erase.has(e.from)) || (e.to && erase.has(e.to))))).slice(0, boardLimits.elements);
}
export function elementBounds(e: LaidElement): ScreenBounds {
  if (e.kind === 'shape' || e.kind === 'text') return e.box;
  const xs = e.points.map(p => p.x), ys = e.points.map(p => p.y);
  if (e.kind === 'arrow' && e.label) { xs.push(e.label.x, e.label.x + e.label.width); ys.push(e.label.y, e.label.y + e.label.height); }
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
export function sceneBounds(elements: LaidElement[]): ScreenBounds | null {
  if (!elements.length) return null;
  const boxes = elements.map(elementBounds);
  const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
  return { x, y, width: Math.max(...boxes.map(b => b.x + b.width)) - x, height: Math.max(...boxes.map(b => b.y + b.height)) - y };
}
/** The board panel's chrome (header and caption footer) in screen px. */
export const panelChrome = { header: 46, footer: 58 };
/** Default panel size on a display: what a new lesson opens at. */
export function panelSize(display: { width: number; height: number }) {
  return { width: Math.round(Math.min(1180, display.width * 0.74)), height: Math.round(Math.min(760, display.height * 0.78)) };
}
/** The drawing area inside a panel of this size. */
export function panelViewport(panel: { width: number; height: number }) {
  return { width: panel.width, height: Math.max(80, panel.height - panelChrome.header - panelChrome.footer) };
}
/**
 * The camera: board units shown in a viewport, always including the full canvas so early beats do not
 * zoom in wildly, and growing to include anything drawn outside it.
 */
export function fitView(content: ScreenBounds | null, viewport: { width: number; height: number }, padding = 40) {
  const x0 = Math.min(0, content?.x ?? 0) - padding, y0 = Math.min(0, content?.y ?? 0) - padding;
  const x1 = Math.max(canvas.width, content ? content.x + content.width : 0) + padding, y1 = Math.max(canvas.height, content ? content.y + content.height : 0) + padding;
  const scale = Math.min(viewport.width / (x1 - x0), viewport.height / (y1 - y0));
  // Centre the region in the viewport.
  return { scale, x: x0 - (viewport.width / scale - (x1 - x0)) / 2, y: y0 - (viewport.height / scale - (y1 - y0)) / 2 };
}
const quote = (s: string) => `"${s.replace(/\s+/g, ' ').slice(0, 60)}"`;
const round = (n: number) => Math.round(n);
/** Compact scene description for the model: ids, kinds, labels and geometry. Board text is app-authored by the model, not the screen. */
export function describeScene(elements: LaidElement[], limit = 60) {
  const lines = elements.slice(0, limit).map(e => {
    const color = e.color === 'black' ? '' : ` ${e.color}`;
    if (e.kind === 'shape') return `- ${e.id}: ${e.shape}${color}${e.label ? ' ' + quote(e.label.lines.join(' ')) : ''} at x=${round(e.box.x)} y=${round(e.box.y)} w=${round(e.box.width)} h=${round(e.box.height)}`;
    if (e.kind === 'text') return `- ${e.id}: text${color} ${quote(e.text.lines.join(' '))} at x=${round(e.box.x)} y=${round(e.box.y)}`;
    if (e.kind === 'arrow') return `- ${e.id}: arrow${color}${e.from && e.to ? ` ${e.from} → ${e.to}` : ` from (${round(e.points[0].x)},${round(e.points[0].y)}) to (${round(e.points.at(-1).x)},${round(e.points.at(-1).y)})`}${e.label ? ' ' + quote(e.label.lines.join(' ')) : ''}${e.dashed ? ' dashed' : ''}`;
    return `- ${e.id}: line${color} from (${round(e.points[0].x)},${round(e.points[0].y)}) to (${round(e.points.at(-1).x)},${round(e.points.at(-1).y)})`;
  });
  if (elements.length > limit) lines.push(`- …and ${elements.length - limit} more`);
  return lines.join('\n');
}
const intersects = (a: ScreenBounds, b: ScreenBounds) => a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;
/** Elements under a user's mark (board units), topmost (latest) first. */
export function elementsAt(elements: LaidElement[], region: ScreenBounds, slack = 10) {
  const r = { x: region.x - slack, y: region.y - slack, width: region.width + slack * 2, height: region.height + slack * 2 };
  return elements.filter(e => intersects(elementBounds(e), r)).reverse();
}
export function markLabel(e: LaidElement) {
  const text = e.kind === 'shape' ? e.label?.lines.join(' ') : e.kind === 'text' ? e.text.lines.join(' ') : e.kind === 'arrow' ? e.label?.lines.join(' ') : '';
  return `${e.id} (${e.kind === 'shape' ? e.shape : e.kind}${text ? ' ' + quote(text) : ''})`;
}

/** Spoken pacing: about 2.6 words a second at 1×. Voice off: time to read the caption. */
export const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
export const speechMs = (text: string, speed = 1) => Math.round(500 + words(text) / (2.6 * speed) * 1000);
export const readingMs = (text: string) => Math.max(1800, 700 + words(text) * 330);

export type BoardStatus = 'playing' | 'paused' | 'done';
/** Everything the overlay needs to draw one board frame. */
export interface BoardView {
  id: number; title: string; status: BoardStatus;
  beat: number; total: number; caption: string;
  /** What is on the board now: through the current beat once its drawing has started, else through the previous one. */
  elements: LaidElement[];
  /** Elements to animate in now. `key` changes whenever the same beat is drawn again. */
  drawing: { key: number; beat: number; ids: string[]; durationMs: number } | null;
  highlight: string[];
  /** A prompt shown instead of the caption, e.g. while paused. */
  note: string | null;
  /** Numbers about how this lesson was made (dev panel); never lesson content. */
  stats?: LessonStats;
}
export interface LessonStats {
  /** From the model request to the first stroke on the board. */
  firstStrokeMs?: number;
  /** Output tokens of the model calls that wrote the lesson, including rejected attempts. */
  outputTokens?: number;
  /** Lesson calls rejected as invalid before this one. */
  repairs: number;
  beats: number; elements: number;
  lint: { overlaps: number; overflow: number; through: number; crossings: number; textOnLines: number; minTextPx: number | null };
}
export const boardActions = ['pause', 'resume', 'next', 'repeat', 'replay', 'close'] as const;
export type BoardAction = typeof boardActions[number];
/** Deterministic: only short, exact phrases control a lesson; anything else goes to the model. */
export function classifyBoardCommand(text: string): BoardAction | 'new-request' {
  const s = text.toLowerCase().trim().replace(/’/g, "'").replace(/[.!?,]+/g, '').replace(/\s+/g, ' ').replace(/^(ok|okay|kite|hey kite) /, '').replace(/ please$/, '');
  if (/^(wait|hold on|hang on|pause|pause (it|the lesson|the board)|one sec(ond)?|just a (sec|second|moment|minute))$/.test(s)) return 'pause';
  if (/^(continue|resume|go on|keep going|carry on|i'm ready|ready|let's continue|continue the lesson|go ahead)$/.test(s)) return 'resume';
  if (/^(next|next part|next step|skip|skip (it|this|that)|move on)$/.test(s)) return 'next';
  if (/^(repeat|repeat that|say (that|it) again|again|come again|what was that)$/.test(s)) return 'repeat';
  if (/^(replay|start over|from the (top|start|beginning)|replay (it|the lesson)|draw it again|play it again)$/.test(s)) return 'replay';
  if (/^(close|close (it|the board|the whiteboard)|hide the (board|whiteboard)|stop|stop the lesson|that's enough|i'm done|never ?mind|done)$/.test(s)) return 'close';
  return 'new-request';
}
