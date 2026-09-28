const { app, BrowserWindow, ipcMain, session } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kite-renderer-test-'));
app.setPath('userData', temporary);
require('./register.cjs');
const { catalog } = require('../src/main/ai/catalog.ts');
const snapshot = { settings:{model:{provider:'moonshot',id:'kimi-k2.6'},fallbackEnabled:false,fallback:{provider:'groq',id:'openai/gpt-oss-20b'},ttsEnabled:true,voiceId:'mock-voice',speed:1},
  models:catalog,voices:[{id:'mock-voice',name:'Test voice'}],keys:{openai:true,anthropic:true,google:true,groq:true,moonshot:true,cartesia:true} };
Object.assign(snapshot.settings,{dryRun:false,searchEngine:'google'});
const preload = path.join(temporary, 'preload.cjs');
fs.writeFileSync(preload, `const {contextBridge,ipcRenderer}=require('electron');
const subscribe=(channel,callback)=>{const fn=(_e,value,extra)=>callback(value,extra);ipcRenderer.on(channel,fn);return()=>ipcRenderer.removeListener(channel,fn);};
contextBridge.exposeInMainWorld('kite',{
getSettings:()=>ipcRenderer.invoke('test:settings'),onSettingsChanged:cb=>subscribe('settings:changed',cb),
updateSettings:patch=>ipcRenderer.invoke('test:update',patch),hasKey:async()=>true,setKey:async()=>({ok:true}),deleteKey:async()=>({ok:true}),testKey:async()=>({status:'ok'}),refreshModels:async()=>({ok:true}),refreshVoices:async()=>({ok:true}),previewVoice:async()=>({ok:true}),
onVoiceEvent:cb=>subscribe('test:voice',cb),reportPlayback:(id,event)=>ipcRenderer.send('test:playback',id,event),
approveTool:(id,approved)=>ipcRenderer.invoke('test:approve',{id,approved}),getToolCalls:async()=>[],onToolCallsChanged:cb=>subscribe('tools:changed',cb),setDryRun:async()=>({ok:true}),rescanApps:async()=>({ok:true}),dismissReminder:()=>{},
onCursorUpdate:cb=>subscribe('cursor:update',cb),onDevPanelToggle:cb=>subscribe('dev:togglePanel',cb),setDevPanelBounds:()=>{},setBubbleBounds:()=>{},setOverlayInteractive:()=>{},openSettings:()=>{},reportAudioResult:()=>{},submitAudio:async()=>({ok:true}),printRecentMessages:async()=>({ok:true}),copyText:async()=>({ok:true})});`);
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
  const windows=[]; const errors=[], reports=[], decisions=[];
  try {
    session.defaultSession.setPermissionRequestHandler((_w,_p,cb)=>cb(false));
    ipcMain.handle('test:settings',()=>snapshot);
    ipcMain.handle('test:update',(_event,patch)=>{Object.assign(snapshot.settings,patch);for(const win of windows)win.webContents.send('settings:changed',snapshot);return {ok:true};});
    ipcMain.on('test:playback',(_event,id,event)=>reports.push({id,event}));
    ipcMain.handle('test:approve',(_event,input)=>{decisions.push(input);return {ok:true};});
    const create = async view => {
      const win=new BrowserWindow({width:760,height:960,show:false,webPreferences:{preload,sandbox:true,contextIsolation:true,backgroundThrottling:false,offscreen:true,autoplayPolicy:'no-user-gesture-required'}});windows.push(win);
      win.webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message);});
      await win.loadFile(path.join(__dirname,'../.vite/renderer/main_window/index.html'),{hash:view});await delay(350);return win;
    };
    const settings=await create('settings');
    assert.equal(await settings.webContents.executeJavaScript("document.querySelectorAll('.provider-row').length"),6);
    assert.equal(await settings.webContents.executeJavaScript("document.querySelectorAll('optgroup').length"),10);
    await settings.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(b=>b.textContent==='Test').click()");await delay(100);
    assert.equal(await settings.webContents.executeJavaScript("document.querySelector('.key-test').textContent"),'ok');
    await settings.webContents.executeJavaScript("const s=document.querySelector('select:has(optgroup)');s.value='anthropic:claude-sonnet-5';s.dispatchEvent(new Event('change',{bubbles:true}));");await delay(100);
    assert.equal(snapshot.settings.model.provider,'anthropic');
    fs.writeFileSync(path.join(temporary,'settings.png'),(await settings.webContents.capturePage()).toPNG());
    await settings.webContents.executeJavaScript('window.scrollTo(0,document.body.scrollHeight)');await delay(100);
    fs.writeFileSync(path.join(temporary,'voice-settings.png'),(await settings.webContents.capturePage()).toPNG());
    const overlay=await create('overlay');
    overlay.webContents.send('cursor:update',{x:350,y:250},{origin:{x:0,y:0},display:{x:0,y:0,width:760,height:960}});
    await overlay.webContents.executeJavaScript("window.audioContexts=[];const AC=window.AudioContext;window.AudioContext=class extends AC{constructor(o){super(o);window.audioContexts.push(this);}};window.framesRun=0;function frame(){window.framesRun++;requestAnimationFrame(frame)}requestAnimationFrame(frame);");
    const send=event=>overlay.webContents.send('test:voice',{id:1,...event});
    send({type:'model:changed',text:'Running on Test now!'});send({type:'tts:start'});send({type:'llm:delta',text:'Hello world.'});
    send({type:'tts:timestamps',timestamps:{words:['Hello','world'],start:[0,4],end:[1,4.5]}});
    send({type:'tts:chunk',audio:new Float32Array(44100*5).buffer});send({type:'tts:done'});send({type:'llm:done'});
    for(let i=0;i<100 && !reports.some(r=>r.event==='started');i++)await delay(50);
    await delay(100);
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.bubble-reply').textContent"),'Hello', JSON.stringify({reports,errors,debug:await overlay.webContents.executeJavaScript("({frames:window.framesRun,contexts:window.audioContexts.map(c=>({state:c.state,time:c.currentTime})),text:document.querySelector('.speech-bubble').outerHTML})")}));
    await overlay.webContents.executeJavaScript("document.querySelector('.speech-bubble').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))");await delay(50);
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.bubble-reply').textContent"),'Hello world.');
    send({type:'voice:aborted'});await delay(100);
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.speech-bubble').getAttribute('aria-hidden')"),'true');
    assert.ok(reports.some(r=>r.event==='started'));
    assert.ok(!reports.some(r=>r.event==='failed'));
    overlay.webContents.send('test:voice',{id:2,type:'model:changed',text:'Preview'});
    overlay.webContents.send('test:voice',{id:2,type:'tts:start'});
    overlay.webContents.send('test:voice',{id:2,type:'llm:delta',text:'Streaming without timestamps.'});
    overlay.webContents.send('test:voice',{id:2,type:'tts:chunk',audio:new Float32Array(44100*3).buffer});
    for(let i=0;i<100 && !reports.some(r=>r.id===2 && r.event==='started');i++)await delay(50);
    await delay(400);
    assert.match(await overlay.webContents.executeJavaScript("document.querySelector('.bubble-reply').textContent"),/Streaming without timestamps/);
    overlay.webContents.send('test:voice',{id:2,type:'tts:stop'});
    overlay.webContents.send('test:voice',{id:2,type:'llm:done'});await delay(100);
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.speech-bubble').getAttribute('aria-hidden')"),'false');
    const card={approvalId:'test-approval',toolName:'type_text',summary:'Paste "meeting at 5" into the currently focused app?',input:{text:'meeting at 5'},expiresAt:Date.now()+30000,dryRun:false};
    overlay.webContents.send('test:voice',{id:2,type:'tool:approvalRequired',approval:card});await delay(100);
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.approval-summary').textContent"),card.summary);
    assert.match(await overlay.webContents.executeJavaScript("document.querySelector('.approval-card pre').textContent"),/meeting at 5/);
    assert.match(await overlay.webContents.executeJavaScript("document.querySelector('.approval-countdown').textContent"),/30|29/);
    await overlay.webContents.executeJavaScript("document.querySelector('.approval-buttons button').click()");await delay(100);
    assert.deepEqual(decisions,[{id:card.approvalId,approved:true}]);
    overlay.webContents.send('test:voice',{id:2,type:'tool:decision',approval:card,decision:'approved'});await delay(50);
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.approval-card')===null"),true);
    overlay.webContents.send('test:voice',{id:2,type:'tool:approvalRequired',approval:{...card,approvalId:'second'}});await delay(50);
    await overlay.webContents.executeJavaScript("document.querySelectorAll('.approval-buttons button')[1].click()");await delay(50);
    assert.deepEqual(decisions[1],{id:'second',approved:false});
    fs.writeFileSync(path.join(temporary,'approval.png'),(await overlay.webContents.capturePage()).toPNG());
    assert.deepEqual(errors.filter(e=>!e.includes('NotAllowedError')),[]);
    console.log('PASS settings, model IPC, Web Audio, timestamp reveal, hover, interrupt, approval arguments/countdown/approve/deny. Screenshots: '+temporary);
  } catch(error) {console.error(error);process.exitCode=1;}
  finally {windows.forEach(w=>w.destroy());app.exit(process.exitCode||0);}
});
