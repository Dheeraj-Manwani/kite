import type { Vec2 } from './vector';

export interface Spring { value: number; velocity: number }
export const spring = (value: number): Spring => ({ value, velocity: 0 });
/** Semi-implicit Euler, substepped for stable tuning across refresh rates. */
export function stepSpring(state: Spring, target: number, stiffness: number, damping: number, dt: number): Spring {
  let { value, velocity } = state;
  const steps = Math.max(1, Math.ceil(dt * 120));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    velocity += ((target - value) * stiffness - velocity * damping) * h;
    value += velocity * h;
  }
  return { value, velocity };
}
export interface BodySpring { x: Spring; y: Spring }
export const bodySpring = (p: Vec2): BodySpring => ({ x: spring(p.x), y: spring(p.y) });
export function stepBody(body: BodySpring, target: Vec2, stiffness: number, damping: number, dt: number): BodySpring {
  return { x: stepSpring(body.x, target.x, stiffness, damping, dt), y: stepSpring(body.y, target.y, stiffness, damping, dt) };
}
