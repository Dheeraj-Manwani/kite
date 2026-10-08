import type { PdfStyle } from '../../../shared/background';

export const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
/** Source text only: no HTML, links, JavaScript, remote fonts, or model-written CSS enter the print page. */
export function textPdfHtml(name: string, text: string, style: PdfStyle) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(name)}</title><style>
    @page { size: A4; margin: 18mm; } * { box-sizing: border-box; }
    body { color: #202025; font-family: 'Segoe UI', Arial, sans-serif; font-size: ${style === 'compact' ? 10 : 12}pt; line-height: 1.55; }
    h1 { font-size: 20pt; margin: 0 0 16pt; line-height: 1.2; overflow-wrap: anywhere; }
    pre { font: inherit; white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; tab-size: 4; }
  </style></head><body><h1>${escapeHtml(name.replace(/\.(txt|md)$/i, ''))}</h1><pre>${escapeHtml(text)}</pre></body></html>`;
}
