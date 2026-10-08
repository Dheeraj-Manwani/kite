import type { ElementInput, Point } from './board';
export interface WordTiming { words: string[]; start: number[]; end: number[] }
export interface CueTiming { id: string; startMs: number; durationMs: number }
export type TeachingEffect = { kind: 'underline' | 'pulse' | 'dim' | 'strike'; ids: string[] }
  | { kind: 'badge'; id: string; number: number };
export type TeachingChange = { kind: 'value'; id: string; value: string }
  | { kind: 'move'; id: string; relative: string; side: 'right' | 'below' }
  | { kind: 'swap'; a: string; b: string };
export interface TeachingBeat {
  cues?: Record<string, string>; effects?: TeachingEffect[]; changes?: TeachingChange[];
  ask?: string; recap?: boolean;
}
const word = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
/** Use the audio timeline, never a wall-clock timer started by network arrival. */
export function cueTimings(elements: ElementInput[], say: string, explicit: Record<string, string> = {}, timings?: WordTiming, speed = 1): CueTiming[] {
  const spoken = say.split(/\s+/).filter(Boolean), words = (timings?.words ?? spoken).map(word);
  const starts = timings?.start ?? spoken.map((_, i) => i * 0.34 / speed);
  const estimate = Math.max(1, spoken.length * 0.34 / speed), end = timings && timings.words.length >= spoken.length ? timings.end.at(-1) : Math.max(estimate, timings?.end.at(-1) ?? 0);
  const positions = elements.map((e, i) => {
    const phrase = explicit[e.id] ?? e.label ?? e.text ?? '', tokens = phrase.split(/\s+/).map(word).filter(Boolean);
    let at = tokens.length ? words.findIndex((_, j) => tokens.every((t, k) => words[j + k] === t)) : -1;
    if (at < 0 && !explicit[e.id]) at = words.findIndex(w => tokens.some(t => t.length > 2 && t === w));
    const fallback = i * end / Math.max(1, elements.length);
    const startMs = e.id.startsWith('board_title_') ? 0 : at >= 0 && Number.isFinite(starts[at]) ? starts[at] * 1000 : fallback * 1000;
    return { id: e.id, startMs, durationMs: 0 };
  }).sort((a, b) => a.startMs - b.startMs);
  return positions.map((p, i) => ({ ...p, durationMs: Math.max(80, (positions[i + 1]?.startMs ?? end * 1000) - p.startMs) }));
}
/** Limit model-authored teaching actions before they reach playback. */
export function sanitizeTeaching(raw: Record<string, unknown>, known: Set<string>): TeachingBeat {
  const refs = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && known.has(x)).slice(0, 24) : [];
  const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
  const cues = Object.fromEntries(Object.entries(record(raw.cues)).filter(([id, value]) => known.has(id) && typeof value === 'string').map(([id, value]) => [id, String(value).slice(0, 120)]));
  const effects: TeachingEffect[] = [];
  for (const v of (Array.isArray(raw.effects) ? raw.effects : []).slice(0, 24)) {
    const e = record(v);
    if (['underline', 'pulse', 'dim', 'strike'].includes(String(e.kind))) effects.push({ kind: e.kind as 'underline', ids: refs(e.ids) });
    if (e.kind === 'badge' && known.has(String(e.id)) && Number.isInteger(e.number) && Number(e.number) > 0 && Number(e.number) <= 99) effects.push({ kind: 'badge', id: String(e.id), number: Number(e.number) });
  }
  const changes: TeachingChange[] = [];
  for (const v of (Array.isArray(raw.changes) ? raw.changes : []).slice(0, 24)) {
    const c = record(v);
    if (c.kind === 'value' && known.has(String(c.id)) && typeof c.value === 'string') changes.push({ kind: 'value', id: String(c.id), value: c.value.slice(0, 120) });
    if (c.kind === 'move' && known.has(String(c.id)) && known.has(String(c.relative)) && c.id !== c.relative) changes.push({ kind: 'move', id: String(c.id), relative: String(c.relative), side: c.side === 'below' ? 'below' : 'right' });
    if (c.kind === 'swap' && known.has(String(c.a)) && known.has(String(c.b)) && c.a !== c.b) changes.push({ kind: 'swap', a: String(c.a), b: String(c.b) });
  }
  return { ...(Object.keys(cues).length ? { cues } : {}), ...(effects.length ? { effects } : {}), ...(changes.length ? { changes } : {}),
    ...(typeof raw.ask === 'string' && raw.ask.trim() ? { ask: raw.ask.trim().slice(0, 500) } : {}), ...(raw.recap === true ? { recap: true } : {}) };
}
export interface FormulaPaths { paths: { d: string; transform: string }[]; box: { x: number; y: number; width: number; height: number } }
export interface PlotSpec { expression: string; xmin: number; xmax: number; ymin: number; ymax: number; points?: Point[]; shade?: boolean }
