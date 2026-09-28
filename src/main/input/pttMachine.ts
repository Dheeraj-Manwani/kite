export type PttAction = 'start' | 'stop' | 'cancel' | 'tooShort';
export interface PttState { down: string[]; holding: boolean; blocked: boolean; startedAt: number }
export const initialPtt = (): PttState => ({ down: [], holding: false, blocked: false, startedAt: 0 });
/** Pure and repeat-safe. Re-arm only once all combo modifiers have been released. */
export function stepPtt(state: PttState, event: { key: string; down: boolean; now: number }, combo: readonly string[], minimumMs = 250): { state: PttState; action?: PttAction } {
  const down = new Set(state.down);
  if (event.down === down.has(event.key)) return { state };
  if (event.down) down.add(event.key); else down.delete(event.key);
  const next = { ...state, down: [...down] };
  let action: PttAction | undefined;
  if (state.holding) {
    if (event.down && !combo.includes(event.key)) {
      next.holding = false; next.blocked = true; action = 'cancel';
    } else if (!event.down && combo.includes(event.key)) {
      next.holding = false; next.blocked = true;
      action = event.now - state.startedAt < minimumMs ? 'tooShort' : 'stop';
    }
  } else if (event.down && combo.includes(event.key) && !state.blocked && combo.every(key => down.has(key)) && [...down].every(key => combo.includes(key))) {
    next.holding = true; next.startedAt = event.now; action = 'start';
  }
  if (combo.every(key => !down.has(key))) next.blocked = false;
  return { state: next, action };
}
