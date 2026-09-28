const {app,clipboard,ClipboardItem,nativeImage}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'kite-clipboard-')));
require('./register.cjs');
const {pasteText}=require('../src/main/tools/clipboard.ts');
const {electronClipboard}=require('../src/main/tools/electronClipboard.ts');
app.whenReady().then(async()=>{
  const original=await electronClipboard.read();
  try {
    const png=nativeImage.createFromBitmap(Buffer.from([0,0,255,255]),{width:1,height:1}).toPNG();
    await clipboard.write([new ClipboardItem({'text/plain':'Kite clipboard fixture','image/png':new Blob([png],{type:'image/png'})})]);
    const before=await clipboard.read();const imageBefore=await before[0].getType('image/png');
    let pasted=false;
    await pasteText(electronClipboard,'meeting at 5',new AbortController().signal,()=>{pasted=true;});
    assert.equal(pasted,true);assert.equal(await clipboard.readText(),'Kite clipboard fixture');
    const after=await clipboard.read();assert.ok(after[0].types.includes('image/png'));
    assert.deepEqual(Buffer.from(await (await after[0].getType('image/png')).arrayBuffer()),Buffer.from(await imageBefore.arrayBuffer()));
    console.log('PASS real Electron clipboard restores both text and image after paste delay; no keyboard input sent.');
  }catch(e){console.error(e);process.exitCode=1;}
  finally {try{if(original.length)await clipboard.write(original);else clipboard.clear();}finally{app.exit(process.exitCode||0);}}
}).catch(e=>{console.error(e);app.exit(1);});
