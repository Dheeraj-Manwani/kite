const {app,BrowserWindow,clipboard}=require('electron');
const {spawn}=require('node:child_process');const readline=require('node:readline');
const assert=require('node:assert/strict');const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kite-input-focus-'));app.setPath('userData',dir);
require('./register.cjs');
const {InputFocus}=require('../src/main/input/focus.ts');
const {typeText}=require('../src/main/tools/impl/type_text.ts');
const {electronClipboard}=require('../src/main/tools/electronClipboard.ts');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let fixtureChild,focusClient,stage='startup';
const timeout=setTimeout(()=>{console.error('Focus fixture timed out at '+stage);fixtureChild?.kill();focusClient?.stop();app.exit(1);},30000);
app.whenReady().then(async()=>{
  let child,win,focus,saved;
  try {
    child=fixtureChild=spawn(process.execPath,[path.join(__dirname,'fixtures/focus-window.cjs')],{stdio:['pipe','pipe','pipe'],windowsHide:true});child.stderr.on('data',data=>console.error('Fixture:',data.toString().trim()));stage='fixture ready';
    const pending=new Map();let sequence=0,ready;
    const started=new Promise(resolve=>{ready=resolve;});
    readline.createInterface({input:child.stdout}).on('line',line=>{try{const r=JSON.parse(line);if(r.ready)ready();else{pending.get(r.id)?.(r.result);pending.delete(r.id);}}catch{/* runtime diagnostic */}});
    const call=(op,window=0)=>new Promise(resolve=>{const id=++sequence;pending.set(id,resolve);child.stdin.write(JSON.stringify({id,op,window})+'\n');});
    await started;stage='focus metadata';
    focus=focusClient=new InputFocus(path.join(dir,'focus'),process.pid);
    const signal=new AbortController().signal;
    await call('focus');await delay(180);stage='native remember';await focus.remember();
    const target=await focus.capture(signal);assert.match(target.title,/fixture A/);assert.notEqual(target.pid,process.pid);
    win=new BrowserWindow({width:350,height:180,x:200,y:450,show:false});await win.loadURL('data:text/html,<title>Kite controls fixture</title>Kite controls');win.show();win.focus();await delay(120);
    assert.equal(win.isFocused(),true);assert.equal((await focus.capture(signal)).hwnd,target.hwnd,'Kite preserves the previous destination');
    assert.equal(await focus.restore(),true);await delay(100);assert.equal(win.isFocused(),false);
    const tool=typeText(electronClipboard,focus),ctx={dryRun:false,signal,callId:'first'};
    saved=await electronClipboard.read();clipboard.writeText('clipboard fixture');
    assert.match(await tool.review({text:'Phase 3 paste'},ctx),/fixture A/);
    win.focus();await delay(120);
    const result=await tool.execute({text:'Phase 3 paste'},ctx);assert.equal(result.ok,true,result.message);await delay(100);
    assert.equal(await call('value'),'Phase 3 paste');assert.equal(await call('value',1),'');assert.equal(clipboard.readText(),'clipboard fixture');
    await call('focus');await delay(100);await tool.review({text:'Wrong destination'}, {...ctx,callId:'changed'});
    await call('focus',1);await delay(100);
    assert.equal((await tool.execute({text:'Wrong destination'},{...ctx,callId:'changed'})).ok,false);assert.equal(await call('value',1),'');assert.equal(clipboard.readText(),'clipboard fixture');
    assert.equal(await focus.restore(),false,'a user switch is respected');
    await call('focus');await delay(100);await tool.review({text:'Changed window'},{...ctx,callId:'renamed'});await call('rename');
    assert.equal((await tool.execute({text:'Changed window'},{...ctx,callId:'renamed'})).ok,false);assert.equal(await call('value'),'Phase 3 paste');
    await call('focus',1);await delay(100);const closed=await focus.capture(signal);await call('close',1);assert.equal(await focus.paste(closed,signal),false);
    console.log('PASS native focus return, paste from Kite into a reviewed blank editor, same-process window switch rejection, title change rejection, closed window rejection, and clipboard restoration.');
  }catch(error){console.error(error);process.exitCode=1;}
  finally{clearTimeout(timeout);focus?.stop();win?.destroy();if(child){child.stdin.write(JSON.stringify({op:'quit'})+'\n');child.kill();}if(saved){if(saved.length)await electronClipboard.write(saved);else clipboard.clear();}app.exit(process.exitCode||0);}
});
