import type { ElkNode } from 'elkjs/lib/elk-api';
import { boundaryPoint, elementBounds, fixScene, layoutScene, measure, sceneBounds, seedOf, textWidth, wrapText, type BeatInput, type ElementInput, type LessonInput, type Point } from '../board';
import { segmentHitsBox } from '../boardMetrics';
import type { BoardScript, PlayableBoardScript } from '../boardScript';
import { familyLayouts } from './families';
import { dimensions } from './families/common';
import type { ScreenBounds } from '../types';
import type { FormulaPaths } from '../boardTeaching';
export type GraphLayout = (graph: ElkNode, signal?: AbortSignal) => Promise<ElkNode>;
const center = (r: ScreenBounds): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const inside = (r: ScreenBounds, p: Point) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

/** A rectilinear visibility graph routes difficult edges around any number of shapes. */
function route(a: Point, b: Point, obstacles: ScreenBounds[]): Point[] {
  const clear = (p: Point, q: Point) => !obstacles.some(r => segmentHitsBox(p, q, r));
  if (clear(a, b)) return [a, b];
  const xs = [...new Set([a.x, b.x, ...obstacles.flatMap(r => [r.x - 24, r.x + r.width + 24])])].sort((x, y) => x - y);
  const ys = [...new Set([a.y, b.y, ...obstacles.flatMap(r => [r.y - 24, r.y + r.height + 24])])].sort((x, y) => x - y);
  for (const x of xs) { const p = { x, y: a.y }, q = { x, y: b.y }; if (clear(a, p) && clear(p, q) && clear(q, b)) return [a, p, q, b]; }
  for (const y of ys) { const p = { x: a.x, y }, q = { x: b.x, y }; if (clear(a, p) && clear(p, q) && clear(q, b)) return [a, p, q, b]; }
  const w = xs.length, start = ys.indexOf(a.y) * w + xs.indexOf(a.x), end = ys.indexOf(b.y) * w + xs.indexOf(b.x);
  const parents = new Map<number, number>([[start, -1]]), queue = [start];
  const point = (i: number) => ({ x: xs[i % w], y: ys[Math.floor(i / w)] });
  for (let at = 0; at < queue.length && !parents.has(end); at++) {
    const i = queue[at], x = i % w, y = Math.floor(i / w), p = point(i);
    for (const j of [x ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y ? i - w : -1, y < ys.length - 1 ? i + w : -1]) {
      if (j < 0 || parents.has(j)) continue; const q = point(j);
      if (clear(p, q)) { parents.set(j, i); queue.push(j); }
    }
  }
  if (!parents.has(end)) throw new Error('No clear route between board nodes.');
  const points: Point[] = []; for (let i = end; i >= 0; i = parents.get(i)) points.unshift(point(i));
  return points.filter((p, i) => !i || i === points.length - 1 || (points[i - 1].x !== p.x || p.x !== points[i + 1].x) && (points[i - 1].y !== p.y || p.y !== points[i + 1].y));
}

function graphFor(script: BoardScript): ElkNode {
  const options = { 'elk.algorithm': script.family === 'tree' && !script.nodes.some(n => n.group) ? 'mrtree' : 'layered',
    'elk.direction': script.family === 'tree' ? 'DOWN' : 'RIGHT', 'elk.edgeRouting': 'ORTHOGONAL', 'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.spacing.nodeNode': '100', 'elk.layered.spacing.nodeNodeBetweenLayers': '180', 'elk.layered.thoroughness': '1',
    'elk.layered.nodePlacement.strategy': 'SIMPLE', 'elk.padding': '[top=70,left=40,bottom=40,right=40]' };
  const children = (parent?: string): ElkNode[] => script.nodes.filter(n => n.parent === parent).map(n => {
    const header = measure(wrapText(n.label, 220, 20), 20);
    return { id: n.id, ...(!n.group ? dimensions(n) : {}), ...(n.group ? { children: children(n.id),
      labels: [{ text: n.label, ...header }], layoutOptions: { ...options, 'elk.nodeLabels.placement': '[INSIDE,H_LEFT,V_TOP]',
        'elk.padding': `[top=${header.height + 38},left=40,bottom=40,right=40]` } } : {}) }; });
  const ids = new Set(script.nodes.map(n => n.id));
  return { id: 'root', layoutOptions: options, children: children(), edges: script.edges.filter(e => ids.has(e.from) && ids.has(e.to)).map(e => ({ id: e.id,
    sources: [e.from], targets: [e.to], ...(e.label ? { labels: [{ text: e.label, width: Math.min(180, textWidth(e.label) * 16), height: 42 }] } : {}) })) };
}

/** Resolve the complete picture once. Subsequent beat deltas only reveal these exact element objects. */
export async function compileScript(input: PlayableBoardScript, options: { layout?: GraphLayout; base?: ElementInput[]; visible?: string[]; signal?: AbortSignal; formula?: (tex: string, signal?: AbortSignal) => Promise<FormulaPaths> } = {}): Promise<LessonInput> {
  if (input.version === 1) return input.lesson;
  options.signal?.throwIfAborted();
  const script = input, base = script.mode === 'add' ? options.base ?? [] : [], pinned = new Set(base.map(e => e.id));
  let elements = familyLayouts[script.family](script);
  if (script.family === 'steps') {
    elements = await Promise.all(elements.map(async e => { if (e.type !== 'formula') return e;
      try { if (!options.formula) throw new Error('Formula renderer unavailable'); const formula = await options.formula(e.label, options.signal); return { ...e, formula, width: formula.box.width * 0.03, height: formula.box.height * 0.03 }; }
      catch (error) { if (options.signal?.aborted) throw error; return { ...e, type: 'text' as const, text: e.label }; }
    }));
    const left = Math.max(180, ...elements.filter(e => e.id.endsWith('_lhs')).map(e => e.width ?? measure(wrapText(e.text ?? '', 520, 20), 20).width));
    let y = 150;
    for (const n of script.nodes) { const row = elements.filter(e => e.id === n.id || e.id === `${n.id}_lhs` || e.id === `${n.id}_eq`);
      const ascent = Math.max(0, ...row.map(e => e.formula ? -e.formula.box.y * 0.03 : 20));
      for (const e of row) { e.x = e.id.endsWith('_lhs') ? 80 + left - (e.width ?? 180) : e.id.endsWith('_eq') ? left + 110 : left + 180; e.y = e.formula ? y + ascent + e.formula.box.y * 0.03 : y; }
      const note = elements.find(e => e.id === `${n.id}_note`);
      if (note) { note.x = Math.max(...row.map(e => e.x + (e.width ?? 180))) + 60; note.y = y + ascent - 20; }
      y += Math.max(80, ...row.map(e => e.height ?? 60)) + 60;
    }
  }
  if (options.layout && ['flow', 'architecture', 'tree'].includes(script.family)) {
    let laid: ElkNode;
    try { laid = await options.layout(graphFor(script), options.signal); }
    catch (error) { if (options.signal?.aborted) throw error; elements = script.nodes.some(n => n.group) ? familyLayouts.architecture(script) : familyLayouts[script.family](script); }
    if (laid) {
    const placed = new Map<string, ScreenBounds>();
    const walk = (n: ElkNode, x = 60, y = 140) => { const px = x + (n.x ?? 0), py = y + (n.y ?? 0);
      if (n.id !== 'root') placed.set(n.id, { x: px, y: py, width: n.width, height: n.height });
      for (const child of n.children ?? []) walk(child, px, py); };
    walk(laid);
    const groups = new Set(script.nodes.filter(n => n.group).flatMap(n => [n.id, `${n.id}_heading`]));
    elements = elements.filter(e => !groups.has(e.id)).map(e => placed.has(e.id) ? { ...e, ...placed.get(e.id) } : e);
    for (const n of script.nodes.filter(n => n.group)) {
      const box = placed.get(n.id); if (!box) continue;
      // Container outlines have a separate heading rather than a label in their children's space.
      elements.unshift({ id: n.id, type: 'rectangle', ...box, color: 'gray' },
        { id: `${n.id}_heading`, type: 'text', x: box.x + 18, y: box.y + 14, width: Math.min(220, box.width - 36), text: n.label, size: 'medium' });
    }
    }
  }
  if (base.length) {
    const bounds = sceneBounds(layoutScene(base)), related = script.nodes.find(n => n.relative && pinned.has(n.relative));
    const anchor = related && layoutScene(base).find(e => e.id === related.relative), at = anchor ? elementBounds(anchor) : bounds;
    const min = sceneBounds(layoutScene(elements)) ?? { x: 60, y: 140, width: 0, height: 0 }, dx = Math.max(bounds.x + bounds.width + 120, at.x + at.width + 120) - min.x, dy = at.y - min.y;
    elements = elements.map(e => ({ ...e, ...(e.x !== undefined ? { x: e.x + dx, y: e.y + dy } : {}),
      ...(e.points ? { points: e.points.map(p => ({ x: p.x + dx, y: p.y + dy })) } : {}) }));
    if (script.family === 'sequence') {
      const participants = layoutScene([...base, ...elements]).filter(e => e.kind === 'shape');
      const bottom = Math.max(bounds.y + bounds.height, ...participants.map(p => p.box.y + p.box.height));
      elements = elements.filter(e => e.type !== 'arrow');
      script.edges.forEach((e, i) => { const a = participants.find(p => p.id === e.from), b = participants.find(p => p.id === e.to);
        if (a && b) elements.push({ id: e.id, type: 'arrow', label: e.label, points: [{ x: center(a.box).x, y: bottom + 90 * (i + 1) }, { x: center(b.box).x, y: bottom + 90 * (i + 1) }] }); });
    }
  }
  // Size and separate nodes before computing edge routes. Existing coordinates remain pinned.
  let scene = [...fixScene([...base, ...elements.filter(e => e.type !== 'arrow')], pinned), ...elements.filter(e => e.type === 'arrow')];
  const shapes = layoutScene(scene).filter(e => e.kind === 'shape');
  scene = scene.map(e => {
    if (e.type !== 'arrow' || !e.from || !e.to) return e;
    const a = shapes.find(s => s.id === e.from), b = shapes.find(s => s.id === e.to); if (!a || !b) return e;
    const start = boundaryPoint(a, center(b.box)), end = boundaryPoint(b, center(a.box));
    const obstacles = shapes.filter(s => s.id !== a.id && s.id !== b.id && !inside(s.box, start) && !inside(s.box, end)).map(s => s.box);
    const points = route(start, end, obstacles);
    // Keep the boundary anchors as waypoints; otherwise binding toward the first elbow can change the departure ray.
    return { ...e, points };
  });
  scene = fixScene(scene, new Set(scene.filter(e => e.type !== 'arrow').map(e => e.id)));
  const visible = new Set(script.mode === 'add' ? options.visible ?? base.map(e => e.id) : []);
  const byId = new Map(scene.map(e => [e.id, e])), nodes = new Map(script.nodes.map(n => [n.id, n]));
  const beats: BeatInput[] = script.beats.map((b, index) => {
    const reveal = new Set<string>();
    const include = (key: string) => { if (visible.has(key) || reveal.has(key)) return;
      const n = nodes.get(key); if (n?.parent) include(n.parent);
      reveal.add(key);
      if (byId.has(`${key}_heading`)) reveal.add(`${key}_heading`);
      if (byId.has(`${key}_lifeline`)) reveal.add(`${key}_lifeline`);
      if (['data', 'steps', 'plot'].includes(script.family)) for (const id of byId.keys()) if (id.startsWith(`${key}_`)) reveal.add(id); };
    for (const key of b.reveal) { const edge = script.edges.find(e => e.id === key); if (edge) { include(edge.from); include(edge.to); } include(key); }
    const draw = [...reveal].filter(key => !visible.has(key) && byId.has(key)).map(key => byId.get(key));
    for (const change of b.changes ?? []) {
      if (change.kind === 'value') { const e = byId.get(change.id); if (e) { const next = { ...e, ...(e.type === 'text' ? { text: change.value } : { label: change.value }) }; byId.set(e.id, next); draw.push(next); } }
      if (change.kind === 'swap') { const a = byId.get(change.a), c = byId.get(change.b); if (a && c && a.x !== undefined && c.x !== undefined) { const one = { ...a, x: c.x, y: c.y }, two = { ...c, x: a.x, y: a.y }; byId.set(a.id, one); byId.set(c.id, two); draw.push(one, two); } }
      if (change.kind === 'move') { const e = byId.get(change.id), target = byId.get(change.relative); if (e && target) { const bounds = elementBounds(layoutScene([target])[0]); const next = { ...e, x: change.side === 'right' ? bounds.x + bounds.width + 80 : bounds.x, y: change.side === 'below' ? bounds.y + bounds.height + 80 : bounds.y }; byId.set(e.id, next); draw.push(next); } }
    }
    const moved = new Set((b.changes ?? []).flatMap(c => c.kind === 'swap' ? [c.a, c.b] : c.kind === 'move' ? [c.id] : []));
    if (moved.size) for (const e of byId.values()) if (e.type === 'arrow' && (moved.has(e.from) || moved.has(e.to))) {
      const pointer = b.changes?.find(c => c.kind === 'move' && c.id === e.from && nodes.get(c.id)?.role === 'pointer');
      const next: ElementInput = { ...e, ...(pointer?.kind === 'move' ? { to: pointer.relative } : {}), points: undefined }; byId.set(e.id, next); if (visible.has(e.id)) draw.push(next);
    }
    if (!index && !base.length) draw.unshift({ id: `board_title_${seedOf(script.title)}`, type: 'text', x: 60, y: 40, text: script.title, size: 'title' });
    const finalDraw = [...new Map(draw.map(e => [e.id, e])).values()];
    finalDraw.forEach(e => visible.add(e.id)); b.erase?.forEach(key => visible.delete(key));
    return { say: b.say, draw: finalDraw, highlight: b.highlight, erase: b.erase, cues: b.cues, effects: b.effects, changes: b.changes, ask: b.ask, recap: b.recap };
  });
  return { title: script.title, mode: script.mode, beats, structure: script };
}
