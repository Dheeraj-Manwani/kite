import { layoutScene, type ElementInput } from '../../board';
import type { BoardScript, ScriptNode } from '../../boardScript';
export type FamilyLayout = (script: BoardScript) => ElementInput[];
export function nodeElement(n: ScriptNode, x = 0, y = 0): ElementInput {
  return { id: n.id, type: n.shape ?? 'rectangle', label: n.label, x, y, ...(n.icon ? { icon: n.icon } : {}) };
}
export function dimensions(n: ScriptNode) {
  const e = layoutScene([nodeElement(n)])[0];
  return e.kind === 'shape' ? e.box : { width: 200, height: 80 };
}
/** Measured rows, rather than fixed-width cells: arbitrary words never overlap their neighbour. */
export function grid(nodes: ScriptNode[], columns = 3, gap = 120): ElementInput[] {
  const out: ElementInput[] = []; let y = 140;
  for (let at = 0; at < nodes.length; at += columns) {
    const row = nodes.slice(at, at + columns); let x = 60, height = 0;
    for (const n of row) { const d = dimensions(n); out.push(nodeElement(n, x, y)); x += d.width + gap; height = Math.max(height, d.height); }
    y += height + gap;
  }
  return out;
}
export function links(script: BoardScript): ElementInput[] {
  return script.edges.map(e => ({ id: e.id, type: 'arrow', from: e.from, to: e.to, label: e.label }));
}
/** Layer a directed graph by its dependencies; cycles get deterministic roots and remain safely routable. */
export function ranked(script: BoardScript, vertical: boolean): ElementInput[] {
  const nodes = script.nodes.filter(n => !n.group), known = new Set(nodes.map(n => n.id)), ranks = new Map<string, number>(), seen = new Set<string>();
  const edges = script.edges.filter(e => known.has(e.from) && known.has(e.to));
  const degrees = new Map(nodes.map(n => [n.id, edges.filter(e => e.to === n.id).length]));
  const queue = nodes.filter(n => !degrees.get(n.id)).map(n => n.id);
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    if (!queue.length) queue.push(n.id);
    while (queue.length) { const key = queue.shift(); if (seen.has(key)) continue; seen.add(key);
      for (const edge of edges.filter(e => e.from === key && !seen.has(e.to))) {
        ranks.set(edge.to, Math.max(ranks.get(edge.to) ?? 0, (ranks.get(key) ?? 0) + 1)); degrees.set(edge.to, degrees.get(edge.to) - 1);
        if (degrees.get(edge.to) <= 0) queue.push(edge.to);
      }
    }
  }
  const layers = [...new Set(nodes.map(n => ranks.get(n.id) ?? 0))].sort((a, b) => a - b).map(rank => nodes.filter(n => (ranks.get(n.id) ?? 0) === rank));
  const extent = (row: ScriptNode[]) => row.reduce((n, v) => n + (vertical ? dimensions(v).width : dimensions(v).height) + 120, -120);
  const across = Math.max(0, ...layers.map(extent)), out: ElementInput[] = []; let along = vertical ? 140 : 60;
  for (const row of layers) { let cross = (vertical ? 60 : 140) + (across - extent(row)) / 2, thickness = 0;
    for (const n of row) { const d = dimensions(n); out.push(nodeElement(n, vertical ? cross : along, vertical ? along : cross));
      cross += (vertical ? d.width : d.height) + 120; thickness = Math.max(thickness, vertical ? d.height : d.width); }
    along += thickness + 160;
  }
  return out;
}
