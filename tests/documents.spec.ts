import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDFDocument, PDFName, StandardFonts, rgb } from 'pdf-lib';
import { documentJob, plainPdf } from '../src/main/background/executors/documentCore';
import type { DocumentOutput } from '../src/main/background/executors/documentTypes';
import { agentDraftSchema, startRunSchema } from '../src/shared/background';

const requestId = 'c29cfcaa-6bc4-4c35-bf48-6722ab56cc3e';
async function fixture() {
  const pdf = await PDFDocument.create({ updateMetadata: false }), font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 12; i++) { const page = pdf.addPage([400 + i, 600]); page.drawText(`Page ${i + 1}: exact source stays unchanged`, { x: 35, y: 520, size: 15, font }); page.drawRectangle({ x: 35, y: 400, width: 150, height: 70, color: rgb(0.1, 0.7, 0.3) }); }
  return pdf;
}
describe('phase 2 document workflows', () => {
  it('losslessly shrinks structural overhead, parses object-stream pages, and reports an unmet target', async () => {
    const pdf = await fixture(), bytes = await pdf.save({ useObjectStreams: false }), original = Buffer.from(bytes);
    const result = await documentJob({ action: 'optimize', kind: 'pdf', bytes, targetBytes: 1024 }) as DocumentOutput;
    expect(result.pages).toBe(12); expect(result.bytes.length).toBeLessThan(bytes.length);
    expect(result.optimization.savedBytes).toBe(bytes.length - result.bytes.length);
    expect(result.optimization.targetMet).toBe(false); expect(result.optimization.changed).toBe(true);
    expect(Buffer.from(bytes)).toEqual(original);
    const checked = await plainPdf(result.bytes); expect(checked.getPageCount()).toBe(12);
    expect(checked.getPages().map(p => p.getWidth())).toEqual(Array.from({ length: 12 }, (_, i) => 400 + i));
  });
  it('never publishes a larger rewrite and accurately reports no reduction', async () => {
    const pdf = await fixture(), original = await pdf.save({ useObjectStreams: true, objectsPerTick: 100 });
    const result = await documentJob({ action: 'optimize', kind: 'pdf', bytes: original, targetBytes: 20000 }) as DocumentOutput;
    expect(result.bytes.length).toBeLessThanOrEqual(original.length);
    expect(result.optimization.targetMet).toBe(true);
    const repeated = await documentJob({ action: 'optimize', kind: 'pdf', bytes: result.bytes }) as DocumentOutput;
    expect(repeated.optimization.changed).toBe(false); expect(Buffer.from(repeated.bytes)).toEqual(Buffer.from(result.bytes));
  });
  it('rejects malformed, signed, interactive and page-limit inputs with concrete reasons', async () => {
    await expect(documentJob({ action: 'inspect', kind: 'pdf', bytes: Buffer.from('%PDF-1.7\ninvalid document\n%%EOF') })).rejects.toMatchObject({ code: 'invalid' });
    const signed = await fixture(); signed.context.register(signed.context.obj({ Type: 'Sig', ByteRange: [0, 10, 30, 80] }));
    await expect(plainPdf(await signed.save())).rejects.toMatchObject({ code: 'signed' });
    const scripted = await fixture(); scripted.catalog.set(PDFName.of('OpenAction'), scripted.context.obj({ S: 'JavaScript', JS: 'fetch("https://example.com")' }));
    await expect(plainPdf(await scripted.save())).rejects.toMatchObject({ code: 'interactive' });
    const forms = await fixture(); forms.getForm().createTextField('name').addToPage(forms.getPages()[0]);
    await expect(plainPdf(await forms.save())).rejects.toMatchObject({ code: 'interactive' });
    const large = await PDFDocument.create(); for (let i = 0; i < 201; i++) large.addPage();
    await expect(plainPdf(await large.save())).rejects.toMatchObject({ code: 'limits' });
  });
  it('converts supported RGB and alpha images to parseable single-page PDFs', async () => {
    for (const name of ['rgb.png', 'rgba.png', 'rgb.jpg']) {
      const bytes = readFileSync(`tests/fixtures/documents/${name}`), original = Buffer.from(bytes), kind = name.endsWith('.png') ? 'png' : 'jpeg';
      const result = await documentJob({ action: 'convert', kind, bytes }) as DocumentOutput;
      expect(result.pages).toBe(1); expect((await plainPdf(result.bytes)).getPageCount()).toBe(1); expect(bytes).toEqual(original);
    }
    const corrupt = readFileSync('tests/fixtures/documents/rgb.png'); corrupt[30] ^= 1;
    await expect(documentJob({ action: 'convert', kind: 'png', bytes: corrupt })).rejects.toMatchObject({ code: 'invalid' });
    await expect(documentJob({ action: 'convert', kind: 'jpeg', bytes: readFileSync('tests/fixtures/documents/cmyk.jpg') })).rejects.toMatchObject({ code: 'image' });
  });
  it('binds targets to optimization and accepts versioned document helpers only', () => {
    expect(startRunSchema.safeParse({ requestId, title: 'Small PDF', workflow: 'pdf_optimize', targetBytes: 1024 }).success).toBe(true);
    expect(startRunSchema.safeParse({ requestId, title: 'Target', workflow: 'document_pdf', targetBytes: 1024 }).success).toBe(false);
    expect(agentDraftSchema.safeParse({ name: 'PDF helper', instructions: '', workflow: 'pdf_optimize', style: 'readable', targetBytes: 100000 }).success).toBe(true);
    expect(agentDraftSchema.safeParse({ name: 'Unsafe', instructions: '', workflow: 'shell', style: 'readable' }).success).toBe(false);
  });
});
