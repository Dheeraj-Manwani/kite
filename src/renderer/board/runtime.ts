import type { CursorPoint } from '../../shared/types';
import type { LessonStats } from '../../shared/board';
/**
 * Overlay-local inputs the kite's frame loop reads while a whiteboard lesson plays; never React state.
 * `pen` is the nib while a stroke is being drawn; `rest` is where the kite waits between strokes.
 */
export const boardRuntime = {
  pen: null as CursorPoint | null,
  rest: null as CursorPoint | null,
  aim: null as CursorPoint | null,
  /** Advances the drawing animation; called once per frame by the kite loop. */
  tick: null as ((now: number) => void) | null,
  /** Board elements under user marks (overlay-local strokes), for "what is this?" questions. */
  hit: null as ((region: { x: number; y: number; width: number; height: number }) => string[]) | null,
  /** The board panel in overlay-local coordinates while it is shown. */
  frame: null as { x: number; y: number; width: number; height: number } | null,
  /** The latest lesson's numbers, kept after the board closes (dev panel). */
  stats: null as LessonStats | null,
};
