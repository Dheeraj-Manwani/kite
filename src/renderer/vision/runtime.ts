import type { CursorPoint } from '../../shared/types';
import type { Stroke } from '../../shared/vision';
export const visionRuntime = { id: 0, drawing: false, strokes: [] as Stroke[], pen: null as CursorPoint | null,
  target: null as CursorPoint | null, glanceUntil: 0,
  /** When the latest capture began (performance.now() ms): the kite blinks like a shutter (design.md §K5.3, K-10). */
  blinkAt: -Infinity };
export function submittedStrokes(id: number) { return id === visionRuntime.id ? visionRuntime.strokes.map(s => s.map(p => ({ ...p }))) : []; }
/**
 * Split a hold's marks: strokes drawn on the whiteboard become references to its elements (the board is
 * Kite's own content, so no screenshot is needed); the rest go to vision as usual.
 */
export function splitMarks(strokes: Stroke[], hit: ((region: { x: number; y: number; width: number; height: number }) => string[]) | null,
  frame: { x: number; y: number; width: number; height: number } | null) {
  if (!hit || !frame) return { strokes, marks: [] as string[] };
  const marks: string[] = [], rest: Stroke[] = [];
  for (const stroke of strokes) {
    const xs = stroke.map(p => p.x), ys = stroke.map(p => p.y);
    const region = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    const cx = region.x + region.width / 2, cy = region.y + region.height / 2;
    if (cx >= frame.x && cx <= frame.x + frame.width && cy >= frame.y && cy <= frame.y + frame.height) marks.push(...hit(region));
    else rest.push(stroke);
  }
  return { strokes: rest, marks: [...new Set(marks)].slice(0, 8) };
}
