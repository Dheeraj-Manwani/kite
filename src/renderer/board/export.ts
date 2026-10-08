import { canvas, sceneBounds, type LaidElement } from '../../shared/board';
// The page's Excalifont is invisible to an SVG drawn as an image, so the export carries its own copy.
const faces = import.meta.glob('../../../assets/fonts/excalifont/*.woff2', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
let embedded: Promise<string> | undefined;
function fontStyle() {
  embedded ??= Promise.all(Object.values(faces).map(async url => {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
    let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `@font-face{font-family:Excalifont;src:url(data:font/woff2;base64,${btoa(binary)}) format("woff2")}`;
  })).then(rules => rules.join('')).catch(() => '');
  return embedded;
}
/**
 * Render the board as a PNG: a clean copy of the live SVG (no animation state or highlight rings), cropped
 * to its content on white paper. Presentation attributes carry every style, so the copy needs no CSS.
 */
export async function exportPng(svg: SVGSVGElement | null, elements: LaidElement[]): Promise<Uint8Array> {
  if (!svg) throw new Error('No board');
  const content = sceneBounds(elements) ?? { x: 0, y: 0, width: canvas.width, height: canvas.height }, pad = 40;
  const box = { x: content.x - pad, y: content.y - pad, width: content.width + pad * 2, height: content.height + pad * 2 };
  const scale = Math.min(2, 4096 / Math.max(box.width, box.height));
  const width = Math.max(1, Math.round(box.width * scale)), height = Math.max(1, Math.round(box.height * scale));
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.querySelectorAll('[style]').forEach(node => node.removeAttribute('style'));
  copy.querySelectorAll('[clip-path]').forEach(node => node.removeAttribute('clip-path'));
  copy.querySelectorAll('.board-ring').forEach(node => node.remove());
  copy.removeAttribute('class');
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copy.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);
  copy.setAttribute('width', String(width)); copy.setAttribute('height', String(height));
  const fonts = await fontStyle();
  if (fonts) { const style = document.createElementNS('http://www.w3.org/2000/svg', 'style'); style.textContent = fonts; copy.prepend(style); }
  const image = new Image();
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(copy));
  await image.decode();
  const out = new OffscreenCanvas(width, height), context = out.getContext('2d');
  if (!context) throw new Error('Canvas unavailable');
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return new Uint8Array(await (await out.convertToBlob({ type: 'image/png' })).arrayBuffer());
}
