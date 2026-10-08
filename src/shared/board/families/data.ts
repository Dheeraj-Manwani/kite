import type { BoardScript } from '../../boardScript';
import type { ElementInput } from '../../board';
import { dimensions, links, nodeElement } from './common';
export function data(script: BoardScript): ElementInput[] {
  const vertical = script.collection === 'stack' || script.collection === 'hash', out: ElementInput[] = []; let x = 80, y = 160;
  const cells = script.nodes.filter(n => n.role !== 'pointer');
  const sizes = cells.flatMap(n => [n, ...script.beats.flatMap(b => (b.changes ?? []).flatMap(c => c.kind === 'value' && c.id === n.id ? [{ ...n, label: c.value }] : []))]).map(dimensions);
  // Equal slots keep indices and unequal-length values stable through arbitrary swaps.
  const d = { width: Math.max(120, ...sizes.map(v => v.width)), height: Math.max(80, ...sizes.map(v => v.height)) };
  for (const [i, n] of cells.entries()) {
    out.push({ ...nodeElement(n, x, y), ...d }, { id: `${n.id}_index`, type: 'text', text: String(n.index ?? i), x: x + d.width / 2, y: y - 36, align: 'center', size: 'small', color: 'gray' });
    if (vertical) y += d.height + 100; else x += d.width + (script.collection === 'linked-list' ? 140 : 80);
  }
  for (const [i, n] of script.nodes.filter(n => n.role === 'pointer').entries()) {
    const target = out.find(e => e.id === n.relative) ?? out.find(e => e.type === 'rectangle');
    out.push({ ...nodeElement(n, target?.x ?? 80, (target?.y ?? 160) + (target?.height ?? 80) + 100 + i * 100), color: 'blue' });
  }
  return [...out, ...links(script)];
}
