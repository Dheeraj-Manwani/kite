export interface Vec2 { x: number; y: number }
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const length = (v: Vec2) => Math.hypot(v.x, v.y);
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const rotate = (v: Vec2, radians: number): Vec2 => ({
  x: v.x * Math.cos(radians) - v.y * Math.sin(radians),
  y: v.x * Math.sin(radians) + v.y * Math.cos(radians),
});
export interface Bounds extends Vec2 { width: number; height: number }
