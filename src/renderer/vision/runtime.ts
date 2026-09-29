import type { CursorPoint } from '../../shared/types';
import type { Stroke } from '../../shared/vision';
export const visionRuntime = { id: 0, drawing: false, strokes: [] as Stroke[], pen: null as CursorPoint | null,
  target: null as CursorPoint | null, blinkUntil: 0, glanceUntil: 0 };
export function submittedStrokes(id: number) { return id === visionRuntime.id ? visionRuntime.strokes.map(s => s.map(p => ({ ...p }))) : []; }
