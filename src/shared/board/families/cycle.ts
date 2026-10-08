import { dimensions, nodeElement, links, type FamilyLayout } from './common';
export const cycle: FamilyLayout = script => {
  const nodes = script.nodes.filter(n => !n.group), max = Math.max(160, ...nodes.map(n => Math.max(dimensions(n).width, dimensions(n).height)));
  const radius = Math.max(240, nodes.length * (max + 140) / (2 * Math.PI));
  return [...nodes.map((n, i) => { const a = i * 2 * Math.PI / nodes.length - Math.PI / 2, d = dimensions(n);
    return nodeElement(n, 60 + radius + Math.cos(a) * radius - d.width / 2, 160 + radius + Math.sin(a) * radius - d.height / 2); }), ...links(script)];
};
