const { app } = require('electron');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { PDFDocument, StandardFonts } = require('pdf-lib');
require('./register.cjs');
const { DocumentPreview } = require('../src/main/background/preview.ts');
app.on('window-all-closed', () => {});
const timeout = setTimeout(() => app.exit(1), 20000);
app.whenReady().then(async () => {
  const manager = new DocumentPreview();
  try {
    const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
    pdf.addPage([500, 700]).drawText('Kite document preview', { x: 30, y: 600, font });
    const win = await manager.open(await pdf.save(), 'fixture.pdf');
    let visible = false;
    for (let n = 0; n < 60; n++) {
      await new Promise(r => setTimeout(r, 100));
      const capture = await win.webContents.capturePage().catch(() => null); if (!capture) continue; const pixels = capture.toBitmap();
      let white = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 245 && pixels[i + 1] > 245 && pixels[i + 2] > 245) white++;
      if (white > pixels.length / 4 * .2) {
        fs.mkdirSync('out', { recursive: true }); fs.writeFileSync('out/background-preview.png', capture.toPNG()); visible = true; break;
      }
    }
    assert.equal(visible, true, 'PDF page must actually render, not just open a blank window');
    assert.equal(await win.webContents.executeJavaScript("typeof window.kite === 'undefined' && typeof require === 'undefined'"), true);
    assert.equal(await win.webContents.executeJavaScript("fetch('https://example.com').then(()=>false,()=>true)"), true);
    console.log('PASS isolated PDF preview: visible page, no privileged APIs, external network denied');
    manager.close(); clearTimeout(timeout); app.quit();
  } catch (e) { console.error(e); manager.close(); clearTimeout(timeout); app.exit(1); }
});


