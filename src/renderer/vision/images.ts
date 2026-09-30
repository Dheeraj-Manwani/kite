import { analyzeStrokes, cropRect, dipToPixel, type DisplayInfo, type Stroke, type VisionImages } from '../../shared/vision';
import type { ScreenBounds } from '../../shared/types';
export async function prepareImages(png: Uint8Array, display: DisplayInfo, strokes: Stroke[], crop?: ScreenBounds): Promise<VisionImages> {
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(png)], { type: 'image/png' }));
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(bitmap, 0, 0);
    const analysis = analyzeStrokes(strokes);
    ctx.strokeStyle = '#ff00cf'; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    strokes.forEach((s, i) => {
      if (!s.length) return;
      ctx.beginPath();
      if (analysis.marks[i].markType === 'tap') { const p = dipToPixel(s[s.length - 1], display); ctx.arc(p.x, p.y, 16 * display.scaleFactor, 0, Math.PI * 2); }
      else s.forEach((point, j) => { const p = dipToPixel(point, display); if (!j) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      ctx.stroke();
    });
    const jpeg = async (rect: { x: number; y: number; width: number; height: number }) => {
      const ratio = Math.min(1, 1568 / Math.max(rect.width, rect.height));
      const out = new OffscreenCanvas(Math.max(1, Math.round(rect.width * ratio)), Math.max(1, Math.round(rect.height * ratio)));
      out.getContext('2d').drawImage(canvas, rect.x, rect.y, rect.width, rect.height, 0, 0, out.width, out.height);
      return new Uint8Array(await (await out.convertToBlob({ type: 'image/jpeg', quality: .85 })).arrayBuffer());
    };
    const whole = { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
    let area = whole;
    if (crop) {
      // Only the requested region (a task's window), clamped to this display.
      const p = dipToPixel(crop, display), x = Math.max(0, Math.floor(p.x)), y = Math.max(0, Math.floor(p.y));
      const width = Math.min(bitmap.width - x, Math.ceil(crop.width * display.scaleFactor)), height = Math.min(bitmap.height - y, Math.ceil(crop.height * display.scaleFactor));
      if (width > 8 && height > 8) area = { x, y, width, height };
    }
    const overview = await jpeg(area);
    return { overview, zoom: analysis.union ? await jpeg(cropRect(analysis.union, display, bitmap.width, bitmap.height)) : undefined };
  } finally { bitmap.close(); }
}
