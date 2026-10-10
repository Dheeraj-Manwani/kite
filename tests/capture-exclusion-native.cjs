// A synthetic green screen and pink overlay test exclusion without saving desktop content.
const {app,BrowserWindow,desktopCapturer,screen}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'kite-exclusion-')));
require('./register.cjs');
const {protectedCapture}=require('../src/main/vision/captureCore.ts');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const timeout=setTimeout(()=>{console.error('Exclusion fixture timed out');app.exit(1);},25000);
app.whenReady().then(async()=>{
  let fixture,overlay;
  try {
    const d=screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    fixture=new BrowserWindow({...d.bounds,frame:false,show:false,focusable:false,skipTaskbar:true,alwaysOnTop:true,backgroundColor:'#00ee00'});
    await fixture.loadURL('data:text/html,<html style="background:%2300ee00"></html>');fixture.showInactive();fixture.setBounds(d.bounds);
    overlay=new BrowserWindow({...d.bounds,transparent:true,frame:false,show:false,focusable:false,skipTaskbar:true,alwaysOnTop:true,backgroundColor:'#00000000'});
    await overlay.loadURL('data:text/html,<html><body style="margin:0;background:transparent"><div style="position:absolute;left:45%;top:45%;width:10%;height:10%;background:%23ff00ff"></div></body></html>');
    overlay.setAlwaysOnTop(true,'screen-saver');overlay.showInactive();overlay.setBounds(d.bounds);overlay.moveTop();await delay(600);
    const capture=async()=>{
      const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:Math.round(d.bounds.width*d.scaleFactor),height:Math.round(d.bounds.height*d.scaleFactor)}});
      const image=sources.find(s=>s.display_id===String(d.id)).thumbnail;
      const bytes=image.toBitmap(),size=image.getSize(),offset=4*(Math.floor(size.height/2)*size.width+Math.floor(size.width/2));
      return {r:bytes[offset+2],g:bytes[offset+1],b:bytes[offset]};
    };
    const before=await capture();assert.ok(before.r>200&&before.b>200&&before.g<60,JSON.stringify(before));
    const during=await protectedCapture({keepVisible:true,protect:v=>overlay.setContentProtection(v),hide:async()=>assert.fail('must never hide'),wait:()=>delay(160),capture:async()=>{
      assert.equal(overlay.isVisible(),true);assert.equal(await overlay.webContents.executeJavaScript("getComputedStyle(document.querySelector('div')).opacity"),'1');
      return capture();
    }});
    assert.ok(during.g>180&&during.r<60&&during.b<60,'Visible overlay excluded: '+JSON.stringify(during));
    assert.equal(overlay.isContentProtected(),false);await delay(160);
    const after=await capture();assert.ok(after.r>200&&after.b>200&&after.g<60,JSON.stringify(after));
    console.log(`PASS temporary protection excludes a visible overlay and restores ordinary recording (${d.scaleFactor}x). Production hiding fallback remains enabled.`);
  } catch(error) {console.error(error);process.exitCode=1;}
  finally {clearTimeout(timeout);overlay?.destroy();fixture?.destroy();app.exit(process.exitCode||0);}
});
