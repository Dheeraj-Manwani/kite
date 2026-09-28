// Run after `npm run package`: exercise the real bundled main entry, not just TS modules.
const { app, BrowserWindow, dialog, session } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'kite-startup-test-')));
const errors = [];
dialog.showErrorBox = (title, message) => errors.push(`${title}: ${message}`);
app.on('browser-window-created', (_event, win) => {
  win.setOpacity(0);
  win.webContents.on('did-fail-load', (_e, code, description) => errors.push(`Renderer ${code}: ${description}`));
});
// Tests never activate a microphone or use the user's settings/credentials.
app.whenReady().then(() => {
  const original = session.defaultSession.setPermissionRequestHandler.bind(session.defaultSession);
  session.defaultSession.setPermissionRequestHandler = () => original((_wc, _permission, callback) => callback(false));
});
const timeout = setTimeout(() => { console.error('FAIL bundled main startup timed out'); app.exit(1); }, 15000);
try {
  require('../.vite/build/main.js');
  app.whenReady().then(async () => {
    try {
      // Main's readiness callback runs first and creates the overlay synchronously.
      const win = BrowserWindow.getAllWindows()[0];
      assert.ok(win, 'Bundled main must create the overlay');
      if (win.webContents.isLoading()) await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
      assert.deepEqual(errors, []);
      const result = await win.webContents.executeJavaScript('window.kite.getSettings()');
      assert.equal(result.settings.model.provider, 'moonshot');
      assert.equal(result.models.length >= 15, true);
      assert.equal(result.keys.cartesia, false);
      console.log('PASS bundled main loads, native voice service/tray starts, renderer/preload loads, settings IPC responds');
      clearTimeout(timeout); app.quit();
    } catch (error) { console.error(error); clearTimeout(timeout); app.exit(1); }
  });
} catch (error) { console.error(error); clearTimeout(timeout); app.exit(1); }
