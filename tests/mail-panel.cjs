// Real bundled app/React/preload/IPC; redirect provider transport and browser only to a synthetic fixture.
const { app, BrowserWindow, dialog, shell } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createMailFixture } = require('./mail-fixture.cjs');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kite-mail-panel-')); app.setPath('userData', profile); process.env.KITE_TEST_MODE = '1';
const errors = []; dialog.showErrorBox = (title, message) => errors.push(`${title}: ${message}`);
app.on('browser-window-created', (_e, win) => win.setOpacity(0));
const timeout = setTimeout(() => { console.error('Mail panel timed out'); app.exit(1); }, 45000);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, predicate, label) { for (let i = 0; i < 200; i++) { const result = await read(); if (predicate(result)) return result; await wait(50); } throw new Error(`Timed out: ${label}`); }
const evaluate = async (win, js) => { try { return await win.webContents.executeJavaScript(js); } catch (error) { throw new Error('Panel evaluation: ' + js, { cause: error }); } };
const click = (win, label) => evaluate(win, `(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(label)}); if (!b || b.disabled) throw new Error('Missing/disabled button: ' + ${JSON.stringify(label)}); b.click(); })()`);
const setValue = (win, selector, value, type = 'input') => evaluate(win, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event(${JSON.stringify(type)}, { bubbles: true })); })()`);
(async () => {
  const fixture = await createMailFixture(); const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (url, options) => ['gmail.googleapis.com', 'oauth2.googleapis.com'].includes(new URL(url).hostname) ? fixture.transport(url, options) : originalFetch(url, options);
  let source;
  shell.openExternal = async url => { if (url.startsWith('https://accounts.google.com/')) return fixture.openBrowser(url); source = url; };
  const client = path.join(profile, 'client.json'); fs.writeFileSync(client, JSON.stringify({ installed: { client_id: 'fixture-client.apps.googleusercontent.com', client_secret: 'fixture-client-private-value' } }));
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [client] });
  require('../.vite/build/main.js');
  app.whenReady().then(async () => {
    try {
      const overlay = BrowserWindow.getAllWindows()[0]; if (overlay.webContents.isLoading()) await new Promise(resolve => overlay.webContents.once('did-finish-load', resolve));
      assert.equal(await evaluate(overlay, 'window.kite.mailState()'), null, 'overlay cannot read account credentials/identity');
      await evaluate(overlay, "window.kite.openView('agents')");
      let panel = await until(() => BrowserWindow.getAllWindows().find(w => w !== overlay && w.webContents.getURL().includes('agents')), Boolean, 'agents window');
      await until(() => evaluate(panel, "[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Import Google client' && !b.disabled)"), Boolean, 'mail controls');
      await evaluate(panel, "document.querySelector('.agents-mail-accounts').open = true");
      await click(panel, 'Import Google client'); await until(() => evaluate(panel, 'window.kite.mailState()'), s => s?.configured, 'client imported');
      await click(panel, 'Connect Gmail');
      const accountState = await until(() => evaluate(panel, 'window.kite.mailState()'), s => s?.accounts.length === 1 && !s.connecting, 'system browser OAuth');
      const account = accountState.accounts[0]; assert.equal(account.email, 'alpha@kite.test'); assert.ok(!JSON.stringify(accountState).includes('refresh')); assert.ok(!JSON.stringify(accountState).includes('clientSecret'));
      await click(panel, 'New run'); await setValue(panel, '[aria-label="Document task"]', 'inbox_briefing', 'change');
      await until(() => evaluate(panel, "!!document.querySelector('[aria-label=\"Mail account\"]')"), Boolean, 'mail composer');
      await setValue(panel, '[aria-label="Mail account"]', account.id, 'change'); await setValue(panel, '[aria-label="Mail search"]', 'in:inbox');
      await evaluate(panel, "document.querySelector('.agents-mail-options input[type=checkbox]').click()"); await click(panel, 'Start run');
      const pending = await until(() => evaluate(overlay, 'window.kite.backgroundSnapshot()'), s => s.runs[0]?.request?.kind === 'approval', 'explicit mail approval');
      assert.ok(!fixture.calls.some(c => c.path.endsWith('/messages')), 'no mailbox read before run approval');
      panel.close(); await wait(50); await evaluate(overlay, "window.kite.openView('agents')");
      panel = await until(() => BrowserWindow.getAllWindows().find(w => w !== overlay && w.webContents.getURL().includes('agents')), Boolean, 'reopened panel');
      await until(() => evaluate(panel, "!!document.querySelector('.agents-run-item')"), Boolean, 'durable run');
      await evaluate(panel, "document.querySelector('.agents-run-item').click()");
      await until(() => evaluate(panel, "!!document.querySelector('.agents-request')"), Boolean, 'restored approval'); await click(panel, 'Approve this mail search');
      const completed = await until(() => evaluate(overlay, 'window.kite.backgroundSnapshot()'), s => s.runs.find(r => r.id === pending.runs[0].id)?.status === 'succeeded', 'briefing completion');
      assert.equal(completed.runs[0].artifacts.length, 2); await until(() => evaluate(panel, "document.querySelectorAll('.agents-mail-message').length"), n => n === 2, 'source cards');
      assert.equal(await evaluate(panel, "document.querySelectorAll('.agents-briefing img, .agents-briefing script').length"), 0);
      await click(panel, 'Open source in Gmail'); await until(() => source, Boolean, 'safe source URL'); assert.ok(source.startsWith('https://mail.google.com/mail/u/?authuser=alpha%40kite.test#all/'));
      const copy = path.join(profile, 'attachment-copy.txt'); dialog.showSaveDialog = async () => ({ canceled: false, filePath: copy });
      await until(() => evaluate(panel, "!!document.querySelectorAll('.agents-artifact')[1]?.querySelector('button:last-child:not(:disabled)')"), Boolean, 'attachment action ready');
      await evaluate(panel, "document.querySelectorAll('.agents-artifact')[1].querySelector('button:last-child').click()");
      await until(() => fs.existsSync(copy), Boolean, 'attachment export'); assert.deepEqual(fs.readFileSync(copy), fixture.attachment);
      fs.mkdirSync('out', { recursive: true }); fs.writeFileSync('out/mail-panel.png', (await panel.webContents.capturePage()).toPNG());
      await evaluate(panel, "document.querySelector('.agents-mail-accounts').open = true"); await click(panel, 'Disconnect');
      await until(() => evaluate(panel, 'window.kite.mailState()'), s => s.accounts[0].status === 'disconnected', 'local disconnect');
      const stateAfter = await evaluate(panel, 'window.kite.backgroundSnapshot()'); assert.equal(stateAfter.runs[0].status, 'succeeded', 'completed outputs retained after disconnect');
      assert.equal(fixture.state.deniedWrites, 0); assert.deepEqual(errors, []); console.log('PASS mail panel: native config import, system-browser OAuth fixture, private IPC, account/search selection, approval close/reopen, local briefing/source cards, inert text, attachment export and disconnect');
      fixture.close(); clearTimeout(timeout); app.quit();
    } catch (error) { console.error(error); fixture.close(); clearTimeout(timeout); app.exit(1); }
  });
})().catch(error => { console.error(error); clearTimeout(timeout); app.exit(1); });
