import type { ScreenBounds } from '../../shared/types';
/** Small deterministic PRNG (mulberry32): a step's ring keeps its wobble across re-renders. */
function random(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
/**
 * Two loose marker passes around an ellipse, like a quick hand-drawn circle: each starts upper-left,
 * wobbles at low frequency, and overshoots so its ends overlap. Paths are in the ring's coordinates.
 */
export function ringPaths(ring: ScreenBounds, seed: number): string[] {
  const rand = random(seed), cx = ring.x + ring.width / 2, cy = ring.y + ring.height / 2, rx = ring.width / 2, ry = ring.height / 2;
  return [0, 1].map(pass => {
    const start = -Math.PI * 0.72 + (rand() - 0.5) * 0.5, sweep = Math.PI * 2 + 0.3 + rand() * 0.35;
    const phase = [rand() * Math.PI * 2, rand() * Math.PI * 2], wobble = pass ? 0.05 : 0.032, tilt = (rand() - 0.5) * 0.08;
    const points = 48;
    let d = '';
    for (let i = 0; i <= points; i++) {
      const t = i / points, angle = start + sweep * t;
      // The second pass drifts outward, as a hand does when it goes round twice.
      const r = 1 + wobble * Math.sin(angle * 2 + phase[0]) + wobble * 0.6 * Math.sin(angle * 3 + phase[1]) + (pass ? 0.05 * t : 0);
      d += `${i ? 'L' : 'M'}${(cx + Math.cos(angle + tilt) * rx * r).toFixed(1)} ${(cy + Math.sin(angle + tilt) * ry * r).toFixed(1)}`;
    }
    return d;
  });
}
