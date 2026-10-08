// The real bundled main/preload/React panel; isolated profile, no provider traffic.
const { app, BrowserWindow, dialog, session } = require('electron');
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
    const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kite-export-test-'));
    const saved = path.join(saveDir, 'copy.pdf');
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: saved });
    await click(panel, 'Save a copy');
    await until(() => fs.existsSync(saved), Boolean, 'saved native artifact');
    assert.equal(fs.readFileSync(saved).subarray(0, 5).toString(), '%PDF-');
    await click(panel, 'Save a copy');
    await until(() => evaluate(panel, "document.querySelector('[role=alert]')?.textContent || ''"), s => s.includes('does not overwrite'), 'exclusive save rejects overwrite');
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
