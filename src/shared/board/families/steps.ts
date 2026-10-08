import type { BoardScript } from '../../boardScript';
import type { ElementInput } from '../../board';
export function steps(script: BoardScript): ElementInput[] {
  return script.nodes.flatMap((n, i): ElementInput[] => {
    const tex = n.tex ?? n.label, at = tex.indexOf('='), y = 150 + i * 130;
    const row: ElementInput[] = at < 0 ? [{ id: n.id, type: 'formula', label: tex, x: 80, y }]
      : [{ id: `${n.id}_lhs`, type: 'formula', label: tex.slice(0, at), x: 80, y }, { id: `${n.id}_eq`, type: 'formula', label: '=', x: 320, y }, { id: n.id, type: 'formula', label: tex.slice(at + 1), x: 380, y }];
    if (n.tex && n.label !== n.tex) row.push({ id: `${n.id}_note`, type: 'text', text: n.label, x: 900, y, width: 260, size: 'small', color: 'gray' });
    return row;
  });
}
