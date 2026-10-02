import { spring, stepSpring, type Spring } from './physics/spring';
import type { Vec2 } from './physics/vector';

/** The body's transform, in the same order the loop writes it: translate, rotate(direction), stretch, rotate, scale, squash. */
export interface BodyFrame { x: number; y: number; direction: number; along: number; rotation: number; scale: number; squash: number }

const rad = (deg: number) => deg * Math.PI / 180;
/** A point in the sail's local frame, placed on screen exactly as the body's SVG transform would place it. */
export function toScreen(p: Vec2, f: BodyFrame): Vec2 {
  // scale(scale) scale(1 squash), then rotate(rotation - direction)
  let x = p.x * f.scale, y = p.y * f.scale * f.squash;
  const turn = rad(f.rotation - f.direction);
  [x, y] = [x * Math.cos(turn) - y * Math.sin(turn), x * Math.sin(turn) + y * Math.cos(turn)];
  // scale(along 1/along) along the direction of travel, then rotate(direction) and translate
  x *= f.along; y /= f.along;
  const dir = rad(f.direction);
  return { x: f.x + x * Math.cos(dir) - y * Math.sin(dir), y: f.y + x * Math.sin(dir) + y * Math.cos(dir) };
}

export interface TailDot { x: Spring; y: Spring }
export const tailAt = (anchors: Vec2[]): TailDot[] => anchors.map(a => ({ x: spring(a.x), y: spring(a.y) }));
// Each dot hangs on its own spring, looser the further it is from the sail, so the tail trails and swings (docs/design.md K-03).
// Like a real tail, each dot can only stray so far (px at scale 1): fast flights stretch the tail, never detach it.
const stiffness = [900, 480, 280], reach = [3, 6, 9];
/** Step each dot toward its anchor. Under reduced motion the dots sit exactly on their anchors. */
export function stepTail(dots: TailDot[], anchors: Vec2[], dt: number, reduced: boolean, scale = 1): TailDot[] {
  return dots.map((dot, i) => {
    const target = anchors[i];
    if (reduced) return { x: spring(target.x), y: spring(target.y) };
    const k = stiffness[Math.min(i, stiffness.length - 1)], damping = 1.6 * Math.sqrt(k);
    const x = stepSpring(dot.x, target.x, k, damping, dt), y = stepSpring(dot.y, target.y, k, damping, dt);
    const dx = x.value - target.x, dy = y.value - target.y, distance = Math.hypot(dx, dy), limit = reach[Math.min(i, reach.length - 1)] * scale;
    if (distance <= limit) return { x, y };
    // Pulled taut: sit on the edge of the reach and drop the speed that would carry it further out.
    const keep = limit / distance;
    return { x: { value: target.x + dx * keep, velocity: x.velocity * keep }, y: { value: target.y + dy * keep, velocity: y.velocity * keep } };
  });
}
