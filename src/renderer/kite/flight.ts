import type { Vec2 } from './physics/vector';

/**
 * The loop-de-loop (docs/personality.md §5.4): a route from A to B with one whole loop on the way. It is a line to
 * just short of halfway, a circle that climbs up the screen first, then a line to the end. Its direction never jumps,
 * so the nose can simply follow it round. "Let's fly" (§5.7) is its first use.
 */
export interface Route { from: Vec2; along: Vec2; up: Vec2; radius: number; first: number; loop: number; length: number }

export function loopRoute(from: Vec2, to: Vec2): Route {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const along = distance > 1 ? { x: (to.x - from.x) / distance, y: (to.y - from.y) / distance } : { x: 1, y: 0 };
  // Whichever way the kite is heading, the loop climbs toward the top of the screen.
  let up = { x: along.y, y: -along.x };
  if (up.y > 0 || (up.y === 0 && up.x > 0)) up = { x: -up.x, y: -up.y };
  const radius = Math.min(90, Math.max(40, distance * .12)), loop = Math.PI * 2 * radius;
  return { from, along, up, radius, first: distance * .45, loop, length: distance + loop };
}

/** The point `s` px along the route, and the unit direction of travel there. */
export function routeAt(route: Route, s: number): { point: Vec2; heading: Vec2 } {
  const { from, along, up, radius, first, loop } = route;
  if (s > first && s < first + loop) {
    const phi = (s - first) / radius, sin = Math.sin(phi), cos = Math.cos(phi);
    return {
      point: { x: from.x + along.x * (first + radius * sin) + up.x * radius * (1 - cos), y: from.y + along.y * (first + radius * sin) + up.y * radius * (1 - cos) },
      heading: { x: along.x * cos + up.x * sin, y: along.y * cos + up.y * sin },
    };
  }
  const travelled = s <= first ? s : s - loop;
  return { point: { x: from.x + along.x * travelled, y: from.y + along.y * travelled }, heading: along };
}

/** Seconds to fly a route: long enough to read the loop, short enough to feel like a flourish. */
export const flightDuration = (route: Route) => Math.min(2.2, Math.max(1.2, .8 + route.length / 1500));
/** Slow out, fast through the loop, slow in, so the hand-over to the follow spring is gentle. */
export const easeInOut = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x < .5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2; };
/** The rotation in degrees that points the nose (local -y) along a direction. */
export const noseAngle = (direction: Vec2) => Math.atan2(direction.y, direction.x) * 180 / Math.PI + 90;
