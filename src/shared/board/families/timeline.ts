import { dimensions, nodeElement, links, type FamilyLayout } from './common';
export const timeline: FamilyLayout = script => {
  let x = 60;
  return [...script.nodes.filter(n => !n.group).map((n, i) => { const d = dimensions(n), e = nodeElement(n, x, i % 2 ? 420 : 140); x += d.width + 160; return e; }), ...links(script)];
};
