import { app } from 'electron';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { statSync } from 'original-fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { PDFDocument as PdfDocument } from 'pdf-lib';
import { DocumentExecutor } from './executors/documents';
import { PdfExecutor } from './executors/pdf';
import { DocumentPreview } from './preview';
import { hashOf, inspectPdf } from './artifacts';
import { backgroundHealth } from './health';

/** Synthetic fixtures through the packaged workers. No accounts, providers, or user files. */
export async function runDocumentSpike(directory: string) {
  await mkdir(directory, { recursive: true });
  const runtime = createRequire(path.join(__dirname, 'documentWorker.js'));
  const { PDFDocument, StandardFonts, PDFName, rgb } = runtime('pdf-lib') as typeof import('pdf-lib');
  const executor = new DocumentExecutor(), printer = new PdfExecutor(), preview = new DocumentPreview();
  const samples: unknown[] = [], workingSets: number[] = [], ticks: number[] = [];
  const timer = setInterval(() => { ticks.push(performance.now()); workingSets.push(app.getAppMetrics().reduce((n, p) => n + p.memory.workingSetSize, 0)); }, 20);
  const signal = new AbortController().signal, assets = path.join(app.getAppPath(), 'assets', 'document-fixtures');
  try {
    const source = await PDFDocument.create({ updateMetadata: false }), font = await source.embedFont(StandardFonts.Helvetica);
    const image = await source.embedJpg(await readFile(path.join(assets, 'rgb.jpg')));
    for (let i = 0; i < 15; i++) {
      const page = source.addPage([500 + i, 700]);
      page.drawText(`Page ${i + 1}: preserved text and image`, { x: 30, y: 620, font });
      page.drawRectangle({ x: 30, y: 520, width: 140, height: 40, color: rgb(.1, .7, .3) });
      page.drawImage(image, { x: 30, y: 100, width: 240, height: 240 });
    }
    const original = await source.save({ useObjectStreams: false }), hash = hashOf(original);
    await writeFile(path.join(directory, 'source.pdf'), original);
    const at = performance.now(), optimized = await executor.convert({ action: 'optimize', kind: 'pdf', bytes: original, targetBytes: 1024 }, signal);
    await writeFile(path.join(directory, 'optimized.pdf'), optimized.bytes);
    if (hashOf(original) !== hash || !optimized.optimization.changed || optimized.optimization.targetMet !== false) throw new Error('Optimization contract failed');
    samples.push({ name: 'optimized.pdf', ms: Math.round(performance.now() - at), ...inspectPdf(optimized.bytes, optimized.pages), optimization: optimized.optimization, originalUnchanged: true });
    const again = await executor.convert({ action: 'optimize', kind: 'pdf', bytes: optimized.bytes }, signal);
    if (again.optimization.changed || hashOf(again.bytes) !== hashOf(optimized.bytes)) throw new Error('No-growth contract failed');
    samples.push({ name: 'no-growth', ...again.optimization });
    for (const name of ['rgb.png', 'rgba.png', 'rgb.jpg']) {
      const bytes = await readFile(path.join(assets, name)), before = hashOf(bytes), start = performance.now();
      const result = await executor.convert({ action: 'convert', kind: name.endsWith('png') ? 'png' : 'jpeg', bytes }, signal);
      await writeFile(path.join(directory, `${name}.pdf`), result.bytes);
      if (before !== hashOf(bytes)) throw new Error('Original changed');
      samples.push({ name: `${name}.pdf`, ms: Math.round(performance.now() - start), ...inspectPdf(result.bytes, result.pages), originalUnchanged: true });
    }
    for (const name of ['text.txt', 'source.md']) {
      const text = name.endsWith('md') ? '# Source markup\n<script>fetch("https://example.com")</script>\n' : 'UTF-8: café, naïve, résumé.\n'.repeat(100);
      const bytes = await printer.convert({ name, text }, 'readable', signal);
      await writeFile(path.join(directory, `${name}.pdf`), bytes); samples.push({ name: `${name}.pdf`, ...inspectPdf(bytes) });
    }
    const failures: { name: string; code: string }[] = [];
    const reject = async (name: string, bytes: Uint8Array, kind: 'pdf' | 'jpeg', expected: string) => {
      try { await executor.inspect({ kind, bytes }); } catch (error) {
        const code = (error as { code?: string }).code;
        if (code !== expected) throw error; failures.push({ name, code }); return;
      }
      throw new Error(`Unexpected admission: ${name}`);
    };
    await reject('encrypted.pdf', await readFile(path.join(assets, 'encrypted.pdf')), 'pdf', 'protected');
    await reject('cmyk.jpg', await readFile(path.join(assets, 'cmyk.jpg')), 'jpeg', 'image');
    const special = async (name: string, edit: (pdf: PdfDocument) => void, code: string) => { const pdf = await PDFDocument.create(); pdf.addPage(); edit(pdf); await reject(name, await pdf.save(), 'pdf', code); };
    await special('signature.pdf', pdf => { pdf.context.register(pdf.context.obj({ Type: 'Sig', ByteRange: [0, 10, 30, 80] })); }, 'signed');
    await special('script.pdf', pdf => pdf.catalog.set(PDFName.of('OpenAction'), pdf.context.obj({ S: 'JavaScript', JS: 'alert(1)' })), 'interactive');
    const win = await preview.open(optimized.bytes, 'fixture.pdf');
    let visible = false;
    for (let i = 0; i < 50; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      const capture = await win.webContents.capturePage().catch((): null => null); if (!capture) continue;
      const pixels = capture.toBitmap(); let white = 0;
      for (let n = 0; n < pixels.length; n += 4) if (pixels[n] > 245 && pixels[n + 1] > 245 && pixels[n + 2] > 245) white++;
      if (white > pixels.length / 4 * .2) { await writeFile(path.join(directory, 'preview.png'), capture.toPNG()); visible = true; break; }
    }
    if (!visible) throw new Error('Blank preview');
    const offline = await win.webContents.executeJavaScript("fetch('https://example.com').then(()=>false,()=>true)");
    const unprivileged = await win.webContents.executeJavaScript("typeof window.kite === 'undefined' && typeof require === 'undefined'");
    if (!offline || !unprivileged) throw new Error('Preview isolation failed');
    const libraryRuntime = createRequire(runtime.resolve('pdf-lib/package.json'));
    const report = { at: new Date().toISOString(), platform: process.platform, architecture: process.arch, packaged: app.isPackaged, engines: backgroundHealth(), electron: process.versions.electron, dependencyVersions: { pako: libraryRuntime('pako/package.json').version }, archiveBytes: app.isPackaged ? statSync(path.join(path.dirname(app.getAppPath()), 'app.asar')).size : null, samples, failures, preview: { visible, offline, unprivileged }, sampledPeakWorkingSetKiB: Math.max(...workingSets), maximumMainTimerGapMs: Math.round(Math.max(...ticks.slice(1).map((t, i) => t - ticks[i]))), modelCalls: 0 };
    await writeFile(path.join(directory, 'phase2.json'), JSON.stringify(report, null, 2) + '\n'); return report;
  } finally { clearInterval(timer); preview.close(); executor.close(); printer.close(); }
}
