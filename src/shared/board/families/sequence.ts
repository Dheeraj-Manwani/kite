import { dimensions, nodeElement, type FamilyLayout } from './common';
import type { ElementInput } from '../../board';
/** Participants are fixed once; each message gets its own time row, including replies and repeated pairs. */
export const sequence: FamilyLayout = script => {
  const nodes = script.nodes.filter(n => !n.group), out: ElementInput[] = [], lanes = new Map<string, number>();
  let x = 60; const top = Math.max(140, ...nodes.map(n => dimensions(n).height + 140));
  for (const n of nodes) {
    const d = dimensions(n), center = x + d.width / 2; lanes.set(n.id, center); out.push(nodeElement(n, x, 140));
    out.push({ id: `${n.id}_lifeline`, type: 'line', dashed: true, points: [{ x: center, y: top + 16 }, { x: center, y: top + script.edges.length * 90 + 90 }] });
    x += d.width + 220;
  }
  script.edges.forEach((e, i) => {
    if (!lanes.has(e.from) || !lanes.has(e.to)) return;
    const y = top + (i + 1) * 90;
    out.push({ id: e.id, type: 'arrow', label: e.label, points: [{ x: lanes.get(e.from), y }, { x: lanes.get(e.to), y }] });
  });
  return out;
};
