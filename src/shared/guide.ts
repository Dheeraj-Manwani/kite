import type { CursorPoint, ScreenBounds } from './types';
/** Plan roles the model may use. Grounding maps each to UI Automation control types. */
export const guideRoles = ['button', 'tab', 'menu', 'menu item', 'link', 'checkbox', 'radio button', 'dropdown', 'text field', 'list item', 'tree item', 'slider', 'other'] as const;
export type GuideRole = typeof guideRoles[number];
export interface GuideStep { instruction: string; target: string; role: GuideRole }
export interface GuidePlan { goal: string; app: string; steps: GuideStep[] }
export const maxGuideSteps = 15;
export type GuideStatus = 'locating' | 'pointing' | 'lost' | 'paused' | 'done';
/** Everything the overlay needs to draw one guide frame. Rectangles are global desktop DIP. */
export interface GuideView {
  id: number; goal: string; app: string;
  index: number; total: number; completed: number;
  instruction: string; target: string; status: GuideStatus;
  rect: ScreenBounds | null; display: ScreenBounds | null;
  source: 'uia' | 'vision' | null; verified: boolean;
  /** Named controls around the target (personality.md K-08), so the kite can sit clear of what the user checks next. */
  nearby?: ScreenBounds[];
}
export const guideActions = ['back', 'next', 'pause', 'resume', 'stop', 'repeat'] as const;
export type GuideAction = typeof guideActions[number];
export type GuideCommand = GuideAction | 'new-request';

/** Deterministic: only short, exact phrases control a running guide; anything else goes to the model. */
export function classifyGuideCommand(text: string): GuideCommand {
  const s = text.toLowerCase().trim().replace(/’/g, "'").replace(/[.!?,]+/g, '').replace(/\s+/g, ' ').replace(/^(ok|okay|kite|hey kite) /, '').replace(/ please$/, '');
  if (/^(wait|hold on|hang on|pause|one sec(ond)?|just a (sec|second|moment|minute)|give me a (sec|second|moment|minute)|wait a (sec|second|moment|minute))$/.test(s)) return 'pause';
  if (/^(continue|resume|go on|keep going|carry on|i'm back|i'm ready|ready|let's continue|continue the guide|resume the guide)$/.test(s)) return 'resume';
  if (/^(next|next step|skip|skip (it|this|that|this step|that step)|done|got it|i did it|did it|i clicked it)$/.test(s)) return 'next';
  if (/^(back|go back|previous|previous step|last step|step back)$/.test(s)) return 'back';
  if (/^(repeat|repeat that|repeat the step|say (that|it) again|again|come again|where|where is it|where's that|what was that)$/.test(s)) return 'repeat';
  if (/^(stop|cancel|quit|exit|end|stop the guide|cancel the guide|end the guide|stop guiding( me)?|never ?mind|that's enough|i'm done|stop showing me)$/.test(s)) return 'stop';
  return 'new-request';
}

/** `dim`: the kite couldn't avoid a neighbouring control, so it shows at 85% to let the label through (K-08). */
export interface GuideLayout { ring: ScreenBounds; anchor: CursorPoint; aim: CursorPoint; card: CursorPoint; dim: boolean }
const overlaps = (a: ScreenBounds, b: ScreenBounds) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const inside = (inner: ScreenBounds, outer: ScreenBounds) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
const clampTo = (value: number, min: number, max: number) => Math.max(min, Math.min(Math.max(min, max), value));
/** An ellipse that encloses the control's corners, with room for a marker stroke. */
export function ringBounds(rect: ScreenBounds): ScreenBounds {
  const rx = Math.max(16, rect.width / 2 * 1.2 + 7), ry = Math.max(14, rect.height / 2 * 1.3 + 7);
  const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
  return { x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 };
}
/**
 * Pure placement in one coordinate space: the card never covers the target and the kite never covers either.
 * The kite goes first (personality.md §5.6, K-08): beside a wide, short target such as a ribbon tab the neighbours sit
 * left and right, so it tries below, then above; beside a tall, narrow one it tries the sides. It prefers a spot clear of
 * the neighbouring controls, then the card takes the first place that clears the ring and the kite.
 */
export function layoutGuide(target: ScreenBounds, display: ScreenBounds, card: { width: number; height: number }, scale = 1, nearby: ScreenBounds[] = []): GuideLayout {
  // Distance from the ring to the kite's centre; its half-extent for a comfortable fit, then its body alone.
  // Sized for the sail: its nose is 11 px from the centre, so the tip stops about 9 px short of the ring.
  // All three grow with the kite's size setting (personality.md K-14).
  const kiteReach = 20 * scale, wholeReach = 20 * scale, bodyReach = 14 * scale;
  const ring = ringBounds(target), margin = 12;
  const cx = target.x + target.width / 2, cy = target.y + target.height / 2;
  const right = display.x + display.width, bottom = display.y + display.height;
  const east = { x: ring.x + ring.width + kiteReach - 6, y: cy + 6 }, west = { x: ring.x - kiteReach + 6, y: cy + 6 };
  const north = { x: cx + 10, y: ring.y - kiteReach + 4 }, south = { x: cx + 10, y: ring.y + ring.height + kiteReach - 4 };
  const corners = [
    { x: ring.x + ring.width + kiteReach * 0.7, y: ring.y + ring.height + kiteReach * 0.5 }, { x: ring.x - kiteReach * 0.7, y: ring.y + ring.height + kiteReach * 0.5 },
    { x: ring.x + ring.width + kiteReach, y: ring.y - kiteReach / 2 }, { x: ring.x - kiteReach, y: ring.y - kiteReach / 2 },
  ];
  const wide = target.width >= target.height * 1.5, tall = target.height >= target.width * 1.5;
  const candidates = wide ? [south, north, ...corners, east, west] : tall ? [east, west, ...corners, north, south] : [east, west, north, south, ...corners];
  // Whole kite (with tail) on screen first; then just its body, since a tail may hang off the screen edge.
  const box = (p: CursorPoint, half: number) => ({ x: p.x - half, y: p.y - half, width: half * 2, height: half * 2 });
  const onScreen = (half: number) => (p: CursorPoint) => inside(box(p, half), display) && !overlaps(box(p, half), target);
  const clear = (p: CursorPoint) => !nearby.some(r => overlaps(box(p, bodyReach), r));
  const clampPoint = (p: CursorPoint) => ({ x: clampTo(p.x, display.x + bodyReach, right - bodyReach), y: clampTo(p.y, display.y + bodyReach, bottom - bodyReach) });
  let anchor = candidates.find(p => onScreen(wholeReach)(p) && clear(p)) ?? candidates.find(onScreen(wholeReach)) ?? candidates.find(onScreen(bodyReach))
    ?? candidates.map(clampPoint).find(p => !overlaps(box(p, bodyReach), target)) ?? clampPoint(candidates[0]);
  // The card: below the ring, else below the ring and the kite, else above, else beside; never over the ring or the kite.
  const kite = box(anchor, wholeReach);
  const column = clampTo(cx - card.width / 2, display.x + margin, right - margin - card.width);
  const middle = clampTo(cy - card.height / 2, display.y + margin, bottom - margin - card.height);
  const spots = [
    { x: column, y: ring.y + ring.height + margin }, { x: column, y: Math.max(ring.y + ring.height, kite.y + kite.height) + margin },
    { x: column, y: ring.y - margin - card.height }, { x: column, y: Math.min(ring.y, kite.y) - margin - card.height },
    { x: Math.max(ring.x + ring.width, kite.x + kite.width) + margin, y: middle }, { x: Math.min(ring.x, kite.x) - margin - card.width, y: middle },
  ].map(p => ({ ...p, width: card.width, height: card.height }));
  let placed = spots.find(c => inside(c, display) && !overlaps(c, ring) && !overlaps(c, kite));
  if (!placed) {
    // Cramped: the card's old rule (below, above, or beside the ring), then the kite moves off the card.
    const below = ring.y + ring.height + margin, above = ring.y - margin - card.height;
    placed = { x: column, y: below + card.height <= bottom - margin ? below : above >= display.y + margin ? above : middle, width: card.width, height: card.height };
    if (overlaps(placed, ring)) placed = { ...placed, x: ring.x + ring.width + margin + card.width <= right - margin ? ring.x + ring.width + margin : clampTo(ring.x - margin - card.width, display.x + margin, right - margin - card.width), y: middle };
    const cardBox = placed;
    anchor = candidates.find(p => onScreen(wholeReach)(p) && !overlaps(box(p, wholeReach), cardBox)) ?? candidates.find(p => onScreen(bodyReach)(p) && !overlaps(box(p, bodyReach), cardBox)) ?? anchor;
  }
  return { ring, anchor, aim: { x: cx, y: cy }, card: { x: placed.x, y: placed.y }, dim: !clear(anchor) };
}
