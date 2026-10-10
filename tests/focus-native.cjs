const {app,BrowserWindow,clipboard}=require('electron');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kite-input-focus-'));app.setPath('userData',dir);
require('./register.cjs');
const {InputFocus}=require('../src/main/input/focus.ts');
const {typeText}=require('../src/main/tools/impl/type_text.ts');
const {electronClipboard}=require('../src/main/tools/electronClipboard.ts');
const {ActClient}=require('../src/main/agent/sidecar.ts');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let fixtureChild,focusClient,stage='startup';
const timeout=setTimeout(()=>{console.error('Focus fixture timed out at '+stage);fixtureChild?.kill();focusClient?.stop();app.exit(1);},30000);
app.whenReady().then(async()=>{
  let child,win,focus,saved,fixtureActivator;
  try {
    child=fixtureChild=spawn(process.execPath,[path.join(__dirname,'fixtures/focus-window.cjs'),dir],{stdio:['ignore','ignore','pipe'],windowsHide:true});child.stderr.on('data',data=>console.error('Fixture:',data.toString().trim()));stage='fixture ready';
    let sequence=0;
    const response=()=>{try{return JSON.parse(fs.readFileSync(path.join(dir,'response.json'),'utf8'));}catch{return null;}};
    const call=async(op,window=0)=>{const id=++sequence;fs.writeFileSync(path.join(dir,'request.json'),JSON.stringify({id,op,window}));for(let i=0;i<200;i++){const r=response();if(r?.id===id){if(r.error)throw Error(r.error);return r.result;}await delay(20);}throw Error('Fixture request timed out: '+op);};
    for(let i=0;i<600&&!response()?.ready;i++)await delay(20);
    assert.equal(response()?.ready,true,JSON.stringify(response()));stage='focus metadata';
    fixtureActivator=new ActClient({directory:path.join(dir,'fixture-activation'),excludePid:0,toDip:rect=>rect});
    const focusEditor=async index=>{const known=await call('focus',index);assert.equal(await fixtureActivator.activate(known),true,'activate only the known test editor');await delay(120);};
    focus=focusClient=new InputFocus(path.join(dir,'focus'),process.pid);
    const signal=new AbortController().signal;
    await focusEditor(0);stage='native remember';await focus.remember();
    const target=await focus.capture(signal);assert.ok(target?.title.includes('fixture A'),'the known editor must have focus');assert.notEqual(target.pid,process.pid);
    win=new BrowserWindow({width:350,height:180,x:200,y:450,show:false});await win.loadURL('data:text/html,<title>Kite controls fixture</title>Kite controls');win.show();win.focus();await delay(120);
    const handle=win.getNativeWindowHandle(),controls={hwnd:Number(handle.length===8?handle.readBigUInt64LE():handle.readUInt32LE()),pid:process.pid};
    assert.equal(await fixtureActivator.activate(controls),true);
    assert.equal(win.isFocused(),true);assert.equal((await focus.capture(signal)).hwnd,target.hwnd,'Kite preserves the previous destination');
    assert.equal(await focus.restore(),true);await delay(100);assert.equal((await focus.capture(signal)).hwnd,target.hwnd,'native foreground returns to the original editor');
    const tool=typeText(electronClipboard,focus),ctx={dryRun:false,signal,callId:'first'};
    saved=await electronClipboard.read();await clipboard.writeText('clipboard fixture');
    assert.match(await tool.review({text:'Phase 3 paste'},ctx),/fixture A/);
    assert.equal(await fixtureActivator.activate(controls),true);await delay(120);
    const result=await tool.execute({text:'Phase 3 paste'},ctx);assert.equal(result.ok,true,result.message);await delay(100);
    assert.equal(await call('value'),'Phase 3 paste');assert.equal(await call('value',1),'');assert.equal(await clipboard.readText(),'clipboard fixture');
    await focusEditor(0);await tool.review({text:'Wrong destination'}, {...ctx,callId:'changed'});
    await focusEditor(1);
    assert.equal((await tool.execute({text:'Wrong destination'},{...ctx,callId:'changed'})).ok,false);assert.equal(await call('value',1),'');assert.equal(await clipboard.readText(),'clipboard fixture');
    assert.equal(await focus.restore(),false,'a user switch is respected');
    await focusEditor(0);await tool.review({text:'Changed window'},{...ctx,callId:'renamed'});await call('rename');
    assert.equal((await tool.execute({text:'Changed window'},{...ctx,callId:'renamed'})).ok,false);assert.equal(await call('value'),'Phase 3 paste');
    await focusEditor(1);const closed=await focus.capture(signal);await call('close',1);assert.equal(await focus.paste(closed,signal),false);
    console.log('PASS native focus return, paste from Kite into a reviewed blank editor, same-process window switch rejection, title change rejection, closed window rejection, and clipboard restoration.');
  }catch(error){console.error(error);process.exitCode=1;}
  finally{clearTimeout(timeout);focus?.stop();fixtureActivator?.stop();win?.destroy();child?.kill();if(saved){if(saved.length)await electronClipboard.write(saved);else await clipboard.clear();}app.exit(process.exitCode||0);}
});
