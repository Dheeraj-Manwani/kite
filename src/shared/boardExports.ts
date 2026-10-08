import { boardColors, elementBounds, type LaidElement, type TextBlock } from './board';
import type { BoardScript } from './boardScript';
export type BoardExportFormat = 'svg' | 'excalidraw' | 'excalidraw-clipboard' | 'excalidraw-open' | 'mermaid' | 'pdf';
export const boardExportFormats: BoardExportFormat[] = ['svg', 'excalidraw', 'excalidraw-clipboard', 'excalidraw-open', 'mermaid', 'pdf'];
export const xml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
export function validBoardSvg(svg: string) {
  if (svg.length > 10000000 || !/^<svg\s/.test(svg) || /<[^>]+\bon\w+\s*=|<\?|<!|@import\b/i.test(svg)) return false;
  if ([...svg.matchAll(/<\/?([\w:-]+)/g)].some(m => !['svg','g','path','defs','clipPath','rect','text','circle','ellipse','line','polyline','polygon','style','use','pattern'].includes(m[1]))) return false;
  const tags = svg.match(/<[^>]*>/g)?.join('') ?? '';
  const references = [...tags.matchAll(/\b(?:href|xlink:href)\s*=\s*["']([^"']*)["']/gi)].map(m => m[1]);
  const styles = svg.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi)?.join('') ?? '';
  const urls = [...(tags + styles).matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)/gi)].map(m => m[1]);
  return [...references, ...urls].every(url => url.startsWith('#') || /^data:font\/woff2;base64,[A-Za-z0-9+/=]+$/.test(url));
}
/** The element skeleton mapping is completed with the portable v2 scene fields, without a runtime editor SDK. */
export function excalidrawScene(scene: LaidElement[], clipboard = false) {
  const elements: Record<string, unknown>[] = [], files: Record<string, unknown> = {};
  const used = new Set(scene.map(e => e.id)), extraId = (id: string) => { let key = `${id}_label`; while (used.has(key)) key += '_'; used.add(key); return key; };
  const base = (e: LaidElement, id = e.id): Record<string, unknown> => ({ id, x: 0, y: 0, width: 0, height: 0, angle: 0, strokeColor: boardColors[e.color].stroke,
    backgroundColor: 'transparent', fillStyle: 'hachure', strokeWidth: 2, strokeStyle: 'solid', roughness: 1, opacity: 100, groupIds: [], frameId: null,
    roundness: null, seed: e.seed % 2147483647, version: 1, versionNonce: e.seed % 2147483647, isDeleted: false, boundElements: [], updated: 0, link: null, locked: false });
  const text = (e: LaidElement, block: TextBlock, containerId: string | null) => {
    const id = containerId ? extraId(e.id) : e.id;
    elements.push({ ...base(e, id), type: 'text', x: block.x, y: block.y, width: Math.max(1, block.width), height: block.height, fontSize: block.size,
      fontFamily: 5, text: block.lines.join('\n'), originalText: block.lines.join('\n'), textAlign: block.align, verticalAlign: 'middle', containerId, autoResize: true, lineHeight: 1.3 }); return id;
  };
  for (const e of scene) {
    const common = base(e);
    if (e.kind === 'shape') { const el: Record<string, unknown> = { ...common, type: e.shape, ...e.box, backgroundColor: e.fill === 'none' ? 'transparent' : boardColors[e.color].fill, fillStyle: e.fill === 'solid' ? 'solid' : 'hachure' }; elements.push(el);
      if (e.label) (el.boundElements as { id: string; type: string }[]).push({ id: text(e, e.label, e.id), type: 'text' }); }
    else if (e.kind === 'text') text(e, e.text, null);
    else if (e.kind === 'formula') {
      const fileId = `math_${e.id}`, svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${e.formula.box.x} ${e.formula.box.y} ${e.formula.box.width} ${e.formula.box.height}">${e.formula.paths.map(p => `<path d="${xml(p.d)}" transform="${xml(p.transform)}" fill="none" stroke="${boardColors[e.color].stroke}" stroke-width="35"/>`).join('')}</svg>`;
      files[fileId] = { id: fileId, mimeType: 'image/svg+xml', dataURL: `data:image/svg+xml;base64,${btoa(Array.from(new TextEncoder().encode(svg), b => String.fromCharCode(b)).join(''))}`, created: 0, lastRetrieved: 0 };
      elements.push({ ...common, type: 'image', ...e.box, fileId, scale: [1, 1], status: 'saved', crop: null, customData: { tex: e.label } });
    } else { const first = e.points[0], box = elementBounds(e), points = e.points.map(p => [p.x - first.x, p.y - first.y]);
      const el: Record<string, unknown> = { ...common, type: e.kind === 'arrow' ? 'arrow' : e.freehand ? 'freedraw' : 'line', x: first.x, y: first.y,
        width: box.width, height: box.height, points, strokeStyle: e.dashed ? 'dashed' : 'solid' };
      if (e.kind === 'arrow') Object.assign(el, { startBinding: e.from && used.has(e.from) ? { elementId: e.from, focus: 0, gap: 8, fixedPoint: null } : null,
        endBinding: e.to && used.has(e.to) ? { elementId: e.to, focus: 0, gap: 8, fixedPoint: null } : null, startArrowhead: e.heads === 'both' ? 'arrow' : null, endArrowhead: e.heads === 'none' ? null : 'arrow', elbowed: false, lastCommittedPoint: null });
      if (e.kind === 'line') Object.assign(el, e.freehand ? { simulatePressure: true, pressures: [], lastCommittedPoint: null, strokeWidth: 4 } : { startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: null, lastCommittedPoint: null, backgroundColor: e.fill === 'solid' ? boardColors[e.color].fill : 'transparent', fillStyle: 'solid' });
      elements.push(el); if (e.kind === 'arrow' && e.label) (el.boundElements as { id: string; type: string }[]).push({ id: text(e, e.label, e.id), type: 'text' });
    }
  }
  const byId = new Map(elements.map(e => [e.id, e]));
  for (const e of scene) if (e.kind === 'arrow') for (const id of new Set([e.from, e.to])) { const target = byId.get(id); if (target) (target.boundElements as { id: string; type: string }[]).push({ id: e.id, type: 'arrow' }); }
  return { type: clipboard ? 'excalidraw/clipboard' : 'excalidraw', version: 2, source: 'Kite', elements, ...(clipboard ? {} : { appState: { viewBackgroundColor: '#ffffff', gridSize: null } }), files };
}
// Entity codes neutralize diagram directives, punctuation and markup inside provider/user labels.
const mermaidLabel = (s: string) => [...s].map(c => /[\p{L}\p{N} .,!?'_-]/u.test(c) ? c : `#${c.codePointAt(0)};`).join('').slice(0, 2000);
export function mermaidBoard(script: BoardScript | undefined, scene: LaidElement[]) {
  if (!script || !['flow', 'sequence'].includes(script.family)) throw new Error('Mermaid export is available for flow and sequence boards.');
  const visible = new Map(scene.map(e => [e.id, e])), nodes = script.nodes.filter(n => visible.has(n.id) && !n.group), aliases = new Map(nodes.map((n, i) => [n.id, `n${i}`]));
  const names = nodes.map(n => { const e = visible.get(n.id); return e.kind === 'shape' ? e.label?.lines.join(' ') || n.label : e.kind === 'text' ? e.text.lines.join(' ') : n.label; });
  const lines = [script.family === 'sequence' ? 'sequenceDiagram' : 'flowchart TD'];
  nodes.forEach((n, i) => lines.push(script.family === 'sequence' ? `  participant ${aliases.get(n.id)} as ${mermaidLabel(names[i])}`
    : `  ${aliases.get(n.id)}${n.shape === 'diamond' ? `{"${mermaidLabel(names[i])}"}` : n.shape === 'ellipse' ? `(("${mermaidLabel(names[i])}"))` : `["${mermaidLabel(names[i])}"]`}`));
  const edges = script.family === 'sequence' ? script.edges : scene.filter(e => e.kind === 'arrow').map(e => e.kind === 'arrow' ? { id: e.id, from: e.from, to: e.to, label: e.label?.lines.join(' ') } : null).filter(Boolean);
  for (const edge of edges) { if (!visible.has(edge.id) || !aliases.has(edge.from) || !aliases.has(edge.to)) continue;
    const laid = visible.get(edge.id), label = mermaidLabel(laid.kind === 'arrow' ? laid.label?.lines.join(' ') || edge.label || '' : edge.label || '');
    lines.push(script.family === 'sequence' ? `  ${aliases.get(edge.from)}${laid.kind === 'arrow' && laid.dashed ? '-->>' : '->>'}${aliases.get(edge.to)}: ${label || 'message'}`
      : `  ${aliases.get(edge.from)} -->${label ? `|"${label}"|` : ''} ${aliases.get(edge.to)}`); }
  return lines.join('\n') + '\n';
}
