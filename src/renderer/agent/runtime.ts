import type { CursorPoint } from '../../shared/types';
/** Overlay-local pointing inputs for a running task, read by the kite's frame loop; never React state. */
export const taskRuntime = { anchor: null as CursorPoint | null, aim: null as CursorPoint | null,
  /** Hands-off is on (the mode, or a job started hands-off): the kite wears its marker. */
  handsOff: false };
