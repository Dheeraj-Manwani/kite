import { dimensions, grid, links, nodeElement, type FamilyLayout } from './common';
export const freeform: FamilyLayout = script => {
  const nodes = script.nodes.filter(n => !n.group), fallback = grid(nodes), placed = new Map(fallback.map(e => [e.id, e]));
  nodes.forEach(n => { const anchor = n.relative && placed.get(n.relative); if (!anchor) return;
    const d = dimensions(nodes.find(v => v.id === anchor.id));
    placed.set(n.id, nodeElement(n, n.side === 'below' ? anchor.x : anchor.x + d.width + 120, n.side === 'below' ? anchor.y + d.height + 120 : anchor.y)); });
  return [...placed.values(), ...links(script)];
};
