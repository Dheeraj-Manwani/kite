import { config } from '../config';
import { Motion, moods } from '../moods';

export type OneShot = 'gust' | 'wake' | 'dizzy';
export type Behavior = 'content' | 'bored' | 'dozing' | 'excited' | OneShot;
export interface BehaviorState {
  name: Behavior; lastMovement: number; nextGust: number;
  shot: OneShot | null; shotStart: number;
}
export function createBehavior(now: number, random: number): BehaviorState {
  return { name: 'content', lastMovement: now, nextGust: now + config.gustMin + random * (config.gustMax - config.gustMin), shot: null, shotStart: now };
}
export function updateBehavior(state: BehaviorState, now: number, speed: number, random: number, trigger?: OneShot, reduced = false, automatic = true): { state: BehaviorState; motion: Motion; spin: number } {
  const next = { ...state };
  const moving = speed > config.stillSpeed;
  if (moving) {
    if (automatic && (state.name === 'bored' || state.name === 'dozing')) trigger = trigger ?? 'wake';
    next.lastMovement = now;
  }
  if (trigger && !(reduced && (trigger === 'gust' || trigger === 'dizzy'))) {
    next.shot = trigger; next.shotStart = now;
  }
  if (now >= next.nextGust) {
    next.nextGust = now + config.gustMin + random * (config.gustMax - config.gustMin);
    if (automatic && !reduced && !next.shot && now - next.lastMovement < config.boredAfter) {
      next.shot = 'gust'; next.shotStart = now;
    }
  }
  const elapsed = now - next.shotStart;
  const duration = next.shot === 'wake' ? config.wakeDuration : next.shot === 'dizzy' ? config.dizzyDuration : config.gustDuration;
  if (elapsed >= duration || (reduced && next.shot !== 'wake')) next.shot = null;
  const still = now - next.lastMovement;
  next.name = next.shot ?? (still >= config.dozeAfter ? 'dozing' : still >= config.boredAfter ? 'bored' : speed > config.excitedSpeed ? 'excited' : 'content');
  const motion = { ...moods.idle };
  let spin = 0;
  switch (next.name) {
    case 'bored':
      Object.assign(motion, { stiffness: 0.7, wind: 0.15, wag: 0.3, frequency: 0.5, driftX: 6, driftY: 3, tilt: 12 }); break;
    case 'dozing':
      Object.assign(motion, { stiffness: 0.6, wind: 0.05, wag: 0.08, frequency: 0.2, bob: 1, bobFrequency: 0.1, opacity: 0.75, tilt: 8, driftY: 5 }); break;
    case 'excited':
      Object.assign(motion, { wag: 2.5, frequency: 2, wind: 1.5, stiffness: 1.1 }); break;
    case 'gust':
      Object.assign(motion, { wag: 4, frequency: 3, wind: 5, tilt: 14 }); break;
    case 'wake':
      Object.assign(motion, { wag: 3, frequency: 2.5, stiffness: 1.4 });
      // Fast anticipation, then a hop. Kept separate from slow mood blending.
      motion.stretch = elapsed < 0.08 ? 0.78 : 1 + 0.25 * Math.sin(Math.min(1, (elapsed - 0.08) / 0.4) * Math.PI);
      motion.driftY = elapsed < 0.08 ? 2 : -7 * Math.sin(Math.min(1, (elapsed - 0.08) / 0.45) * Math.PI);
      break;
    case 'dizzy': {
      const t = Math.min(1, elapsed / config.dizzyDuration);
      spin = 360 * (t * t * (3 - 2 * t));
      Object.assign(motion, { wag: 4, frequency: 2.8, tilt: 22 * Math.sin(t * Math.PI), wind: 2 });
      break;
    }
  }
  return { state: next, motion, spin: reduced ? 0 : spin };
}
