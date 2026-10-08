import { dimensions, nodeElement, links, type FamilyLayout } from './common';
export const layers: FamilyLayout = script => {
  let y = 140; const nodes = script.nodes.filter(n => !n.group), width = Math.max(420, ...nodes.map(n => dimensions(n).width));
  return [...nodes.map(n => { const d = dimensions(n), e = { ...nodeElement(n, 60, y), width }; y += d.height + 140; return e; }), ...links(script)];
};
