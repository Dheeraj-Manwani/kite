import type { BoardScript } from '../../boardScript';
import type { ElementInput, Point } from '../../board';
import { samplePlot } from '../../boardExpression';
export function plot(script: BoardScript): ElementInput[] {
  const out: ElementInput[] = [];
  for (const [i, n] of script.nodes.entries()) {
    if (!n.plot) { out.push({ id: n.id, type: 'text', text: n.label, x: 80, y: 160 + i * 600 }); continue; }
    const s = n.plot, origin = { x: 100, y: 180 + i * 600 }, width = 720, height = 400;
    const map = (p: Point) => ({ x: origin.x + (p.x - s.xmin) / (s.xmax - s.xmin) * width, y: origin.y + height - (p.y - s.ymin) / (s.ymax - s.ymin) * height });
    const x0 = map({ x: Math.max(s.xmin, Math.min(s.xmax, 0)), y: 0 }).x, y0 = map({ x: 0, y: Math.max(s.ymin, Math.min(s.ymax, 0)) }).y;
    out.push({ id: `${n.id}_xaxis`, type: 'line', points: [{ x: origin.x, y: y0 }, { x: origin.x + width, y: y0 }], color: 'gray' },
      { id: `${n.id}_yaxis`, type: 'line', points: [{ x: x0, y: origin.y }, { x: x0, y: origin.y + height }], color: 'gray' },
      { id: `${n.id}_label`, type: 'text', text: `${n.label}   x: ${s.xmin}…${s.xmax}   y: ${s.ymin}…${s.ymax}`, x: origin.x, y: origin.y - 50 });
    try {
      const paths = samplePlot(s, width, height);
      paths.forEach((path, k) => {
        const points = path.map(p => ({ x: p.x + origin.x, y: p.y + origin.y }));
        if (s.shade) out.push({ id: `${n.id}_shade_${k}`, type: 'line', points: [{ x: points[0].x, y: y0 }, ...points, { x: points.at(-1).x, y: y0 }, { x: points[0].x, y: y0 }], color: 'blue', fill: 'solid' });
        out.push({ id: k ? `${n.id}_curve_${k}` : n.id, type: 'line', points, color: 'blue' });
      });
      (s.points ?? []).filter(p => p.x >= s.xmin && p.x <= s.xmax && p.y >= s.ymin && p.y <= s.ymax).forEach((p, k) => { const at = map(p); out.push({ id: `${n.id}_point_${k}`, type: 'line', points: Array.from({ length: 17 }, (_, j) => ({ x: at.x + Math.cos(j / 16 * Math.PI * 2) * 7, y: at.y + Math.sin(j / 16 * Math.PI * 2) * 7 })), color: 'red', fill: 'solid' }); });
    } catch { out.push({ id: n.id, type: 'text', text: 'Could not plot this expression.', x: origin.x, y: origin.y + height + 40 }); }
  }
  return out;
}
