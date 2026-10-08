import { dimensions, nodeElement, links, type FamilyLayout } from './common';
import { layoutScene, measure, sceneBounds, wrapText, type ElementInput } from '../../board';
/** A measured nested fallback, also used when ELK is unavailable. */
export const architecture: FamilyLayout = script => {
  const place = (parent?: string): ElementInput[] => {
    const children = script.nodes.filter(n => n.parent === parent), out: ElementInput[] = []; let x = 60, y = 140, rowHeight = 0;
    children.forEach((n, i) => {
      if (i && i % 3 === 0) { x = 60; y += rowHeight + 140; rowHeight = 0; }
      if (n.group) {
        const contents = place(n.id), box = sceneBounds(layoutScene(contents)) ?? { x: 0, y: 0, width: 0, height: 0 };
        const header = measure(wrapText(n.label, 220, 20), 20), top = header.height + 38;
        const width = Math.max(header.width + 80, box.width + 80), height = Math.max(160, box.height + top + 40);
        out.push({ id: n.id, type: 'rectangle', x, y, width, height, color: 'gray' },
          { id: `${n.id}_heading`, type: 'text', x: x + 18, y: y + 14, width: 220, text: n.label, size: 'medium' },
          ...contents.map(e => ({ ...e, x: e.x + x + 40 - box.x, y: e.y + y + top - box.y })));
        x += width + 140; rowHeight = Math.max(rowHeight, height);
      } else { const d = dimensions(n); out.push(nodeElement(n, x, y)); x += d.width + 140; rowHeight = Math.max(rowHeight, d.height); }
    });
    return out;
  };
  return [...place(), ...links(script)];
};
