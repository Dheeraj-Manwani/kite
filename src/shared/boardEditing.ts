import { elementBounds, type ElementInput, type LaidElement } from './board';
export interface BoardEdits { elements: ElementInput[]; deleted: string[] }
export type BoardEdit = { type: 'move'; id: string; dx: number; dy: number } | { type: 'label'; id: string; text: string }
  | { type: 'delete'; id: string } | { type: 'add'; element: ElementInput } | { type: 'undo' } | { type: 'redo' };
export const editableId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v);
const coordinate = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 100000;
/** Only local editing operations enter the overlay; arbitrary renderer objects are never accepted. */
export function parseBoardEdit(value: unknown): BoardEdit | undefined {
  if (!value || typeof value !== 'object') return; const e = value as Record<string, unknown>;
  if (e.type === 'undo' || e.type === 'redo') return { type: e.type };
  if (e.type === 'move' && editableId(e.id) && coordinate(e.dx) && coordinate(e.dy)) return { type: 'move', id: e.id, dx: e.dx, dy: e.dy };
  if (e.type === 'label' && editableId(e.id) && typeof e.text === 'string' && e.text.length <= 500) return { type: 'label', id: e.id, text: e.text };
  if (e.type === 'delete' && editableId(e.id)) return { type: 'delete', id: e.id };
  if (e.type !== 'add' || !e.element || typeof e.element !== 'object') return;
  const n = e.element as Record<string, unknown>; if (!editableId(n.id) || !n.id.startsWith('user_')) return;
  if (n.type === 'text' && coordinate(n.x) && coordinate(n.y) && typeof n.text === 'string' && n.text.trim() && n.text.length <= 500)
    return { type: 'add', element: { id: n.id, type: 'text', x: n.x, y: n.y, text: n.text, color: 'blue', user: true } };
  if ((n.type === 'line' || n.type === 'arrow') && Array.isArray(n.points) && n.points.length >= 2 && n.points.length <= 2048
    && n.points.every(p => p && coordinate(p.x) && coordinate(p.y)))
    return { type: 'add', element: { id: n.id, type: n.type, points: n.points.map(p => ({ x: p.x, y: p.y })), color: 'blue', user: true,
      ...(n.type === 'line' ? { freehand: true } : { ...(editableId(n.from) ? { from: n.from } : {}), ...(editableId(n.to) ? { to: n.to } : {}) }) } };
}
export function moveInput(e: ElementInput, dx: number, dy: number): ElementInput {
  return { ...e, ...(e.x !== undefined ? { x: e.x + dx } : {}), ...(e.y !== undefined ? { y: e.y + dy } : {}),
    ...(e.points ? { points: e.points.map(p => ({ x: p.x + dx, y: p.y + dy })) } : {}) };
}
export function applyEdits(inputs: ElementInput[], edits: BoardEdits): ElementInput[] {
  const overrides = new Map(edits.elements.map(e => [e.id, e])), deleted = new Set(edits.deleted), known = new Set(inputs.map(e => e.id));
  return [...inputs.map(e => overrides.get(e.id) ?? e), ...edits.elements.filter(e => e.user && !known.has(e.id))]
    .filter(e => !deleted.has(e.id) && !(e.type === 'arrow' && (deleted.has(e.from) || deleted.has(e.to))))
    .map(e => e.type === 'arrow' && (overrides.has(e.from) || overrides.has(e.to)) ? rerouteInput(e) : e);
}
export function rerouteInput(e: ElementInput): ElementInput {
  if (e.type !== 'arrow') return e;
  return { ...e, points: e.from && e.to ? undefined : e.from ? e.points?.slice(-1) : e.to ? e.points?.slice(0, 1) : e.points };
}
/** Bound context size while retaining the ends of user strokes for text-only models. */
export function boardInputContext(inputs: ElementInput[]) {
  return inputs.map(e => ({ id: e.id, type: e.type, label: e.label ?? e.text, from: e.from, to: e.to, user: e.user, x: e.x, y: e.y,
    freehand: e.freehand, points: e.user && e.points ? Array.from({ length: Math.min(32, e.points.length) }, (_, i) => e.points[Math.round(i * (e.points.length - 1) / Math.max(1, Math.min(32, e.points.length) - 1))]) : undefined }));
}
/** Complete, untruncated descriptions for the accessible outline and element focus targets. */
export function boardOutline(elements: LaidElement[]) {
  const label = (e: LaidElement) => e.kind === 'text' ? e.text.lines.join(' ') : e.kind === 'shape' || e.kind === 'arrow' ? e.label?.lines.join(' ') : e.kind === 'formula' ? e.label : undefined;
  const names = new Map(elements.map(e => [e.id, label(e) || e.id]));
  return elements.map(e => { const outgoing = elements.filter(n => n.kind === 'arrow' && n.from === e.id).map(n => n.kind === 'arrow' ? names.get(n.to) ?? n.to : '');
    const incoming = elements.filter(n => n.kind === 'arrow' && n.to === e.id).map(n => n.kind === 'arrow' ? names.get(n.from) ?? n.from : '');
    const connection = e.kind === 'arrow' ? ` From ${names.get(e.from) ?? 'an unbound point'} to ${names.get(e.to) ?? 'an unbound point'}.` : `${outgoing.length ? ` Connects to ${outgoing.join(', ')}.` : ''}${incoming.length ? ` Receives from ${incoming.join(', ')}.` : ''}`;
    return { id: e.id, label: `${e.kind === 'shape' ? e.shape : e.kind}: ${label(e) || (e.kind === 'line' ? 'User stroke or diagram line' : e.id)}.${connection}`, bounds: elementBounds(e) }; });
}
