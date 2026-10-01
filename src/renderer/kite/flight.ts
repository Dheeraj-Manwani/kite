import type { Vec2 } from './physics/vector';

/**
 * The loop-de-loop (docs/personality.md §5.4): a route from A to B with one whole loop on the way. It is a line to
 * just short of halfway, a circle that climbs up the screen first, then a line to the end. Its direction never jumps,
 * so the nose can simply follow it round. "Let's fly" (§5.7) and "something finished well" use it.
 */
export interface Route { from: Vec2; along: Vec2; up: Vec2; radius: number; first: number; loop: number; length: number }

/**
 * `radius` defaults to a size that suits the distance. For a loop in place, `heading` is the way it sets off and `bulge`
 * the side the circle swings out to, so it can stay clear of the bubble.
 */
export function loopRoute(from: Vec2, to: Vec2, options: { radius?: number; heading?: Vec2; bulge?: Vec2 } = {}): Route {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const along = distance > 1 ? { x: (to.x - from.x) / distance, y: (to.y - from.y) / distance } : options.heading ?? { x: 1, y: 0 };
  // Whichever way the kite is heading, the loop climbs toward the top of the screen.
  let up = { x: along.y, y: -along.x };
  if (up.y > 0 || (up.y === 0 && up.x > 0)) up = { x: -up.x, y: -up.y };
  if (options.bulge) up = options.bulge;
  const radius = options.radius ?? Math.min(90, Math.max(40, distance * .12)), loop = Math.PI * 2 * radius;
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
/** Slow out, fast through the middle, slow in, so the hand-over to the follow spring is gentle. */
export const easeInOut = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x < .5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2; };
/** The rotation in degrees that points the nose (local -y) along a direction. */
export const noseAngle = (direction: Vec2) => Math.atan2(direction.y, direction.x) * 180 / Math.PI + 90;

/** A flight the loop can follow: where the kite is `t` (0–1) of the way through, which way it's heading, and how long it takes. */
export interface Path { at(t: number): { point: Vec2; heading: Vec2 }; duration: number }

/** A loop-de-loop from A to B. A loop in place (A = B) is the small one that means "that went well" (§5.4). */
export function loopFlight(from: Vec2, to: Vec2, options: { radius?: number; heading?: Vec2; bulge?: Vec2; duration?: number } = {}): Path {
  const route = loopRoute(from, to, options);
  return { at: t => routeAt(route, route.length * easeInOut(t)), duration: options.duration ?? flightDuration(route) };
}

const unit = (v: Vec2) => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };
/**
 * Dive and swoop (§5.4), "follow me": a curve that dips below the straight line and swoops up into the next control,
 * like a kite dropping to gather speed. A quadratic curve whose control point sits below the midpoint.
 */
export function swoopFlight(from: Vec2, to: Vec2): Path {
  const distance = Math.hypot(to.x - from.x, to.y - from.y), dip = Math.min(110, Math.max(40, distance * .5));
  const control = { x: (from.x + to.x) / 2, y: Math.max(from.y, to.y) + dip };
  return {
    at: t => {
      const u = easeInOut(t), v = 1 - u;
      return {
        point: { x: v * v * from.x + 2 * v * u * control.x + u * u * to.x, y: v * v * from.y + 2 * v * u * control.y + u * u * to.y },
        heading: unit({ x: 2 * v * (control.x - from.x) + 2 * u * (to.x - control.x), y: 2 * v * (control.y - from.y) + 2 * u * (to.y - control.y) }),
      };
    },
    duration: Math.min(1.1, Math.max(.6, .45 + distance / 1400)),
  };
}

/** Reeling out (§5.3, "Paused"): up and away on a gentle curve that drifts with the wind, gathering speed as it goes. */
export function reelFlight(from: Vec2, to: Vec2): Path {
  const control = { x: from.x + (to.x - from.x) * .15, y: from.y + (to.y - from.y) * .55 };
  return {
    at: t => {
      const u = Math.min(1, Math.max(0, t)) ** 2, v = 1 - u;
      return {
        point: { x: v * v * from.x + 2 * v * u * control.x + u * u * to.x, y: v * v * from.y + 2 * v * u * control.y + u * u * to.y },
        heading: unit({ x: 2 * v * (control.x - from.x) + 2 * u * (to.x - control.x), y: 2 * v * (control.y - from.y) + 2 * u * (to.y - control.y) }),
      };
    },
    duration: 1.1,
  };
}
