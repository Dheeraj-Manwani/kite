import { canvas, sceneBounds, type LaidElement } from '../../shared/board';
// The page's Excalifont is invisible to an SVG drawn as an image, so the export carries its own copy.
const faces = import.meta.glob('../../../assets/fonts/excalifont/*.woff2', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
let embedded: Promise<string> | undefined;
const ranges = ['U+20-7e, U+a0-a3, U+a5-a6, U+a8-ab, U+ad-b1, U+b4, U+b6-b8, U+ba-ff, U+131, U+152-153, U+2bc, U+2c6, U+2da, U+2dc, U+304, U+308, U+2013-2014, U+2018-201a, U+201c-201e, U+2020, U+2022, U+2024-2026, U+2030, U+2039-203a, U+20ac, U+2122, U+2212',
  'U+100-130, U+132-137, U+139-149, U+14c-151, U+154-17e, U+192, U+1fc-1ff, U+218-21b, U+237, U+1e80-1e85, U+1ef2-1ef3, U+2113',
  'U+400-45f, U+490-491, U+2116', 'U+37e, U+384-38a, U+38c, U+38e-393, U+395-3a1, U+3a3-3a8, U+3aa-3cf, U+3d7',
  'U+2c7, U+2d8-2d9, U+2db, U+2dd, U+302, U+306-307, U+30a-30c, U+326-328, U+212e, U+2211, U+fb01-fb02',
  'U+462-463, U+472-475, U+4d8-4d9, U+4e2-4e3, U+4e6-4e9, U+4ee-4ef', 'U+300-301, U+303'];
export function fontStyle() {
  embedded ??= Promise.all(Object.entries(faces).map(async ([file, url]) => {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
    let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const index = Number(file.match(/Regular-(\d+)\.woff2$/)?.[1] ?? 0);
    return `@font-face{font-family:Excalifont;font-display:swap;unicode-range:${ranges[index]};src:url(data:font/woff2;base64,${btoa(binary)}) format("woff2")}`;
  })).then(rules => rules.join('')).catch(() => '');
  return embedded;
}
/**
 * Render the board as a PNG: a clean copy of the live SVG (no animation state or highlight rings), cropped
 * to its content on white paper. Presentation attributes carry every style, so the copy needs no CSS.
 */
export async function exportSvg(svg: SVGSVGElement | null, elements: LaidElement[]): Promise<string> {
  if (!svg) throw new Error('No board');
  const content = sceneBounds(elements) ?? { x: 0, y: 0, width: canvas.width, height: canvas.height }, pad = 40;
  const box = { x: content.x - pad, y: content.y - pad, width: content.width + pad * 2, height: content.height + pad * 2 };
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.querySelectorAll('[style]').forEach(node => node.removeAttribute('style'));
  copy.querySelectorAll('[clip-path]').forEach(node => node.removeAttribute('clip-path'));
  copy.querySelectorAll('.board-ring').forEach(node => node.remove());
  copy.querySelectorAll('[data-transient], [data-kind="erase"]').forEach(node => node.remove());
  copy.querySelectorAll('[data-el]').forEach(node => { node.removeAttribute('opacity'); node.removeAttribute('class'); });
  copy.removeAttribute('class');
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copy.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);
  copy.setAttribute('width', String(box.width)); copy.setAttribute('height', String(box.height));
  const fonts = await fontStyle();
  if (fonts) { const style = document.createElementNS('http://www.w3.org/2000/svg', 'style'); style.textContent = fonts; copy.prepend(style); }
  return new XMLSerializer().serializeToString(copy);
}
export async function exportPng(svg: SVGSVGElement | null, elements: LaidElement[], maxSide = 4096): Promise<Uint8Array> {
  const source = await exportSvg(svg, elements), content = sceneBounds(elements) ?? canvas, scale = Math.min(2, maxSide / Math.max(content.width + 80, content.height + 80));
  const width = Math.max(1, Math.round((content.width + 80) * scale)), height = Math.max(1, Math.round((content.height + 80) * scale));
  const image = new Image();
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source);
  await image.decode();
  const out = new OffscreenCanvas(width, height), context = out.getContext('2d');
  if (!context) throw new Error('Canvas unavailable');
  context.fillStyle = svg?.dataset.paper ?? '#ffffff'; context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return new Uint8Array(await (await out.convertToBlob({ type: 'image/png' })).arrayBuffer());
}
