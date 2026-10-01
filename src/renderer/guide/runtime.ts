import type { CursorPoint } from '../../shared/types';
/** Overlay-local pointing inputs read by the kite's frame loop; never React state. */
/** `dim`: the kite sits over a neighbouring control's label, so it shows at 85% (design.md K-08). */
export const guideRuntime = { anchor: null as CursorPoint | null, aim: null as CursorPoint | null, dim: false };
