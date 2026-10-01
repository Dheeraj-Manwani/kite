/**
 * The sail as a handful of shape dials (docs/design.md §K5.1). Every dial is 1 at rest except
 * flutter, which is a displacement in px applied in opposite directions to the two trailing scallops.
 * nose: how far the tip extends. spread: wingtip span. billow: outward curve of the leading edges.
 * slack: depth of the scalloped trailing edge.
 */
export interface SailShape { nose: number; spread: number; billow: number; slack: number; flutter: number }
export const restSail: SailShape = { nose: 1, spread: 1, billow: 1, slack: 1, flutter: 0 };

// Rest geometry in px at scale 1: the original delta (commit 57255ce), straightened so the nose sits on
// local -y. config.baseAngle tilts it back toward the cursor at rest.
const NOSE_Y = -11.1, WING_X = 13.3, WING_Y = 8.6, TAIL_Y = 10.3, NOSE_ROUND = 1.5;
const LEAD = { x: 10, y: -2.9 }, TRAIL = { x: 4.7, y: 5.5 };
// Control points as offsets from each edge's chord midpoint, so the dials bend the edges rather than move them.
const LEAD_BULGE = { x: LEAD.x - WING_X / 2, y: LEAD.y - (NOSE_Y + WING_Y) / 2 };
const TRAIL_DIP = { x: TRAIL.x - WING_X / 2, y: TRAIL.y - (WING_Y + TAIL_Y) / 2 };
const r = (n: number) => Math.round(n * 100) / 100;

export function sailPath({ nose, spread, billow, slack, flutter }: SailShape): string {
  const tipY = NOSE_Y * nose, wingX = WING_X * spread;
  const leadX = wingX / 2 + LEAD_BULGE.x * billow, leadY = (tipY + WING_Y) / 2 + LEAD_BULGE.y * billow;
  const trailX = wingX / 2 + TRAIL_DIP.x * slack, trailY = (WING_Y + TAIL_Y) / 2 + TRAIL_DIP.y * slack;
  // A soft nose: start a little way down each leading edge and curve through the tip, so it never reads as the real cursor.
  const edge = Math.hypot(leadX, leadY - tipY), ax = leadX / edge * NOSE_ROUND, ay = tipY + (leadY - tipY) / edge * NOSE_ROUND;
  return `M${r(ax)} ${r(ay)}Q${r(leadX)} ${r(leadY)} ${r(wingX)} ${WING_Y}Q${r(trailX)} ${r(trailY + flutter)} 0 ${TAIL_Y}`
    + `Q${r(-trailX)} ${r(trailY - flutter)} ${r(-wingX)} ${WING_Y}Q${r(-leadX)} ${r(leadY)} ${r(-ax)} ${r(ay)}Q0 ${r(tipY)} ${r(ax)} ${r(ay)}Z`;
}

export const sameSail = (a: SailShape, b: SailShape) =>
  a.nose === b.nose && a.spread === b.spread && a.billow === b.billow && a.slack === b.slack && a.flutter === b.flutter;
