import type { CursorPoint } from '../../shared/types';
/** Overlay-local pointing inputs read by the kite's frame loop; never React state. */
export const guideRuntime = { anchor: null as CursorPoint | null, aim: null as CursorPoint | null };
