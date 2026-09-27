import { Bounds, Vec2, clamp } from './vector';

export interface RopePoint { position: Vec2; previous: Vec2 }
export interface Rope { points: RopePoint[]; previousDt: number }
export interface RopeOptions {
  segmentLength: number; iterations: number; gravity: number; wind: number;
  wagAmplitude: number; wagFrequency: number; phaseDelay: number; drag: number;
  bounds?: Bounds;
}
export function createRope(pin: Vec2, count: number, segmentLength: number): Rope {
  return { previousDt: 1 / 60, points: Array.from({ length: count }, (_, i) => {
    const position = { x: pin.x, y: pin.y + i * segmentLength };
    return { position, previous: { ...position } };
  }) };
}
/** Pure Verlet integration. Inputs are never mutated. Point zero is kinematic. */
export function stepRope(rope: Rope, pin: Vec2, time: number, dt: number, options: RopeOptions): Rope {
  if (dt <= 0) return rope;
  const { segmentLength, iterations, gravity, wind, wagAmplitude, wagFrequency, phaseDelay, drag, bounds } = options;
  const decay = Math.exp(-drag * dt);
  const ratio = dt / Math.max(rope.previousDt, 0.001);
  const points = rope.points.map((point, i) => {
    if (i === 0) return { position: { ...pin }, previous: { ...pin } };
    const parent = rope.points[i - 1].position;
    const dx = point.position.x - parent.x;
    const dy = point.position.y - parent.y;
    const distance = Math.hypot(dx, dy) || 1;
    const wave = Math.sin(time * wagFrequency * Math.PI * 2 - i * phaseDelay) * wagAmplitude * 100;
    return {
      previous: { ...point.position },
      position: {
        x: point.position.x + (point.position.x - point.previous.x) * ratio * decay + (wind + dy / distance * wave) * dt * dt,
        y: point.position.y + (point.position.y - point.previous.y) * ratio * decay + (gravity - dx / distance * wave) * dt * dt,
      },
    };
  });
  for (let pass = 0; pass < iterations; pass++) {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1].position;
      const b = points[i].position;
      const dx = b.x - a.x, dy = b.y - a.y;
      const distance = Math.hypot(dx, dy) || 0.001;
      const correction = (distance - segmentLength) / distance;
      const share = i === 1 ? 1 : 0.5;
      b.x -= dx * correction * share; b.y -= dy * correction * share;
      if (i > 1) { a.x += dx * correction * 0.5; a.y += dy * correction * 0.5; }
      if (bounds) {
        b.x = clamp(b.x, bounds.x + 2, bounds.x + bounds.width - 2);
        b.y = clamp(b.y, bounds.y + 2, bounds.y + bounds.height - 2);
      }
    }
  }
  // Final forward projection keeps all segment lengths exact after large pin moves.
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1].position, b = points[i].position;
    const dx = b.x - a.x, dy = b.y - a.y;
    const distance = Math.hypot(dx, dy) || 1;
    b.x = a.x + dx / distance * segmentLength;
    b.y = a.y + dy / distance * segmentLength;
  }
  return { points, previousDt: dt };
}
/** Shared midpoints make adjacent tapered sections join without sharp corners. */
export function ropePaths(rope: Rope): string[] {
  const p = rope.points.map(point => point.position);
  return p.slice(1).map((point, i) => {
    const previous = p[i];
    const start = i === 0 ? previous : { x: (p[i - 1].x + previous.x) / 2, y: (p[i - 1].y + previous.y) / 2 };
    const end = i === p.length - 2 ? point : { x: (previous.x + point.x) / 2, y: (previous.y + point.y) / 2 };
    return `M ${start.x} ${start.y} Q ${previous.x} ${previous.y} ${end.x} ${end.y}`;
  });
}
