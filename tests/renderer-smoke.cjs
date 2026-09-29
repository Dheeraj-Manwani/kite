const { app, BrowserWindow, ipcMain, session, nativeImage } = require('electron');
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
Object.assign(snapshot.settings,{hotkey:['Control','Meta'],onboardingComplete:false,launchOnStartup:false,reducedMotion:false,toolApprovals:{},dryRun:false,searchEngine:'google',visionModel:{provider:'moonshot',id:'kimi-k2.5'},screenWithoutAsking:false,keepScreenshots:false});
const preload = path.join(temporary, 'preload.cjs');
fs.writeFileSync(preload, `const {contextBridge,ipcRenderer}=require('electron');
const subscribe=(channel,callback)=>{const fn=(_e,value,extra)=>callback(value,extra);ipcRenderer.on(channel,fn);return()=>ipcRenderer.removeListener(channel,fn);};
contextBridge.exposeInMainWorld('kite',{
listenerCounts:()=>Object.fromEntries(ipcRenderer.eventNames().map(n=>[n,ipcRenderer.listenerCount(n)])),listHistory:async()=>[{id:'history-test',started_at:Date.now(),preview:'A marked chart',models:'Test model',count:1}],historyDetail:async()=>({messages:[{id:42,role:'user',content:'What is this?',model:'Test model',total_ms:120,annotation_json:JSON.stringify({marks:[{markType:'enclosure'}]})}],tools:[{id:1,message_id:42,tool:'create_note',decision:'approved',duration_ms:30,summary:'Save note?',result_json:'Saved'}]}),deleteHistory:async()=>({ok:true}),exportHistory:async()=>({ok:true}),reportFrame:()=>{},logEvent:()=>{},setHotkeyRecording:()=>{},focusOverlay:()=>{},onAppEvent:cb=>subscribe('app:event',cb),onViewChange:cb=>subscribe('view:change',cb),openView:()=>{},getSettings:()=>ipcRenderer.invoke('test:settings'),onSettingsChanged:cb=>subscribe('settings:changed',cb),
updateSettings:patch=>ipcRenderer.invoke('test:update',patch),hasKey:async()=>true,setKey:async()=>({ok:true}),deleteKey:async()=>({ok:true}),testKey:async()=>({status:'ok'}),refreshModels:async()=>({ok:true}),refreshVoices:async()=>({ok:true}),previewVoice:async()=>({ok:true}),
onScreenEvent:cb=>subscribe('screen:event',cb),screenHidden:()=>{},screenPrepared:(token,images)=>ipcRenderer.send('test:prepared',token,images),testCapture:async()=>({ok:false}),
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
    // Lazy view and asynchronous settings hydration may complete on different frames.
    for(let i=0;i<100 && await settings.webContents.executeJavaScript("document.querySelectorAll('.provider-row').length")!==6;i++)await delay(30);
    assert.equal(await settings.webContents.executeJavaScript("document.querySelectorAll('.provider-row').length"),6);
    assert.equal(await settings.webContents.executeJavaScript("document.querySelectorAll('optgroup').length"),15);
    await settings.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(b=>b.textContent==='Test').click()");await delay(100);
    assert.equal(await settings.webContents.executeJavaScript("document.querySelector('.key-test').textContent"),'ok');
    await settings.webContents.executeJavaScript("const s=document.querySelector('select:has(optgroup)');s.value='anthropic:claude-sonnet-5';s.dispatchEvent(new Event('change',{bubbles:true}));");await delay(100);
    assert.equal(snapshot.settings.model.provider,'anthropic');
    fs.writeFileSync(path.join(temporary,'settings.png'),(await settings.webContents.capturePage()).toPNG());
    await settings.webContents.executeJavaScript('window.scrollTo(0,document.body.scrollHeight)');await delay(100);
    fs.writeFileSync(path.join(temporary,'voice-settings.png'),(await settings.webContents.capturePage()).toPNG());
    const tutorial=await create('onboarding');
    assert.equal(await tutorial.webContents.executeJavaScript("document.querySelector('.onboarding h1').textContent"),'Hello, I’m Kite');
    const next=async()=>{await tutorial.webContents.executeJavaScript("[...document.querySelectorAll('.onboarding footer button')].find(b=>b.textContent==='Continue').click()");await delay(100);};
    await next();await next();await next();
    tutorial.webContents.send('app:event',{type:'hotkey:detected'});await delay(100);
    assert.match(await tutorial.webContents.executeJavaScript("document.querySelector('.onboarding').textContent"),/Nice — I felt that/);
    await next();await next();await next();
    assert.equal(await tutorial.webContents.executeJavaScript("document.querySelector('.onboarding h1').textContent"),'Make yourself at home');
    fs.writeFileSync(path.join(temporary,'onboarding.png'),(await tutorial.webContents.capturePage()).toPNG());
    tutorial.destroy();
    const history=await create('history');await delay(200);
    await history.webContents.executeJavaScript("document.querySelector('.history-item').click()");await delay(100);
    assert.match(await history.webContents.executeJavaScript("document.querySelector('.annotation-badge').textContent"),/enclosure/);
    assert.match(await history.webContents.executeJavaScript("document.querySelector('.history-message details summary').textContent"),/create_note · approved/);
    await history.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(b=>b.textContent==='Export Markdown').click()");await delay(60);
    assert.match(await history.webContents.executeJavaScript("document.querySelector('.history-view [role=status]').textContent"),/Exported/);
    fs.writeFileSync(path.join(temporary,'history.png'),(await history.webContents.capturePage()).toPNG());history.destroy();
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
    // Exercise real OffscreenCanvas JPEG composition with a generated fixture (no desktop capture).
    const prepared = new Map(); ipcMain.on('test:prepared', (_e, token, images) => prepared.set(token, images));
    const png = await overlay.webContents.executeJavaScript(`(()=>{const c=document.createElement('canvas');c.width=2000;c.height=1000;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,2000,1000);x.fillStyle='black';x.font='40px sans-serif';x.fillText('Marked word',300,300);return c.toDataURL('image/png').split(',')[1];})()`);
    overlay.webContents.send('screen:event',{type:'prepare',token:'fixture',png:new Uint8Array(Buffer.from(png,'base64')),display:{id:1,bounds:{x:-1600,y:0,width:1600,height:800},scaleFactor:1.25},strokes:[[{x:-1300,y:250,t:0}]]});
    for(let i=0;i<100&&!prepared.has('fixture');i++)await delay(30);
    const images=prepared.get('fixture');assert.ok(images?.overview&&images.zoom);
    assert.deepEqual(nativeImage.createFromBuffer(Buffer.from(images.overview)).getSize(),{width:1568,height:784});
    assert.deepEqual(nativeImage.createFromBuffer(Buffer.from(images.zoom)).getSize(),{width:300,height:300});
    const pixels=nativeImage.createFromBuffer(Buffer.from(images.zoom)).toBitmap();let magenta=0;
    for(let i=0;i<pixels.length;i+=4)if(pixels[i]>120&&pixels[i+2]>160&&pixels[i+1]<110)magenta++;
    assert.ok(magenta>100,'tap ring must be composited into zoom');
    overlay.webContents.send('screen:event',{type:'looking',active:true,hidden:true});await delay(60);
    assert.equal(await overlay.webContents.executeJavaScript("getComputedStyle(document.querySelector('.kite-canvas')).opacity"),'0');
    overlay.webContents.send('screen:event',{type:'looking',active:true,hidden:false});await delay(60);
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.screen-looking').textContent"),'Kite is looking');
    overlay.webContents.send('test:voice',{id:3,type:'ptt:start'});await delay(60);
    overlay.webContents.send('screen:event',{type:'annotate',id:3,display:{id:1,bounds:{x:0,y:0,width:760,height:960},scaleFactor:1},origin:{x:0,y:0}});await delay(60);
    assert.equal(await overlay.webContents.executeJavaScript("getComputedStyle(document.querySelector('.annotation')).cursor"),'crosshair');
    for(let stroke=0;stroke<6;stroke++){
      const x=100+stroke*40,y=700;
      overlay.webContents.sendInputEvent({type:'mouseDown',x,y,button:'left',clickCount:1});
      overlay.webContents.sendInputEvent({type:'mouseMove',x:x+15,y:y+20,button:'left'});
      overlay.webContents.sendInputEvent({type:'mouseUp',x:x+15,y:y+20,button:'left',clickCount:1});
      await delay(30);
    }
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelectorAll('.annotation path').length"),5);
    overlay.webContents.send('test:voice',{id:3,type:'ptt:stop'});await delay(50);
    assert.equal(await overlay.webContents.executeJavaScript("getComputedStyle(document.querySelector('.annotation')).pointerEvents"),'none');
    overlay.webContents.send('test:voice',{id:3,type:'tool:approvalRequired',approval:{...card,approvalId:'vision-approval'}});await delay(50);
    overlay.webContents.send('test:voice',{id:4,type:'ptt:start'});await delay(50);
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelectorAll('.annotation path').length"),5,'marks stay visible during voice approval');
    overlay.webContents.send('test:voice',{id:4,type:'ptt:stop'});
    overlay.webContents.send('test:voice',{id:3,type:'approval:resume',text:'Continuing'});await delay(50);
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelectorAll('.annotation path').length"),5,'marks survive approval resume');
    overlay.webContents.send('test:voice',{id:3,type:'vision:done'});await delay(900);
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelectorAll('.annotation path').length"),0);
    // Repeated interactions reuse playback's AudioContext instead of leaking one per turn.
    const listenerBaseline=await overlay.webContents.executeJavaScript("window.kite.listenerCounts()");
    for(let i=0;i<50;i++){
      const id=100+i;overlay.webContents.send('test:voice',{id,type:'model:changed',text:'Voice preview'});
      overlay.webContents.send('test:voice',{id,type:'tts:start'});
      overlay.webContents.send('test:voice',{id,type:'llm:delta',text:'Test.'});
      overlay.webContents.send('test:voice',{id,type:'tts:chunk',audio:new Float32Array(2205).buffer});
      overlay.webContents.send('test:voice',{id,type:'tts:done'});overlay.webContents.send('test:voice',{id,type:'llm:done'});
      await delay(70);
    }
    assert.ok(await overlay.webContents.executeJavaScript("window.audioContexts.filter(c=>c.state!=='closed').length<=1"),'50 playback turns must reuse one live context');
    assert.deepEqual(await overlay.webContents.executeJavaScript("window.kite.listenerCounts()"),listenerBaseline,'50 turns must not add IPC listeners');
    assert.deepEqual(errors.filter(e=>!e.includes('NotAllowedError')),[]);
    console.log('PASS settings, model IPC, Web Audio, timestamp reveal, hover, interrupt, approval arguments/countdown/approve/deny, scaled JPEGs, tap ring, annotation pointer capture/limits/fade, capture hiding. Screenshots: '+temporary);
  } catch(error) {console.error(error);process.exitCode=1;}
  finally {windows.forEach(w=>{if(!w.isDestroyed())w.destroy();});app.exit(process.exitCode||0);}
});
