// Run after npm run package. Temporarily covers the cursor's display with a synthetic
// green fixture, so the explicit dev capture test never saves the user's desktop.
const { app, BrowserWindow, desktopCapturer, screen, session, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'kite-capture-test-')));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const timeout = setTimeout(() => { console.error('Capture test timed out'); app.exit(1); }, 25000);
app.whenReady().then(() => {
  const original = session.defaultSession.setPermissionRequestHandler.bind(session.defaultSession);
  session.defaultSession.setPermissionRequestHandler = () => original((_w, _p, cb) => cb(false));
});
require('../.vite/build/main.js');
app.whenReady().then(async () => {
  let background;
  try {
    const overlay = BrowserWindow.getAllWindows()[0];
    if (overlay.webContents.isLoading()) await new Promise(resolve => overlay.webContents.once('did-finish-load', resolve));
    const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    background = new BrowserWindow({ ...d.bounds, frame: false, show: false, focusable: false, skipTaskbar: true, alwaysOnTop: true, backgroundColor: '#00ee00' });
    await background.loadURL('data:text/html,<html style="background:%2300ee00"></html>');
    background.showInactive(); background.setBounds(d.bounds); overlay.setAlwaysOnTop(true, 'screen-saver'); overlay.showInactive(); overlay.moveTop();
    const origin = overlay.getBounds();
    const x = d.bounds.x + Math.floor(d.bounds.width / 2), y = d.bounds.y + Math.floor(d.bounds.height / 2);
    await overlay.webContents.executeJavaScript(`(()=>{const marker=document.createElement('div');marker.style.cssText='position:absolute;left:${x-origin.x-40}px;top:${y-origin.y-40}px;width:80px;height:80px;background:#ff00ff;z-index:999999';document.querySelector('.overlay').append(marker);})()`);
    const capture = async () => {
      const sources = await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:Math.round(d.bounds.width*d.scaleFactor),height:Math.round(d.bounds.height*d.scaleFactor)}});
      return sources.find(s=>s.display_id===String(d.id)).thumbnail;
    };
    const pixel = (image, dx = 0) => {
      const b=image.toBitmap(), w=image.getSize().width;
      const offset=4*(Math.floor((y-d.bounds.y)*d.scaleFactor)*w+Math.floor((x+dx-d.bounds.x)*d.scaleFactor));
      return {r:b[offset+2],g:b[offset+1],b:b[offset]};
    };
    await delay(600);
    const baseline=await capture();
    const fixture=pixel(baseline,100);assert.ok(fixture.g>180&&fixture.r<60&&fixture.b<60,`Background fixture must be visible: ${JSON.stringify(fixture)}`);
    const before=pixel(baseline);
    assert.ok(before.r>200&&before.b>200&&before.g<60,`Probe should be visible before capture: ${JSON.stringify(before)}`);
    const result=await overlay.webContents.executeJavaScript('window.kite.testCapture()');
    assert.equal(result.ok,true,result.error);
    const during=pixel(nativeImage.createFromPath(result.path));
    assert.ok(during.g>180&&during.r<60&&during.b<60,`Kite must be excluded: ${JSON.stringify(during)}`);
    await delay(250);
    const after=pixel(await capture());
    assert.ok(after.r>200&&after.b>200&&after.g<60,`Normal capture must see overlay again: ${JSON.stringify(after)}`);
    assert.equal(fs.existsSync(path.join(app.getPath('userData'),'screens')),false);
    console.log(`PASS real desktop capture excludes overlay and restores normal visibility (${d.scaleFactor}x). Fixture PNG: ${result.path}`);
  } catch(error) { console.error(error); process.exitCode=1; }
  finally { clearTimeout(timeout); background?.destroy(); app.exit(process.exitCode || 0); }
});
