import { config } from '../config';
export interface ShakeState { direction: number; reversals: number[]; cooldownUntil: number }
export const createShake = (): ShakeState => ({ direction: 0, reversals: [], cooldownUntil: 0 });
export function detectShake(state: ShakeState, velocityX: number, now: number): { state: ShakeState; fired: boolean } {
  const reversals = state.reversals.filter(time => now - time <= config.shakeWindow);
  const direction = Math.abs(velocityX) >= config.shakeSpeed ? Math.sign(velocityX) : 0;
  if (direction && state.direction && direction !== state.direction) reversals.push(now);
  const fired = now >= state.cooldownUntil && reversals.length >= config.shakeReversals;
  return {
    fired,
    state: { direction: direction || state.direction, reversals: fired ? [] : reversals,
      cooldownUntil: fired ? now + config.shakeCooldown : state.cooldownUntil },
  };
}
