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

export interface GuideLayout { ring: ScreenBounds; anchor: CursorPoint; aim: CursorPoint; card: CursorPoint }
// Distance from the ring to the kite's centre; its half-extent for a comfortable fit, then its body alone.
// Sized for the sail: its nose is 11 px from the centre, so the tip stops about 9 px short of the ring.
const kiteReach = 20, wholeReach = 20, bodyReach = 14;
const overlaps = (a: ScreenBounds, b: ScreenBounds) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const inside = (inner: ScreenBounds, outer: ScreenBounds) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
const clampTo = (value: number, min: number, max: number) => Math.max(min, Math.min(Math.max(min, max), value));
/** An ellipse that encloses the control's corners, with room for a marker stroke. */
export function ringBounds(rect: ScreenBounds): ScreenBounds {
  const rx = Math.max(16, rect.width / 2 * 1.2 + 7), ry = Math.max(14, rect.height / 2 * 1.3 + 7);
  const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
  return { x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 };
}
/** Pure placement in one coordinate space: the card never covers the target and the kite never covers either. */
export function layoutGuide(target: ScreenBounds, display: ScreenBounds, card: { width: number; height: number }): GuideLayout {
  const ring = ringBounds(target), margin = 12;
  const cx = target.x + target.width / 2, cy = target.y + target.height / 2;
  const right = display.x + display.width, bottom = display.y + display.height;
  const below = ring.y + ring.height + margin, above = ring.y - margin - card.height;
  let cardY = below + card.height <= bottom - margin ? below : above >= display.y + margin ? above : clampTo(cy - card.height / 2, display.y + margin, bottom - margin - card.height);
  let cardX = clampTo(cx - card.width / 2, display.x + margin, right - margin - card.width);
  const cardBox = () => ({ x: cardX, y: cardY, width: card.width, height: card.height });
  if (overlaps(cardBox(), ring)) {
    // Tall targets: put the card beside the ring instead.
    cardX = ring.x + ring.width + margin + card.width <= right - margin ? ring.x + ring.width + margin : clampTo(ring.x - margin - card.width, display.x + margin, right - margin - card.width);
    cardY = clampTo(cy - card.height / 2, display.y + margin, bottom - margin - card.height);
  }
  const candidates: CursorPoint[] = [
    { x: ring.x + ring.width + kiteReach - 6, y: cy + 6 }, { x: ring.x - kiteReach + 6, y: cy + 6 },
    { x: cx + 10, y: ring.y - kiteReach + 4 }, { x: cx + 10, y: ring.y + ring.height + kiteReach - 4 },
    { x: ring.x + ring.width + kiteReach * 0.7, y: ring.y + ring.height + kiteReach * 0.5 }, { x: ring.x - kiteReach * 0.7, y: ring.y + ring.height + kiteReach * 0.5 },
    { x: ring.x + ring.width + kiteReach, y: ring.y - kiteReach / 2 }, { x: ring.x - kiteReach, y: ring.y - kiteReach / 2 },
  ];
  // Whole kite (with tail) first; then just its body, since a tail may hang off the screen edge.
  const box = (p: CursorPoint, half: number) => ({ x: p.x - half, y: p.y - half, width: half * 2, height: half * 2 });
  const fits = (half: number) => (p: CursorPoint) => inside(box(p, half), display) && !overlaps(box(p, half), cardBox());
  const clampPoint = (p: CursorPoint) => ({ x: clampTo(p.x, display.x + bodyReach, right - bodyReach), y: clampTo(p.y, display.y + bodyReach, bottom - bodyReach) });
  const anchor = candidates.find(fits(wholeReach)) ?? candidates.find(fits(bodyReach))
    ?? candidates.map(clampPoint).find(p => !overlaps(box(p, bodyReach), target)) ?? clampPoint(candidates[0]);
  return { ring, anchor, aim: { x: cx, y: cy }, card: { x: cardX, y: cardY } };
}
