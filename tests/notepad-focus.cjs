// Interactive Windows acceptance fixture: focus a blank Notepad tab, then click Do it.
// Uses Kite's focusable:false BrowserWindow setting and the real type_text tool.
const {app,BrowserWindow,ipcMain,clipboard}=require('electron');
const {uIOhook,UiohookKey}=require('uiohook-napi');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const assert=require('node:assert/strict');
require('./register.cjs');
const {typeText}=require('../src/main/tools/impl/type_text.ts');
const {electronClipboard}=require('../src/main/tools/electronClipboard.ts');
const {ToolSession}=require('../src/main/tools/registry.ts');
const {ApprovalBroker}=require('../src/main/tools/approval.ts');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kite-focus-'));app.setPath('userData',dir);
const preload=path.join(dir,'preload.cjs');fs.writeFileSync(preload,"require('electron').contextBridge.exposeInMainWorld('focusTest',{approve:()=>require('electron').ipcRenderer.invoke('approve')});");
app.whenReady().then(async()=>{
  const win=new BrowserWindow({title:'Kite Notepad focus test',x:80,y:80,width:490,height:250,frame:false,backgroundColor:'#fff5fb',alwaysOnTop:true,skipTaskbar:true,focusable:false,show:false,webPreferences:{preload,sandbox:true,contextIsolation:true,backgroundThrottling:false}});
  await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<html><body style="background:#fff5fb;color:#222;font:18px Segoe UI;padding:24px;border:2px solid pink;border-radius:18px"><strong>Kite Notepad focus test</strong><p>Paste "meeting at 5" into the focused app?</p><button style="padding:12px" onclick="window.focusTest.approve().then(r=>document.getElementById(\'result\').textContent=r)">✓ Do it</button><p id="result">Focus a blank Notepad tab first.</p></body></html>'));
  const abort=new AbortController();const broker=new ApprovalBroker(()=>{},()=>{});
  const audit={beginTool:()=>1,finishTool:()=>{},recentTools:()=>[]};
  const tool=typeText(electronClipboard,()=>uIOhook.keyTap(UiohookKey.V,[UiohookKey.Ctrl]));
  const session=new ToolSession({definitions:[tool],broker,audit,messageId:null,context:{dryRun:false,signal:abort.signal},activity:()=>{},changed:()=>{},event:()=>{}});
  ipcMain.handle('approve',async()=>{
    try {
      assert.equal(win.isFocused(),false,'overlay must not take focus');
      const before=await clipboard.readText();
      const approval=session.approve('focus','type_text',{text:'meeting at 5'},true);
      broker.decide(broker.current.approvalId,true);assert.equal(await approval,true);
      const result=await session.tools().type_text.execute({text:'meeting at 5'},{toolCallId:'focus'});
      assert.equal(result.ok,true);assert.equal(await clipboard.readText(),before,'clipboard text restored');
      assert.equal(win.isFocused(),false);console.log('PASS real approval click kept overlay unfocused; native paste sent; clipboard restored. Verify Notepad contains meeting at 5.');
      setTimeout(()=>app.quit(),4000);return 'Paste sent; clipboard restored.';
    }catch(e){console.error(e);return 'Test failed: '+e.message;}
  });
  win.showInactive();win.setAlwaysOnTop(true,'screen-saver');console.log('READY: focus blank Notepad, then click Do it on Kite Notepad focus test.');
  setTimeout(()=>app.quit(),180000);
});
