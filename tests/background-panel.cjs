// The real bundled main/preload/React panel; isolated profile, no provider traffic.
const { app, BrowserWindow, dialog, session, shell } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'kite-panel-test-')));
process.env.KITE_TEST_MODE = '1';
const errors = [];
dialog.showErrorBox = (title, message) => errors.push(`${title}: ${message}`);
app.on('browser-window-created', (_e, win) => {
  win.setOpacity(0);
  win.webContents.on('did-fail-load', (_e, code, reason) => { if (code !== -3) errors.push(reason); });
});
app.whenReady().then(() => session.defaultSession.setPermissionRequestHandler((_wc, _permission, cb) => cb(false)));
const deadline = setTimeout(() => { console.error('FAIL background panel timed out'); app.exit(1); }, 45000);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, predicate, label) {
  for (let i = 0; i < 200; i++) { const value = await read(); if (predicate(value)) return value; await wait(50); }
  throw new Error(`Timed out: ${label}`);
}
const evaluate = async (win, code) => { try { return await win.webContents.executeJavaScript(code); } catch (error) { throw new Error(`Panel evaluation failed: ${code}`, { cause: error }); } };
const click = (win, label) => evaluate(win, `(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(label)}); if (!b) throw new Error('Missing button'); b.click(); })()`);
async function openPanel(overlay) {
  await evaluate(overlay, "window.kite.openView('agents')");
  const win = await until(() => BrowserWindow.getAllWindows().find(w => w !== overlay && w.webContents.getURL().includes('agents')), Boolean, 'panel window');
  await until(() => evaluate(win, "!!document.querySelector('.agents-view')"), Boolean, 'React agents view');
  return win;
}
require('../.vite/build/main.js');
app.whenReady().then(async () => {
  try {
    const overlay = BrowserWindow.getAllWindows()[0];
    if (overlay.webContents.isLoading()) await new Promise(resolve => overlay.webContents.once('did-finish-load', resolve));
    let panel = await openPanel(overlay);
    await until(() => evaluate(panel, "document.querySelector('.agents-heading button').disabled"), v => v === false, 'runtime snapshot');
    // Use real UI to enqueue an input request, then close its only panel.
    await click(panel, 'New run');
    await click(panel, 'Start run');
    const run = await until(() => evaluate(overlay, 'window.kite.backgroundSnapshot()'), s => s.runs.length === 1 && s.runs[0].status === 'waiting_user', 'durable input request');
    const id = run.runs[0].id;
    panel.close();
    await until(() => panel.isDestroyed(), Boolean, 'closed panel');
    panel = await openPanel(overlay);
    await until(() => evaluate(panel, "document.querySelectorAll('.agents-run-item').length"), n => n === 1, 'restored run list');
    await evaluate(panel, "document.querySelector('.agents-run-item').click()");
    await until(() => evaluate(panel, "!!document.querySelector('.agents-request textarea')"), Boolean, 'restored question');
    await evaluate(panel, `(() => { const t = document.querySelector('.agents-request textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(t, ${JSON.stringify('A restored run\n\nKite keeps this document on this PC.')}); t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await until(() => evaluate(panel, "[...document.querySelectorAll('button')].find(b=>b.textContent==='Continue run').disabled"), v => v === false, 'input enabled');
    await click(panel, 'Continue run');
    panel.close();
    const completed = await until(() => evaluate(overlay, 'window.kite.backgroundSnapshot()'), s => s.runs.find(r => r.id === id)?.status === 'succeeded', 'background completion with panel closed');
    assert.equal(completed.runs[0].artifacts.length, 1);
    assert.equal(completed.runs[0].modelCalls, 0);
    panel = await openPanel(overlay);
    await click(panel, 'Completed');
    await until(() => evaluate(panel, "!!document.querySelector('.agents-run-item')"), Boolean, 'completed run');
    await evaluate(panel, "document.querySelector('.agents-run-item').click()");
    await until(() => evaluate(panel, "document.querySelectorAll('.agents-artifact').length"), n => n === 1, 'verified artifact in UI');
    await click(panel, 'Preview');
    const preview = await until(() => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('https://kite-preview.invalid/')), Boolean, 'in-app PDF preview');
    await wait(1500);
    const previewPreferences = preview.webContents.getLastWebPreferences();
    assert.equal(!!previewPreferences.preload, false, 'preview has no privileged preload');
    assert.equal(previewPreferences.nodeIntegration, false);
    assert.equal(await evaluate(preview, "typeof window.kite === 'undefined' && typeof require === 'undefined'"), true);
    assert.equal(await evaluate(preview, "fetch('https://example.com').then(()=>false,()=>true)"), true, 'preview session rejects external network');
    const page = await preview.webContents.capturePage(), pixels = page.toBitmap(); let white = 0; for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 245 && pixels[i + 1] > 245 && pixels[i + 2] > 245) white++; assert.ok(white > pixels.length / 4 * .2, 'preview renders the PDF page');
    fs.mkdirSync('out', { recursive: true }); fs.writeFileSync('out/background-preview.png', page.toPNG());
    preview.close();
    let revealed;
    shell.showItemInFolder = filename => { revealed = filename; };
    await click(panel, 'Show in folder'); await until(() => revealed, Boolean, 'verified artifact reveal');
    assert.ok(revealed.endsWith('.pdf'));
    const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kite-export-test-'));
    const saved = path.join(saveDir, 'copy.pdf');
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: saved });
    await click(panel, 'Save a copy');
    await until(() => fs.existsSync(saved), Boolean, 'saved native artifact');
    assert.equal(fs.readFileSync(saved).subarray(0, 5).toString(), '%PDF-');
    await click(panel, 'Save a copy');
    await until(() => evaluate(panel, "document.querySelector('[role=alert]')?.textContent || ''"), s => s.includes('does not overwrite'), 'exclusive save rejects overwrite');
    // Exercise the new optimizer through React, trusted native selection and the real binary worker.
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [saved] });
    await click(panel, 'New run');
    await evaluate(panel, "(() => { const s = document.querySelector('[aria-label=\"Document task\"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'pdf_optimize'); s.dispatchEvent(new Event('change', { bubbles: true })); })()");
    await until(() => evaluate(panel, "!!document.querySelector('input[type=number]')"), Boolean, 'optimizer target');
    await evaluate(panel, "(() => { const t = document.querySelector('input[type=number]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(t, '0.001'); t.dispatchEvent(new Event('input', { bubbles: true })); })()");
    await click(panel, 'Choose files');
    await until(() => evaluate(panel, "document.querySelectorAll('.agents-chosen-files li').length"), n => n === 1, 'chosen PDF admitted');
    await click(panel, 'Start run');
    const optimized = await until(() => evaluate(overlay, 'window.kite.backgroundSnapshot()'), s => s.runs.some(r => r.workflow === 'pdf_optimize' && r.status === 'succeeded'), 'optimizer completes');
    const optimizedRun = optimized.runs.find(r => r.workflow === 'pdf_optimize'); assert.equal(optimizedRun.artifacts[0].optimization.targetMet, false);
    await until(() => evaluate(panel, "document.querySelector('.agents-size-report')?.textContent || ''"), text => text.includes('Target not met'), 'measured target result in UI');
    assert.equal(fs.readFileSync(saved).length, completed.runs[0].artifacts[0].bytes, 'selected original untouched');
    await click(panel, 'My agents');
    await click(panel, 'Create agent');
    await evaluate(panel, `(() => { const t = document.querySelector('.agents-composer input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(t, 'My PDF helper'); t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await until(() => evaluate(panel, "[...document.querySelectorAll('button')].find(b=>b.textContent==='Save agent').disabled"), v => v === false, 'agent name');
    await click(panel, 'Save agent');
    await until(() => evaluate(overlay, 'window.kite.backgroundSnapshot()'), s => s.agents.some(a => a.name === 'My PDF helper'), 'saved definition');
    await click(panel, 'Completed');
    await evaluate(panel, "document.querySelector('.agents-run-item').click()");
    await until(() => evaluate(panel, "document.querySelectorAll('.agents-artifact').length"), n => n === 1, 'selected artifact');
    await wait(250);
    fs.mkdirSync('out', { recursive: true });
    fs.writeFileSync('out/background-panel.png', (await panel.webContents.capturePage()).toPNG());
    assert.deepEqual(errors, []);
    console.log('PASS real panel: create run, persisted input, close/reopen, background completion, artifact export, overwrite denial, saved agent');
    clearTimeout(deadline); app.quit();
  } catch (error) { console.error(error); clearTimeout(deadline); app.exit(1); }
});
