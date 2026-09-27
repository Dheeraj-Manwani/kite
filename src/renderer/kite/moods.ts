import type { KiteMood } from '../../shared/types';

export interface Motion {
  stiffness: number; damping: number; wag: number; frequency: number;
  wind: number; bob: number; bobFrequency: number; tilt: number; opacity: number;
  driftX: number; driftY: number; stretch: number;
}
export const moods: Record<KiteMood, Motion> = {
  idle: { stiffness: 1, damping: 1, wag: 1, frequency: 1, wind: 1, bob: 2.2, bobFrequency: 0.3, tilt: 0, opacity: 1, driftX: 0, driftY: 0, stretch: 1 },
  listening: { stiffness: 1.6, damping: 1.45, wag: 0.28, frequency: 5, wind: 0.3, bob: 0.35, bobFrequency: 0.5, tilt: 0, opacity: 1, driftX: 0, driftY: 0, stretch: 1 },
  thinking: { stiffness: 0.7, damping: 0.85, wag: 2.2, frequency: 0.45, wind: 0.7, bob: 3, bobFrequency: 0.23, tilt: 18, opacity: 1, driftX: 0, driftY: 0, stretch: 1 },
  talking: { stiffness: 1.15, damping: 1, wag: 1.9, frequency: 1.7, wind: 1.1, bob: 3, bobFrequency: 1.7, tilt: 5, opacity: 1, driftX: 0, driftY: 0, stretch: 1 },
};
export function blendMotion(current: Motion, target: Motion, dt: number, duration: number): Motion {
  const result = { ...current };
  const alpha = 1 - Math.exp(-dt * 3 / duration);
  (Object.keys(result) as (keyof Motion)[]).forEach(key => {
    result[key] += (target[key] - result[key]) * alpha;
  });
  return result;
}
