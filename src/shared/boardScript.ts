import type { BoardColor, LessonInput, ShapeKind } from './board';
import { sanitizeTeaching, type PlotSpec, type TeachingBeat } from './boardTeaching';

export const diagramFamilies = ['sequence', 'flow', 'architecture', 'tree', 'cycle', 'layers', 'compare', 'timeline', 'freeform', 'data', 'steps', 'plot'] as const;
export type DiagramFamily = typeof diagramFamilies[number];
export interface ScriptNode {
  id: string; label: string; icon?: string; parent?: string; group?: boolean;
  shape?: ShapeKind; relative?: string; side?: 'right' | 'below'; color?: BoardColor;
  index?: number; tex?: string; plot?: PlotSpec;
  role?: 'cell' | 'pointer';
}
export interface ScriptEdge { id: string; from: string; to: string; label?: string }
export interface ScriptBeat extends TeachingBeat { say: string; reveal: string[]; highlight?: string[]; erase?: string[] }
export interface BoardScript {
  version: 2; title: string; family: DiagramFamily; mode: 'new' | 'add';
  nodes: ScriptNode[]; edges: ScriptEdge[]; beats: ScriptBeat[];
  collection?: 'array' | 'stack' | 'queue' | 'linked-list' | 'hash';
  navigation?: 'child';
}
/** Legacy coordinates are explicitly retained; replay must never invent a different picture. */
export interface LegacyBoardScript { version: 1; family: 'legacy'; lesson: LessonInput }
export type PlayableBoardScript = BoardScript | LegacyBoardScript;
export function adaptSavedLesson(lesson: LessonInput): PlayableBoardScript {
  return lesson.structure ?? { version: 1, family: 'legacy', lesson };
}
export interface ScriptParse { script: BoardScript; fixes: string[]; ready: boolean }
const text = (v: unknown, max = 300) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const id = (v: unknown) => text(v, 40).replace(/[^a-zA-Z0-9_-]/g, '_');
const ids = (v: unknown) => Array.isArray(v) ? v.map(id).filter(Boolean) : [];
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};

/** Coordinate fields never enter the typed script. Missing references, duplicate ids and cyclic parents are repaired. */
export function sanitizeScript(value: unknown, existing: string[] = []): ScriptParse {
  const raw = record(value), fixes: string[] = [], known = new Set(existing);
  const nodes: ScriptNode[] = [], edges: ScriptEdge[] = [], local = new Set<string>();
  for (const item of (Array.isArray(raw.nodes) ? raw.nodes : []).slice(0, 60)) {
    const n = record(item), key = id(n.id);
    if (!key || local.has(key) || known.has(key)) { fixes.push('dropped duplicate or empty node'); continue; }
    local.add(key); known.add(key);
    nodes.push({ id: key, label: text(n.label, 120) || key, ...(n.group === true ? { group: true } : {}),
      ...(text(n.icon, 40) ? { icon: text(n.icon, 40) } : {}), ...(id(n.parent) ? { parent: id(n.parent) } : {}),
      ...(['rectangle', 'ellipse', 'diamond'].includes(String(n.shape)) ? { shape: n.shape as ShapeKind } : {}),
      ...(id(n.relative) ? { relative: id(n.relative), side: n.side === 'below' ? 'below' : 'right' } : {}),
      ...(Number.isInteger(n.index) && Number(n.index) >= 0 && Number(n.index) <= 99 ? { index: Number(n.index) } : {}),
      ...(n.role === 'pointer' ? { role: 'pointer' as const } : {}),
      ...(text(n.tex, 500) ? { tex: text(n.tex, 500) } : {}), ...(sanitizePlot(n.plot) ? { plot: sanitizePlot(n.plot) } : {}) });
  }
  const byId = new Map(nodes.map(n => [n.id, n]));
  for (const n of nodes) {
    if (n.parent) {
      const chain = new Set([n.id]); let p = n.parent;
      while (p && !chain.has(p)) { chain.add(p); p = byId.get(p)?.parent; }
      if (!byId.get(n.parent)?.group || p) { delete n.parent; fixes.push('dropped invalid parent'); }
    }
    if (n.relative && (!known.has(n.relative) || n.relative === n.id)) { delete n.relative; fixes.push('dropped invalid relative placement'); }
  }
  for (const item of (Array.isArray(raw.edges) ? raw.edges : []).slice(0, 100)) {
    const e = record(item), key = id(e.id), from = id(e.from), to = id(e.to);
    if (!key || known.has(key) || !known.has(from) || !known.has(to) || from === to || byId.get(from)?.group || byId.get(to)?.group) {
      fixes.push('dropped invalid edge'); continue;
    }
    known.add(key); edges.push({ id: key, from, to, ...(text(e.label, 100) ? { label: text(e.label, 100) } : {}) });
  }
  const beats: ScriptBeat[] = [];
  for (const item of (Array.isArray(raw.beats) ? raw.beats : []).slice(0, 16)) {
    const b = record(item), say = text(b.say, 1200); if (!say) { fixes.push('dropped silent beat'); continue; }
    const refs = (v: unknown) => ids(v).filter(i => { if (known.has(i)) return true; fixes.push('dropped unknown beat reference'); return false; });
    beats.push({ say, reveal: refs(b.reveal), ...(b.highlight ? { highlight: refs(b.highlight) } : {}), ...(b.erase ? { erase: refs(b.erase) } : {}), ...sanitizeTeaching(b, known) });
  }
  const family = diagramFamilies.includes(raw.family as DiagramFamily) ? raw.family as DiagramFamily : 'flow';
  if (family !== raw.family) fixes.push('defaulted diagram family');
  return { script: { version: 2, title: text(raw.title, 160), family, mode: raw.mode === 'add' ? 'add' : 'new', nodes, edges, beats,
    ...(['array', 'stack', 'queue', 'linked-list', 'hash'].includes(String(raw.collection)) ? { collection: raw.collection as BoardScript['collection'] } : {}),
    ...(raw.navigation === 'child' ? { navigation: 'child' as const } : {}) }, fixes, ready: raw.ready === true };
}
function sanitizePlot(value: unknown): PlotSpec | undefined {
  const p = record(value), expression = text(p.expression, 300), bounds = ['xmin', 'xmax', 'ymin', 'ymax'].map(k => Number(p[k]));
  if (!expression || !bounds.every(n => Number.isFinite(n) && Math.abs(n) <= 10000) || bounds[1] <= bounds[0] || bounds[3] <= bounds[2]) return;
  return { expression, xmin: bounds[0], xmax: bounds[1], ymin: bounds[2], ymax: bounds[3], shade: p.shade === true,
    points: (Array.isArray(p.points) ? p.points : []).slice(0, 20).map(record).filter(v => Number.isFinite(v.x) && Number.isFinite(v.y)).map(v => ({ x: Number(v.x), y: Number(v.y) })) };
}

/** Pipe escaping is shared by prompt examples, evaluation and the parser. No executable expressions. */
function fields(line: string): string[] {
  const out: string[] = []; let s = '', escaped = false;
  for (const c of line) {
    if (escaped) { s += c === 'n' ? '\n' : c; escaped = false; }
    else if (c === '\\') escaped = true;
    else if (c === '|') { out.push(s.trim()); s = ''; }
    else s += c;
  }
  out.push(s.trim()); return out;
}
const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, '\\n');
export function serializeScript(script: BoardScript, format: 'lines' | 'json'): string {
  if (format === 'json') { const { beats, ...structure } = script; return JSON.stringify({ ...structure, ready: true, beats }); }
  return [ ['board', script.family, script.title, script.mode, script.collection ?? '', script.navigation ?? ''],
    ...script.nodes.map(n => [n.group ? 'group' : 'node', n.id, n.label, n.icon ?? '', n.parent ?? '', n.relative ?? '', n.side ?? '', n.shape ?? '', n.tex || n.plot || n.role || n.index !== undefined ? JSON.stringify({ tex: n.tex, plot: n.plot, index: n.index, role: n.role }) : '']),
    ...script.edges.map(e => ['edge', e.id, e.from, e.to, e.label ?? '']), ['ready'],
    ...script.beats.map(b => { const { say, reveal, highlight, erase, ...extra } = b; return ['beat', reveal.join(','), say, highlight?.join(',') ?? '', erase?.join(',') ?? '', Object.keys(extra).length ? JSON.stringify(extra) : '']; })
  ].map(row => row.map(escape).join('|')).join('\n') + '\n';
}

/** Emits only newline-terminated records. The ready boundary freezes all graph geometry before the first beat. */
export class BoardScriptParser {
  private pending = '';
  private raw: { title: string; family: string; mode: string; collection?: string; navigation?: string; nodes: unknown[]; edges: unknown[]; beats: unknown[]; ready: boolean } =
    { title: '', family: '', mode: 'new', nodes: [], edges: [], beats: [], ready: false };
  private bytes = 0;
  private diagnostics: string[] = [];
  constructor(private existing: string[] = []) {}
  push(chunk: string): ScriptParse {
    this.bytes += chunk.length;
    if (this.bytes > 100_000) throw new Error('Whiteboard script exceeds 100 KB.');
    this.pending += chunk;
    const lines = this.pending.split(/\r?\n/); this.pending = lines.pop() ?? '';
    for (const line of lines) this.line(line);
    return this.snapshot();
  }
  finish(): ScriptParse { if (this.pending.trim()) this.line(this.pending); this.pending = ''; return this.snapshot(); }
  private line(line: string) {
    if (!line.trim() || line.startsWith('```')) return;
    const [kind, a, b, c, d, e, f, g, h] = fields(line);
    const meta = (s: string) => { try { return record(JSON.parse(s)); } catch { if (s) this.diagnostics.push('ignored malformed teaching metadata'); return {}; } };
    if (kind === 'board' && !this.raw.ready) { this.raw.family = a; this.raw.title = b; this.raw.mode = c || 'new'; this.raw.collection = d; this.raw.navigation = e; }
    else if ((kind === 'node' || kind === 'group') && !this.raw.ready) this.raw.nodes.push({ ...meta(h), id: a, label: b, icon: c, parent: d, relative: e, side: f, shape: g, group: kind === 'group' });
    else if (kind === 'edge' && !this.raw.ready) this.raw.edges.push({ id: a, from: b, to: c, label: d });
    else if (kind === 'ready') this.raw.ready = true;
    else if (kind === 'beat' && this.raw.ready) this.raw.beats.push({ ...meta(e), reveal: (a ?? '').split(','), say: b, ...(c ? { highlight: c.split(',') } : {}), ...(d ? { erase: d.split(',') } : {}) });
    else this.diagnostics.push('ignored malformed or out-of-order record');
    // Limit memory as well as output: a stream cannot accumulate unbounded records.
    this.raw.nodes = this.raw.nodes.slice(0, 60); this.raw.edges = this.raw.edges.slice(0, 100); this.raw.beats = this.raw.beats.slice(0, 16);
  }
  snapshot(): ScriptParse { const parsed = sanitizeScript(this.raw, this.existing); return { ...parsed, fixes: [...this.diagnostics, ...parsed.fixes] }; }
}
