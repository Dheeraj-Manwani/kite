const { app, BrowserWindow, ipcMain, session, nativeImage } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kite-renderer-test-'));
app.setPath('userData', temporary);
require('./register.cjs');
const { catalog } = require('../src/main/ai/catalog.ts');
const { defaultPermissions } = require('../src/shared/permissions.ts');
const snapshot = { settings:{model:{provider:'moonshot',id:'kimi-k2.6'},fallbackEnabled:false,fallback:{provider:'groq',id:'openai/gpt-oss-20b'},ttsEnabled:true,voiceId:'mock-voice',speed:1},
  models:catalog,voices:[{id:'mock-voice',name:'Test voice'}],keys:{openai:true,anthropic:true,google:true,groq:true,moonshot:true,deepseek:true,cartesia:true} };
Object.assign(snapshot.settings,{hotkey:['Control','Meta'],onboardingComplete:false,launchOnStartup:false,reducedMotion:false,toolApprovals:{},dryRun:false,searchEngine:'google',visionModel:{provider:'moonshot',id:'kimi-k2.5'},screenWithoutAsking:false,keepScreenshots:false,guideMode:true,whiteboard:true,boardCaptions:false,computerUse:true,kiteSize:'standard',earcons:false,liveliness:'playful',kitePlacement:'pointer',kiteSkin:'rose',permissions:structuredClone(defaultPermissions),jobsModel:null,memory:true});
const memoryFacts=[{id:1,kind:'profile',key:'profile.phone',label:'Phone number',value:'9876543210',source:'From what you said, 1 Oct',created:1,updated:1,used:null},
  {id:2,kind:'address',key:'home.pincode',label:'Home pincode',value:'411045',source:'From the shop.example.in task, 1 Oct',created:1,updated:1,used:Date.now()},
  {id:3,kind:'address',key:'home.city',label:'Home city',value:'Pune',source:'From the shop.example.in task, 1 Oct',created:1,updated:1,used:null},
  {id:4,kind:'preference',key:'pref.sunfold-whey',label:'Sunfold whey',value:'Sunfold Whey Protein, 60 sachets, Unflavoured',source:'Chosen on shop.example.in, 1 Oct',created:1,updated:1,used:null}];
const preload = path.join(temporary, 'preload.cjs');
fs.writeFileSync(preload, `const {contextBridge,ipcRenderer}=require('electron');
const subscribe=(channel,callback)=>{const fn=(_e,value,extra)=>callback(value,extra);ipcRenderer.on(channel,fn);return()=>ipcRenderer.removeListener(channel,fn);};
contextBridge.exposeInMainWorld('kite',{
listBoards:async()=>[{id:'saved-tcp',messageId:42,title:'TCP diagram',createdAt:Date.now(),thumbnail:null}],reopenBoard:async()=>({ok:true}),boardThumbnail:(id,png)=>ipcRenderer.send('test:thumbnail',id,png),
boardStarted:(id,key)=>ipcRenderer.send('test:boardStarted',id,key),
boardCue:(id,key,expected,actual)=>ipcRenderer.send('test:boardCue',id,key,expected,actual),
listenerCounts:()=>Object.fromEntries(ipcRenderer.eventNames().map(n=>[n,ipcRenderer.listenerCount(n)])),listHistory:async()=>[{id:'history-test',started_at:Date.now(),preview:'A marked chart',models:'Test model',count:1}],historyScreenshot:async id=>id===42?'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HgAGgwJ/lK3Q6wAAAABJRU5ErkJggg==':null,historyDetail:async()=>({messages:[{id:42,role:'user',content:'What is this?',model:'Test model',total_ms:120,attachments:1,annotation_json:JSON.stringify({marks:[{markType:'enclosure'}]})}],tools:[{id:1,message_id:42,tool:'create_note',decision:'approved',duration_ms:30,summary:'Save note?',result_json:'Saved'}]}),deleteHistory:async()=>({ok:true}),exportHistory:async()=>({ok:true}),reportFrame:()=>{},logEvent:()=>{},setHotkeyRecording:()=>{},focusOverlay:()=>{},getAbout:async()=>({version:'1.0.0',updateStatus:'Up to date',updateReady:false}),aboutAction:a=>ipcRenderer.send('test:about',a),openKeyPage:()=>{},releaseOverlay:()=>{},onAppEvent:cb=>subscribe('app:event',cb),onViewChange:cb=>subscribe('view:change',cb),openView:view=>ipcRenderer.send('test:openView',view),
listMemory:()=>ipcRenderer.invoke('test:memoryList'),editMemory:(id,patch)=>ipcRenderer.invoke('test:memoryEdit',id,patch),deleteMemory:id=>ipcRenderer.invoke('test:memoryDelete',id),exportMemory:async()=>({ok:true}),
undoMemory:token=>ipcRenderer.invoke('test:memoryUndo',token),onMemoryChanged:cb=>subscribe('memory:changed',cb),letsFly:from=>ipcRenderer.send('test:fly',from),getSettings:()=>ipcRenderer.invoke('test:settings'),onSettingsChanged:cb=>subscribe('settings:changed',cb),
updateSettings:patch=>ipcRenderer.invoke('test:update',patch),hasKey:async()=>true,setKey:async()=>({ok:true}),deleteKey:async()=>({ok:true}),testKey:async()=>({status:'ok'}),refreshModels:async()=>({ok:true}),refreshVoices:async()=>({ok:true}),previewVoice:async()=>({ok:true}),
onScreenEvent:cb=>subscribe('screen:event',cb),screenHidden:()=>{},markScreen:id=>ipcRenderer.send('test:markScreen',id),screenPrepared:(token,images)=>ipcRenderer.send('test:prepared',token,images),testCapture:async()=>({ok:false}),
onVoiceEvent:cb=>subscribe('test:voice',cb),reportPlayback:(id,event)=>ipcRenderer.send('test:playback',id,event),stopSpeech:id=>ipcRenderer.send('test:stopSpeech',id),
onConversationOpen:cb=>subscribe('conversation:open',cb),submitText:text=>ipcRenderer.invoke('test:submitText',text),newConversation:()=>ipcRenderer.invoke('test:newConversation'),continueConversation:id=>ipcRenderer.invoke('test:continueConversation',id),
approveTool:(id,approved,scope)=>ipcRenderer.invoke('test:approve',scope?{id,approved,scope}:{id,approved}),getToolCalls:async()=>[],onToolCallsChanged:cb=>subscribe('tools:changed',cb),setDryRun:async()=>({ok:true}),rescanApps:async()=>({ok:true}),dismissReminder:()=>{},
onCursorUpdate:cb=>subscribe('cursor:update',cb),onDevPanelToggle:cb=>subscribe('dev:togglePanel',cb),setDevPanelBounds:()=>{},setBubbleBounds:()=>{},onGuideEvent:cb=>subscribe('guide:state',cb),guideControl:action=>ipcRenderer.send('test:guide',action),setGuideBounds:bounds=>ipcRenderer.send('test:guideBounds',bounds),setOverlayInteractive:()=>{},openSettings:()=>{},reportAudioResult:()=>{},submitAudio:async()=>({ok:true}),printRecentMessages:async()=>({ok:true}),copyText:async()=>({ok:true}),
onBoardEvent:cb=>subscribe('board:state',cb),boardControl:action=>ipcRenderer.send('test:board',action),boardDrawn:(id,key)=>ipcRenderer.send('test:boardDrawn',id,key),setBoardBounds:bounds=>ipcRenderer.send('test:boardBounds',bounds),exportBoard:(action,png,title)=>ipcRenderer.invoke('test:boardExport',action,png,title),demoBoard:async()=>({ok:true}),
onTaskEvent:cb=>subscribe('task:state',cb),taskControl:action=>ipcRenderer.send('test:task',action),taskChoose:(index,remember)=>ipcRenderer.send('test:taskChoose',index,remember),setTaskBounds:bounds=>ipcRenderer.send('test:taskBounds',bounds)});`);
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
  const windows=[]; const errors=[], reports=[], decisions=[], flights=[], abouts=[], memoryCalls=[], speechStops=[], screenMarks=[];let lastScript='';
  const typedSends=[], continued=[];let typedId=600, conversationNumber=0, testConversation='live-test', rejectTyped=false;
  ipcMain.handle('test:submitText',(event,text)=>{
    if(rejectTyped)return {ok:false,error:'Couldn’t send. Try again.'};
    typedSends.push(text);const id=++typedId;const send=type=>event.sender.send('test:voice',{id,...type});
    send({type:'text:start'});send({type:'voice:transcript',text});send({type:'conversation:started',conversationId:testConversation});
    setTimeout(()=>{if(text==='A question that fails')send({type:'llm:error',title:'Couldn’t reach the model',text:'Try again.'});else{send({type:'llm:delta',text:'Shortest fix: restart the test service.'});send({type:'llm:done'});}},50);
    return {ok:true};
  });
  ipcMain.handle('test:newConversation',event=>{testConversation='new-'+(++conversationNumber);event.sender.send('conversation:open',{id:testConversation,messages:[],reason:'new'});return {ok:true};});
  ipcMain.handle('test:continueConversation',(_event,id)=>{continued.push(id);testConversation=id;const overlay=windows.find(win=>!win.isDestroyed()&&win.webContents.getURL().endsWith('#overlay'));
    overlay?.webContents.send('conversation:open',{id,reason:'resume',messages:[{id:901,role:'user',content:'Explain this saved error.'},{id:902,role:'assistant',content:'The saved explanation.'}]});return {ok:true};});
  ipcMain.on('test:stopSpeech',(_event,id)=>speechStops.push(id));
  ipcMain.on('test:markScreen',(_event,id)=>screenMarks.push(id));
  ipcMain.handle('test:memoryList',()=>memoryFacts);
  ipcMain.handle('test:memoryEdit',(_e,id,patch)=>{memoryCalls.push(['edit',id,patch]);return {ok:true};});
  ipcMain.handle('test:memoryDelete',(_e,id)=>{memoryCalls.push(['delete',id]);return {ok:true};});
  ipcMain.handle('test:memoryUndo',(_e,token)=>{memoryCalls.push(['undo',token]);return {ok:true};});
  ipcMain.on('test:openView',(_e,view)=>memoryCalls.push(['open',view]));
  try {
    session.defaultSession.setPermissionRequestHandler((_w,_p,cb)=>cb(false));
    ipcMain.handle('test:settings',()=>snapshot);
    ipcMain.handle('test:update',(_event,patch)=>{Object.assign(snapshot.settings,patch);for(const win of windows)win.webContents.send('settings:changed',snapshot);return {ok:true};});
    ipcMain.on('test:playback',(_event,id,event)=>reports.push({id,event}));
    ipcMain.on('test:fly',(_event,from)=>flights.push(from));
    ipcMain.on('test:about',(_event,action)=>abouts.push(action));
    ipcMain.handle('test:approve',(_event,input)=>{decisions.push(input);return {ok:true};});
    const create = async view => {
      const win=new BrowserWindow({width:760,height:960,show:false,webPreferences:{preload,sandbox:true,contextIsolation:true,backgroundThrottling:false,offscreen:true,autoplayPolicy:'no-user-gesture-required'}});windows.push(win);
      const execute=win.webContents.executeJavaScript.bind(win.webContents);
      win.webContents.executeJavaScript=(code,...args)=>{lastScript=code;return execute(code,...args).catch(error=>{throw new Error('Renderer script failed: '+code+'\n'+error.stack);});};
      win.webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message);});
      await win.loadFile(path.join(__dirname,'../.vite/renderer/main_window/index.html'),{hash:view});await delay(350);return win;
    };
    const settings=await create('settings');const sjs=code=>settings.webContents.executeJavaScript(code);
    // Settings opens on General in a sidebar layout, and the window title names the section (UX-50).
    for(let i=0;i<100 && !(await sjs("!!document.querySelector('.switch')"));i++)await delay(30);
    assert.equal(await sjs("document.title"),'Kite · General');
    assert.equal(await sjs("document.querySelector('.side-item[aria-current]').textContent"),'General');
    assert.match(await sjs("document.querySelector('.hotkey-current').textContent"),/Push to talk\s*Ctrl\s*Win/);
    // Kite size (design.md K-14): Standard, Large, and Extra large.
    assert.deepEqual(await sjs("[...document.querySelector('select[aria-label=\"Kite size\"]').options].map(o=>o.textContent)"),['Standard','Large','Extra large']);
    await sjs("const k=document.querySelector('select[aria-label=\"Kite size\"]');k.value='large';k.dispatchEvent(new Event('change',{bubbles:true}));");await delay(80);
    assert.equal(snapshot.settings.kiteSize,'large');snapshot.settings.kiteSize='standard';
    // Liveliness and kite color (K-15), with a live preview of the color; the logo in the sidebar stays rose.
    assert.deepEqual(await sjs("[...document.querySelector('select[aria-label=\"Motion\"]').options].map(o=>o.textContent)"),['Still','Subtle','Playful']);
    assert.deepEqual(await sjs("[...document.querySelector('select[aria-label=\"Placement\"]').options].map(o=>o.textContent)"),['At screen edge','Follow pointer','Show when invoked']);
    assert.deepEqual(await sjs("[...document.querySelector('select[aria-label=\"Kite color\"]').options].map(o=>o.textContent)"),['Rose','Teal','Violet','Sky']);
    await sjs("const c=document.querySelector('select[aria-label=\"Kite color\"]');c.value='violet';c.dispatchEvent(new Event('change',{bubbles:true}));");await delay(80);
    assert.equal(snapshot.settings.kiteSkin,'violet');
    assert.equal(await sjs("getComputedStyle(document.querySelector('.kite-color-preview .sail-mark path')).fill"),'rgb(154, 107, 255)');
    assert.equal(await sjs("getComputedStyle(document.querySelector('.sidebar-brand .sail-mark path')).fill"),'rgb(255, 66, 111)');
    snapshot.settings.kiteSkin='rose';
    await sjs("[...document.querySelectorAll('.side-item')].find(b=>b.textContent==='Models & keys').click()");
    for(let i=0;i<100 && await sjs("document.querySelectorAll('.provider-row').length")!==6;i++)await delay(30);
    assert.equal(await sjs("document.querySelectorAll('.provider-row').length"),6);
    // Models are a listbox grouped by provider, each row with tier, Vision, and Actions badges; the backup is under Advanced (UX-55).
    assert.equal(await sjs("document.querySelectorAll('.model-picker').length"),4,'main, vision, jobs, backup');
    assert.ok(await sjs("!document.querySelector('.advanced').open&&document.querySelector('.advanced').textContent.includes('Backup model')"));
    // A connected provider shows its state; rarer actions wait in a menu (UX-51).
    assert.match(await sjs("document.querySelector('.provider-state').textContent"),/Connected · \d+ models/);
    await sjs("document.querySelector('.overflow summary').click()");await delay(30);
    await sjs("[...document.querySelectorAll('.overflow .menu button')].find(b=>b.textContent==='Check connection').click()");await delay(120);
    assert.match(await sjs("document.querySelector('.provider-state').textContent"),/Connected/);
    await sjs("document.querySelector('.model-picker-button').click()");await delay(60);
    assert.equal(await sjs("document.querySelectorAll('[role=listbox] .model-group').length"),6);
    const sonnet="[...document.querySelectorAll('[role=option]')].find(o=>o.querySelector('.model-name').textContent==='Claude Sonnet 5')";
    assert.deepEqual(await sjs(`[...${sonnet}.querySelectorAll('.badge')].map(b=>b.textContent)`),['Fast','Vision','Actions']);
    fs.writeFileSync(path.join(temporary,'model-picker.png'),(await settings.webContents.capturePage()).toPNG());
    await sjs(`${sonnet}.click()`);await delay(100);
    assert.equal(snapshot.settings.model.provider,'anthropic');
    assert.equal(await sjs("document.querySelector('[role=listbox]')"),null,'the list closes after a choice');
    // By keyboard: ArrowDown opens, End moves to the last model, Enter chooses it, and focus goes back to the button.
    const key=(selector,k)=>sjs(`document.querySelector('${selector}').dispatchEvent(new KeyboardEvent('keydown',{key:'${k}',bubbles:true}))`);
    await sjs("document.querySelectorAll('.model-picker-button')[1].focus()");
    await sjs("document.querySelectorAll('.model-picker-button')[1].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}))");await delay(60);
    await key('[role=listbox]','End');await delay(30);
    const lastVision=await sjs("[...document.querySelectorAll('[role=option] .model-name')].at(-1).textContent");
    await key('[role=listbox]','Enter');await delay(100);
    assert.equal(await sjs("document.activeElement.classList.contains('model-picker-button')"),true);
    assert.equal(await sjs("document.querySelectorAll('.model-picker-button')[1].querySelector('.model-name').textContent"),lastVision);
    snapshot.boardPlannerEnabled=true;settings.webContents.send('settings:changed',snapshot);await delay(100);
    assert.equal(await sjs("document.querySelectorAll('.model-picker').length"),5,'specialist picker appears only when enabled');
    await sjs("document.querySelector('button[aria-label^=\"Whiteboard model:\"]').click()");await delay(60);
    await sjs("[...document.querySelectorAll('[role=option]')].find(o=>o.querySelector('.model-name').textContent==='GPT OSS 20B').click()");await delay(80);
    assert.equal(snapshot.settings.boardModel.id,'openai/gpt-oss-20b');
    await sjs("[...document.querySelectorAll('.setting-row')].find(r=>r.querySelector('.row-label').textContent==='Whiteboard model').querySelector('button.link').click()");await delay(60);
    assert.equal(snapshot.settings.boardModel,null);snapshot.boardPlannerEnabled=false;settings.webContents.send('settings:changed',snapshot);await delay(80);
    fs.writeFileSync(path.join(temporary,'settings.png'),(await settings.webContents.capturePage()).toPNG());
    await sjs("[...document.querySelectorAll('.side-item')].find(b=>b.textContent==='Voice').click()");await delay(120);
    assert.equal(await sjs("document.querySelectorAll('.provider-row').length"),1);
    // Speed is an ink slider with a "Normal" tick that resets it to 1.0× (UX-56).
    await sjs("const r=document.querySelector('.range');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(r,'1.25');r.dispatchEvent(new Event('input',{bubbles:true}));");await delay(100);
    assert.equal(snapshot.settings.speed,1.25);
    assert.ok(Math.abs(parseFloat(await sjs("document.querySelector('.range').style.getPropertyValue('--fill')"))-72.22)<.01,'filled to the value');
    await sjs("document.querySelector('.range-tick').click()");await delay(100);
    assert.equal(snapshot.settings.speed,1);
    assert.ok(await sjs("[...document.querySelectorAll('.setting-row')].some(r=>/Speed\s*Normal/.test(r.textContent))"));
    // Sound cues (K-13) are off until turned on; turning them on plays a preview.
    assert.equal(await sjs("[...document.querySelectorAll('.switch-row')].find(r=>r.textContent.startsWith('Sound cues')).querySelector('input').checked"),false);
    await sjs("[...document.querySelectorAll('.switch-row')].find(r=>r.textContent.startsWith('Sound cues')).querySelector('input').click()");await delay(80);
    assert.equal(snapshot.settings.earcons,true);snapshot.settings.earcons=false;
    fs.writeFileSync(path.join(temporary,'voice-settings.png'),(await settings.webContents.capturePage()).toPNG());
    // Without a Cartesia key, one line replaces the voice controls that couldn't work (UX-56).
    snapshot.keys.cartesia=false;settings.webContents.send('settings:changed',snapshot);await delay(100);
    assert.equal(await sjs("document.querySelector('.range')"),null);
    assert.match(await sjs("document.querySelector('.settings-view').textContent"),/Add a Cartesia key to hear Kite speak\./);
    snapshot.keys.cartesia=true;settings.webContents.send('settings:changed',snapshot);await delay(60);
    // Trust settings use plain actions and switches, not tool ids (UX-54).
    await sjs("[...document.querySelectorAll('.side-item')].find(b=>b.textContent==='Actions & trust').click()");await delay(120);
    assert.match(await sjs("document.querySelector('.settings-view').textContent"),/Ask before I….*Open an app.*Search the web/);
    assert.equal(await sjs("document.querySelector('.settings-view').textContent.includes('open_app')"),false);
    // Permissions (ADR 014): the mode first, Hands-off only after a confirmation, the table behind Customise, the limit, the rules.
    await sjs("[...document.querySelectorAll('.side-item')].find(b=>b.textContent==='Permissions').click()");await delay(150);
    assert.deepEqual(await sjs("[...document.querySelectorAll('.mode-row .row-label')].map(l=>l.textContent)"),['BalancedRecommended','Ask every time','Hands-off']);
    assert.equal(await sjs("document.querySelector('.mode-row input:checked').closest('.mode-row').querySelector('.row-label').textContent"),'BalancedRecommended');
    await sjs("[...document.querySelectorAll('.mode-row')].find(r=>r.textContent.startsWith('Hands-off')).querySelector('input').click()");await delay(80);
    assert.match(await sjs("document.querySelector('.hands-off-confirm').textContent"),/submit, send, delete and pay without asking/);
    assert.equal(snapshot.settings.permissions.mode,'balanced','nothing changes until confirmed');
    fs.writeFileSync(path.join(temporary,'permissions.png'),(await settings.webContents.capturePage()).toPNG());
    await sjs("[...document.querySelectorAll('.hands-off-confirm button')].find(b=>b.textContent==='Turn on Hands-off').click()");await delay(120);
    assert.equal(snapshot.settings.permissions.mode,'handsOff');
    await sjs("(()=>{const s=document.querySelector('select[aria-label=\"Send as you\"]');s.value='never';s.dispatchEvent(new Event('change',{bubbles:true}));})()");await delay(120);
    assert.deepEqual([snapshot.settings.permissions.mode,snapshot.settings.permissions.custom.send,snapshot.settings.permissions.custom.submit],['custom','never','allow'],'a changed row is Custom, from Hands-off');
    await sjs("(()=>{const i=document.querySelector('.money-field input');i.focus();const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'1,500');i.dispatchEvent(new Event('input',{bubbles:true}));})()");await delay(60);
    await sjs("document.querySelector('.money-field input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");await delay(120);
    assert.equal(snapshot.settings.permissions.spendLimit,1500);
    snapshot.settings.permissions={...snapshot.settings.permissions,rules:[{place:'shop.example.in',category:'money',permission:'never'}]};settings.webContents.send('settings:changed',snapshot);await delay(100);
    assert.match(await sjs("document.querySelector('.settings-view').textContent"),/Spend money on shop\.example\.inDon’t allow/);
    await sjs("[...document.querySelectorAll('.settings-view button')].find(b=>b.textContent==='Remove').click()");await delay(100);
    assert.deepEqual(snapshot.settings.permissions.rules,[]);
    snapshot.settings.permissions=structuredClone(defaultPermissions);settings.webContents.send('settings:changed',snapshot);await delay(60);
    // Memory (docs/end-to-end-jobs.md §3.4): beside History; facts by kind with where they came from; sensitive values masked until shown.
    await sjs("[...document.querySelectorAll('.side-item')].find(b=>b.textContent==='Memory').click()");await delay(250);
    for(let i=0;i<100&&!(await sjs("!!document.querySelector('.memory-view .memory-value')"));i++)await delay(30);
    assert.equal(await sjs("document.querySelector('.memory-view h1').textContent"),'Memory');
    assert.deepEqual(await sjs("[...document.querySelectorAll('.memory-view .settings-group h2')].map(h=>h.textContent)"),['About you','Home address','Preferences','Privacy']);
    assert.deepEqual(await sjs("[...document.querySelectorAll('.memory-value')].map(v=>v.textContent)"),['ending 10Show','••••••Show','Pune','Sunfold Whey Protein, 60 sachets, Unflavoured']);
    assert.match(await sjs("document.querySelector('.memory-view').textContent"),/From the shop\.example\.in task, 1 Oct · last used/);
    await sjs("document.querySelectorAll('.memory-value button')[1].click()");await delay(60);
    assert.equal(await sjs("document.querySelectorAll('.memory-value')[1].textContent"),'411045Hide');
    fs.writeFileSync(path.join(temporary,'memory.png'),(await settings.webContents.capturePage()).toPNG());
    await sjs("[...document.querySelectorAll('.memory-fact')][1].querySelector('.row-control button').click()");await delay(60);
    await sjs("(()=>{const i=document.querySelector('.memory-fact input');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'411046');i.dispatchEvent(new Event('input',{bubbles:true}));})()");await delay(30);
    await sjs("document.querySelector('.memory-fact input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");await delay(80);
    await sjs("document.querySelector('[aria-label=\"Forget Sunfold whey\"]').click()");await delay(80);
    await sjs("document.querySelector('.memory-view .switch').click()");await delay(80);
    assert.deepEqual(memoryCalls,[['edit',2,{value:'411046'}],['delete',4]]); assert.equal(snapshot.settings.memory,false,'the master switch');
    snapshot.settings.memory=true;settings.webContents.send('settings:changed',snapshot);await delay(60);
    // The jobs model: automatic picks DeepSeek Flash when its key is saved.
    await sjs("[...document.querySelectorAll('.side-item')].find(b=>b.textContent==='Models & keys').click()");await delay(150);
    assert.match(await sjs("document.querySelector('.settings-view').textContent"),/Jobs model.*Automatic: DeepSeek Flash when its key is saved/);
    assert.match(await sjs("document.querySelector('[aria-label^=\"Jobs model:\"]').getAttribute('aria-label')"),/DeepSeek Flash/);
    // High Contrast keeps the current section visible with a Highlight outline (UX-90).
    settings.webContents.debugger.attach('1.3');
    await settings.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'forced-colors',value:'active'}]});await delay(60);
    assert.equal(await sjs("getComputedStyle(document.querySelector('.side-item[aria-current]')).outlineStyle"),'solid');
    await settings.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[]});settings.webContents.debugger.detach();
    const micaWindow=new BrowserWindow({width:760,height:500,show:false,webPreferences:{preload,sandbox:true,contextIsolation:true,offscreen:true}});
    await micaWindow.loadFile(path.join(__dirname,'../.vite/renderer/main_window/index.html'),{hash:'settings',query:{mica:'1'}});await delay(300);
    assert.deepEqual(await micaWindow.webContents.executeJavaScript("[document.documentElement.classList.contains('mica'),getComputedStyle(document.documentElement).backgroundColor,getComputedStyle(document.querySelector('.window-sidebar')).backgroundColor]"),[true,'rgba(0, 0, 0, 0)','rgba(0, 0, 0, 0)']);
    micaWindow.destroy();
    const tutorial=await create('onboarding');
    assert.equal(await tutorial.webContents.executeJavaScript("document.querySelector('.onboarding h1').textContent"),'Hello, I’m Kite');
    // Onboarding is a guided path: no nav, a labeled progress row, and the kite on its stage.
    assert.equal(await tutorial.webContents.executeJavaScript("document.querySelector('.window-nav')"),null);
    assert.match(await tutorial.webContents.executeJavaScript("document.querySelector('.onboarding-progress').textContent"),/1 of 7 · Welcome/);
    // The live kite (design.md K-07) flies in up its string, settles over the stage's centre, and flutters hello.
    const stageKite=()=>tutorial.webContents.executeJavaScript("(()=>{const layer=document.querySelector('.kite-stage-layer'),m=layer.querySelector(':scope > g:last-of-type').getAttribute('transform').match(/translate\\(([-\\d.e]+) ([-\\d.e]+)\\) rotate\\([-\\d.e]+\\) scale\\(([-\\d.e]+)\\)/),r=document.querySelector('.kite-stage').getBoundingClientRect();return {x:+m[1],y:+m[2],scale:+m[3],stage:{left:r.left,top:r.top,width:r.width,height:r.height},pose:layer.dataset.pose,away:layer.classList.contains('off-stage')};})()");
    await delay(1500);
    const home=await stageKite();
    assert.ok(Math.abs(home.x-(home.stage.left+home.stage.width/2))<25&&home.y>home.stage.top&&home.y<home.stage.top+home.stage.height,'the kite is home on the stage: '+JSON.stringify(home));
    assert.ok(Math.abs(home.scale-2.8)<.05,'largest on the welcome stage');
    assert.equal(await tutorial.webContents.executeJavaScript("[...document.querySelectorAll('.onboarding footer button')].some(b=>b.textContent==='Back')"),false,'Back is hidden on step 1');
    const next=async()=>{await tutorial.webContents.executeJavaScript("[...document.querySelectorAll('.onboarding footer button')].find(b=>b.textContent==='Continue').click()");await delay(100);};
    const tjs=code=>tutorial.webContents.executeJavaScript(code);
    // The microphone check starts by itself; with access denied it says how to allow it (UX-62).
    await next();await delay(200);
    assert.match(await tjs("document.querySelector('.step-status.blocked').textContent"),/Privacy & security/);
    assert.ok(await tjs("[...document.querySelectorAll('.onboarding button')].some(b=>b.textContent==='Try again')"));
    // Keys: Groq, a choice of brain, and an optional voice, with nothing missing here (UX-61).
    await next();
    assert.equal(await tjs("document.querySelectorAll('.brain-card').length"),5);
    assert.equal(await tjs("document.querySelectorAll('.brain-card.chosen').length"),1);
    assert.equal(await tjs("document.querySelector('.step-missing')"),null);
    // The shortcut shows as big keycaps and gets a check once it lands (UX-63).
    await next();
    assert.deepEqual(await tjs("[...document.querySelectorAll('.big-key')].map(k=>k.textContent)"),['Ctrl','Win']);
    // Each key that registers makes the stage kite perk: its nose turns up and the tail gathers (K-07).
    await tjs("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Control',ctrlKey:true}))");await delay(80);
    assert.equal((await stageKite()).pose,'pressed');
    await tjs("window.dispatchEvent(new KeyboardEvent('keyup',{key:'Control'}))");
    tutorial.webContents.send('app:event',{type:'hotkey:detected'});await delay(100);
    assert.ok(await tjs("!!document.querySelector('.big-check')"));
    assert.match(await tutorial.webContents.executeJavaScript("document.querySelector('.onboarding').textContent"),/Nice — I felt that/);
    await next();await next();
    // Circle to ask: the practice ink is the overlay's own pen ink, and the kite flies down to draw with its nose (UX-64, K-07).
    assert.equal(await tjs("document.querySelector('.onboarding-body > .step-status').textContent"),'Circle the chart with your pointer.');
    const pen=await tjs("(()=>{const r=document.querySelector('.tutorial-canvas').getBoundingClientRect();return {x:r.x+252*r.width/500,y:r.y+120*r.height/240,rx:150*r.width/500,ry:60*r.height/240};})()");
    const around=i=>({x:pen.x+pen.rx*Math.cos(i/40*Math.PI*2),y:pen.y+pen.ry*Math.sin(i/40*Math.PI*2)});
    const pointer=(type,p)=>tjs(`document.querySelector('.tutorial-canvas').dispatchEvent(new PointerEvent('${type}',{clientX:${p.x},clientY:${p.y},pointerId:7,button:0,bubbles:true}))`);
    await pointer('pointerdown',around(0));
    for(let i=1;i<=30;i++)await pointer('pointermove',around(i));
    await delay(600);
    const drawing=await stageKite(), nib=around(30);
    assert.ok(drawing.away&&Math.hypot(drawing.x-nib.x,drawing.y-nib.y)<40,'the kite perches by the nib: '+JSON.stringify({drawing,nib}));
    for(let i=31;i<=40;i++)await pointer('pointermove',around(i));
    await pointer('pointerup',around(40));await delay(60);
    assert.ok((await tjs("document.querySelector('.practice-ink').getAttribute('d')")).startsWith('M'));
    assert.equal(await tjs("getComputedStyle(document.querySelector('.practice-ink')).fill"),'rgb(233, 164, 63)','gold, like the real ink');
    assert.match(await tjs("document.querySelector('.onboarding-body > .step-status.heard').textContent"),/^That’s it\./);
    await delay(1500);
    assert.equal((await stageKite()).away,false,'the kite flies home after drawing');
    // A mark that doesn't go round says what to do next.
    await pointer('pointerdown',{x:pen.x-100,y:pen.y});await pointer('pointermove',{x:pen.x,y:pen.y});await pointer('pointermove',{x:pen.x+100,y:pen.y-40});await pointer('pointerup',{x:pen.x+100,y:pen.y-40});await delay(60);
    assert.match(await tjs("document.querySelector('.onboarding-body > .step-status').textContent"),/^Almost\./);
    await next();
    assert.equal(await tutorial.webContents.executeJavaScript("document.querySelector('.onboarding h1').textContent"),'Make yourself at home');
    // The finish is a cheat sheet that follows the user's shortcut, with one way out: Let's fly (UX-65).
    assert.deepEqual(await tjs("[...document.querySelectorAll('.cheat-sheet dd')].map(d=>d.textContent)"),['Hold to talk. Let go to send.','Circle something on your screen, then ask about it.','Cancel','Ask, and I’ll show you the way one step at a time.']);
    assert.equal(await tjs("document.querySelector('.cheat-sheet .keycaps').getAttribute('aria-label')"),'Ctrl + Win');
    assert.equal(await tjs("[...document.querySelectorAll('.onboarding footer button')].map(b=>b.textContent).join()"),'Back,Let’s fly');
    // Let the previous drawing animation settle before comparing the handoff's origin.
    await delay(1500);
    fs.writeFileSync(path.join(temporary,'onboarding.png'),(await tutorial.webContents.capturePage()).toPNG());
    // Let's fly hands the stage kite, where it is and how big, to the overlay (K-07).
    await tjs("[...document.querySelectorAll('.onboarding footer button')].find(b=>b.textContent==='Let’s fly').click()");
    for(let i=0;i<50&&!flights.length;i++)await delay(20);
    const finale=await stageKite();
    assert.equal(snapshot.settings.onboardingComplete,true);
    assert.ok(flights.length===1&&Math.abs(flights[0].x-finale.x)<20&&Math.abs(flights[0].y-finale.y)<20&&Math.abs(flights[0].scale-finale.scale)<.15&&flights[0].scale>1.3,'flies from the stage kite: '+JSON.stringify({flights,finale}));
    tutorial.destroy();
    const history=await create('history');await delay(200);
    assert.equal(await history.webContents.executeJavaScript("document.querySelector('.history-boards strong').textContent"),'TCP diagram');
    await history.webContents.executeJavaScript("document.querySelector('.history-boards button').click()");await delay(50);
    assert.match(await history.webContents.executeJavaScript("document.querySelector('.history-view [role=status]').textContent"),/Replaying/);
    await history.webContents.executeJavaScript("document.querySelector('.history-item').click()");await delay(100);
    // Friendly day groups, human labels for marks and tools, and icon actions (UX-70 to UX-73).
    assert.equal(await history.webContents.executeJavaScript("document.querySelector('.history-day').textContent"),'Today');
    assert.equal(await history.webContents.executeJavaScript("document.querySelector('.annotation-badge').textContent"),'Circled');
    // A kept screenshot shows on the question as a thumbnail that opens larger in place (UX-74).
    assert.match(await history.webContents.executeJavaScript("document.querySelector('.from-user .chat-shot img').src"),/^data:image\//);
    await history.webContents.executeJavaScript("document.querySelector('.chat-shot').click()");await delay(50);
    assert.equal(await history.webContents.executeJavaScript("document.querySelector('.chat-shot').getAttribute('aria-expanded')"),'true');
    assert.equal(await history.webContents.executeJavaScript("document.querySelector('.tool-line summary').textContent"),'Saved a note · you approved');
    assert.equal(await history.webContents.executeJavaScript("document.body.textContent.includes('create_note')"),false);
    await history.webContents.executeJavaScript("document.querySelector('[aria-label=\"Export as Markdown\"]').click()");await delay(60);
    assert.match(await history.webContents.executeJavaScript("document.querySelector('.history-view [role=status]').textContent"),/Exported/);
    fs.writeFileSync(path.join(temporary,'history.png'),(await history.webContents.capturePage()).toPNG());history.destroy();
    const overlay=await create('overlay');
    overlay.webContents.send('cursor:update',{x:350,y:250},{origin:{x:0,y:0},display:{x:0,y:0,width:760,height:960}});
    // "Let's fly": the overlay's kite takes off from where onboarding's was, at its size, loops once, and lands by the cursor at its own (K-07).
    const kiteFrame=async()=>{const m=(await overlay.webContents.executeJavaScript("document.querySelector('.kite-canvas > g').getAttribute('transform')")).match(/translate\(([-\d.e]+) ([-\d.e]+)\) rotate\(([-\d.e]+)\) scale\([-\d.e]+ [-\d.e]+\) rotate\(([-\d.e]+)\) scale\(([-\d.e]+)\)/);return {x:+m[1],y:+m[2],rotation:+m[3]+ +m[4],scale:+m[5]};};
    await delay(200);
    overlay.webContents.send('app:event',{type:'onboarding:done',from:{x:120,y:700,scale:2.8}});await delay(60);
    const takeoff=await kiteFrame();
    assert.ok(Math.hypot(takeoff.x-120,takeoff.y-700)<40&&takeoff.scale>2.4,'takes off from the window: '+JSON.stringify(takeoff));
    // Sample inside the renderer: IPC scheduling must not skip half a loop under load.
    const turned=await overlay.webContents.executeJavaScript(`new Promise(resolve=>{let turned=0,previous=${takeoff.rotation},start=performance.now();const sample=()=>{const m=document.querySelector('.kite-canvas > g').getAttribute('transform').match(/translate\\(([-\\d.e]+) ([-\\d.e]+)\\) rotate\\(([-\\d.e]+)\\) scale\\([-\\d.e]+ [-\\d.e]+\\) rotate\\(([-\\d.e]+)\\) scale\\(([-\\d.e]+)\\)/),rotation=+m[3]+ +m[4];turned+=((rotation-previous)%360+540)%360-180;previous=rotation;if(performance.now()-start>1500)resolve(turned);else requestAnimationFrame(sample);};requestAnimationFrame(sample);})`);
    await delay(1000);
    const landed=await kiteFrame();
    assert.ok(Math.abs(turned)>300,'loops once on the way: '+turned);
    assert.ok(Math.hypot(landed.x-382,landed.y-278)<15&&landed.scale===1,'lands by the cursor at its own size: '+JSON.stringify(landed));
    assert.ok(Math.abs(((landed.rotation+35)%360+540)%360-180)<12,'and settles upright: '+landed.rotation);
    await overlay.webContents.executeJavaScript("window.audioContexts=[];const AC=window.AudioContext;window.AudioContext=class extends AC{constructor(o){super(o);window.audioContexts.push(this);}};window.framesRun=0;function frame(){window.framesRun++;requestAnimationFrame(frame)}requestAnimationFrame(frame);");
    const send=event=>overlay.webContents.send('test:voice',{id:1,...event});
    send({type:'model:changed',text:'Running on Test now!'});send({type:'tts:start'});send({type:'llm:delta',text:'Hello world.'});
    send({type:'tts:timestamps',timestamps:{words:['Hello','world'],start:[0,4],end:[1,4.5]}});
    send({type:'tts:chunk',audio:new Float32Array(44100*5).buffer});send({type:'tts:done'});send({type:'llm:done'});
    for(let i=0;i<100 && !reports.some(r=>r.event==='started');i++)await delay(50);
    await delay(100);
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.bubble-reply').textContent"),'Hello world.','all available text is readable before speech reaches the second word');
    await overlay.webContents.executeJavaScript("document.querySelector('.speech-bubble').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}))");await delay(50);
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.bubble-reply').textContent"),'Hello world.');
    // The answer ends with who answered (the Settings step above switched to Claude Sonnet 5), then Copy, Pin, and Open in History (UX-14).
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.bubble-footer .model-chip').textContent"),'Claude Sonnet 5');
    // One short announcement per state; the streaming bubble itself is not a live region (UX-91).
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.speech-bubble').getAttribute('aria-live')"),null);
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.speech-bubble .sr-only').textContent"),'Answer ready');
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.bubble-footer [aria-label=\"Keep this open\"]')"),null,'answers stay open without a pin');
    send({type:'voice:aborted'});await delay(100);
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.speech-bubble').getAttribute('aria-hidden')"),'true');
    assert.ok(reports.some(r=>r.event==='started'));
    assert.ok(!reports.some(r=>r.event==='failed'));
    // A tap that is too short gets a one-line pill that says what to do, not a clipped "?" card.
    overlay.webContents.send('test:voice',{id:50,type:'ptt:start'});await delay(50);
    // The kite's accessible name follows its state (design.md K-16).
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.kite-canvas').getAttribute('aria-label')"),'Kite, listening');
    // Listening is a compact pill with a level meter and the release/cancel hint, not a full card (UX-12).
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.speech-bubble.compact .bubble-status').textContent"),'Listening · release to send · Esc to cancel');
    assert.equal(screenMarks.length,0,'listening alone does not request a capture');
    overlay.webContents.send('test:voice',{id:50,type:'ptt:tooShort'});await delay(80);
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.speech-bubble.compact .bubble-reply').textContent"),'Hold a bit longer while you speak.');
    assert.equal(await overlay.webContents.executeJavaScript("[...document.querySelectorAll('.speech-bubble button')].some(b=>/Keyboard controls/.test(b.textContent))"),false);
    // Errors: what happened as a title, one sentence of help, one action (UX-15).
    overlay.webContents.send('test:voice',{id:60,type:'ptt:start'});await delay(40);
    overlay.webContents.send('test:voice',{id:60,type:'llm:error',title:'I need a Groq key to hear you',text:'Add one in Settings, then hold your shortcut again.',settings:true,setup:true});await delay(80);
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.bubble-error.setup strong').textContent"),'I need a Groq key to hear you');
    assert.equal(await overlay.webContents.executeJavaScript("[...document.querySelectorAll('.speech-bubble button.primary')].map(b=>b.textContent).join()"),'Open settings');
    overlay.webContents.send('test:voice',{id:2,type:'model:changed',text:'Preview'});await delay(60);
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.speech-bubble.compact .bubble-status')?.textContent"),'Thinking');
    overlay.webContents.send('test:voice',{id:2,type:'tts:start'});
    overlay.webContents.send('test:voice',{id:2,type:'llm:delta',text:'Streaming without timestamps.'});
    overlay.webContents.send('test:voice',{id:2,type:'tts:chunk',audio:new Float32Array(44100*3).buffer});
    for(let i=0;i<100 && !reports.some(r=>r.id===2 && r.event==='started');i++)await delay(50);
    await delay(400);
    assert.match(await overlay.webContents.executeJavaScript("document.querySelector('.bubble-reply').textContent"),/Streaming without timestamps/);
    overlay.webContents.send('test:voice',{id:2,type:'tts:stop'});
    overlay.webContents.send('test:voice',{id:2,type:'llm:done'});await delay(100);
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.speech-bubble').getAttribute('aria-hidden')"),'false');
    const card={approvalId:'test-approval',toolName:'type_text',summary:'Paste "meeting at 5" into Notepad — “Blank test note”?',input:{text:'meeting at 5'},expiresAt:Date.now()+30000,dryRun:false};
    overlay.webContents.send('test:voice',{id:2,type:'tool:approvalRequired',approval:card});await delay(100);
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.approval-summary').textContent"),card.summary);
    // The decision is the first thing in the bubble; the answer before it folds into one line below (UX-23).
    assert.ok(await overlay.webContents.executeJavaScript("document.querySelector('.speech-bubble .bubble-body').firstElementChild.classList.contains('approval-card')"));
    assert.deepEqual(await overlay.webContents.executeJavaScript("(()=>{const d=document.querySelector('.bubble-earlier');return [d.open,d.querySelector('summary').textContent];})()"),[false,'Streaming without timestamps.']);
    assert.match(await overlay.webContents.executeJavaScript("document.querySelector('.approval-card pre').textContent"),/meeting at 5/);
    assert.match(await overlay.webContents.executeJavaScript("document.querySelector('.approval-countdown').textContent"),/30|29/);
    // The primary button names the action; the voice hint follows the user's shortcut.
    assert.deepEqual(await overlay.webContents.executeJavaScript("[...document.querySelectorAll('.approval-buttons button')].map(b=>b.textContent)"),['Paste text','Not now']);
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.speech-bubble .sr-only').textContent"),'Kite asks: '+card.summary);
    assert.match(await overlay.webContents.executeJavaScript("document.querySelector('.approval-card').textContent"),/Or hold Ctrl \+ Win and say “yes” or “no”/);
    // The question is the title; the tool id and arguments wait behind Details; the countdown says what happens (UX-22).
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.approval-details summary').textContent"),'Details');
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.approval-details code').textContent"),'type_text');
    // Pasting is a sensitive tier: framed, with a line saying what leaves the PC (UX-21).
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.approval-card.sensitive .approval-flow').textContent"),'Pastes into the reviewed window only. Nothing leaves this PC.');
    assert.match(await overlay.webContents.executeJavaScript("document.querySelector('.approval-countdown').textContent"),/Auto-cancels in (30|29) s/);
    // The bubble's tail is aimed at the kite (UX-13).
    assert.match(await overlay.webContents.executeJavaScript("document.querySelector('.speech-bubble').style.getPropertyValue('--tail-y')"),/^\d+px$/);
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
    // A capture is a shutter blink: one thin gold ring opens around the kite, and nothing filters it (design.md K-10).
    assert.ok(+(await overlay.webContents.executeJavaScript("document.querySelector('.kite-shutter').getAttribute('opacity')"))>.3,'the shutter ring shows');
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.kite-canvas > g').style.filter"),'');
    assert.notEqual(await overlay.webContents.executeJavaScript("getComputedStyle(document.querySelector('.kite-glint-body')).stopColor"),'rgb(0, 0, 0)','the sail gradient resolves');
    overlay.webContents.send('test:voice',{id:3,type:'ptt:start'});await delay(60);
    // Muted: the tail greys out with a slash across it, and there is no emoji anywhere on the kite (K-10).
    overlay.webContents.send('test:voice',{id:3,type:'voice:muted'});await delay(60);
    assert.ok(await overlay.webContents.executeJavaScript("document.querySelector('.kite-tail').classList.contains('muted')&&document.querySelector('.kite-mute-slash').getAttribute('opacity')==='1'&&document.querySelector('.kite-mute-slash path').getAttribute('d').startsWith('M')"),'a muted tail greys out and gets a slash');
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.kite-canvas').textContent"),'','no emoji on the kite');
    await delay(350);assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.kite-shutter').getAttribute('opacity')"),'0','the ring has faded');
    overlay.webContents.send('screen:event',{type:'annotate',id:3,display:{id:1,bounds:{x:0,y:0,width:760,height:960},scaleFactor:1},origin:{x:0,y:0}});await delay(60);
    assert.equal(await overlay.webContents.executeJavaScript("getComputedStyle(document.querySelector('.annotation')).cursor"),'default');
    // An ordinary hold has no screen-selection hint; the first deliberate mark starts capture.
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.mark-hint')"),null);
    for(let stroke=0;stroke<6;stroke++){
      const x=100+stroke*40,y=700;
      overlay.webContents.sendInputEvent({type:'mouseDown',x,y,button:'left',clickCount:1});
      if(!stroke){await delay(50);assert.equal(await overlay.webContents.executeJavaScript("document.querySelector('.mark-hint').textContent"),'Circle, underline, point, or tap · up to 5');}
      overlay.webContents.sendInputEvent({type:'mouseMove',x:x+15,y:y+20,button:'left'});
      overlay.webContents.sendInputEvent({type:'mouseUp',x:x+15,y:y+20,button:'left',clickCount:1});
      await delay(30);
    }
    assert.equal(await overlay.webContents.executeJavaScript("document.querySelectorAll('.annotation path').length"),5);
    assert.equal(await overlay.webContents.executeJavaScript("getComputedStyle(document.querySelector('.annotation')).cursor"),'crosshair');
    assert.deepEqual(screenMarks,[3],'one capture per marked hold');
    // Once marking starts the hint gives way to a count (UX-41).
    assert.equal(await overlay.webContents.executeJavaScript("[...document.querySelectorAll('.mark-hint')].map(h=>h.textContent).join()"),'5 of 5');
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
    // Guide mode: marker ring, step card beside (never over) the target, the kite flying over to point, and controls.
    const guideActions=[],guideBounds=[];ipcMain.on('test:guide',(_e,action)=>guideActions.push(action));ipcMain.on('test:guideBounds',(_e,bounds)=>guideBounds.push(bounds));
    overlay.webContents.send('test:voice',{id:149,type:'voice:aborted'});await delay(100);
    const js=code=>overlay.webContents.executeJavaScript(code);
    const view={id:9,goal:'Add a footer',app:'Word',index:0,total:3,completed:0,instruction:'Click the Insert tab.',target:'Insert',status:'pointing',rect:{x:300,y:120,width:60,height:26},display:{x:0,y:0,width:760,height:960},source:'uia',verified:true};
    overlay.webContents.send('guide:state',view);await delay(900);
    assert.equal(await js("document.querySelectorAll('.guide-ring path').length"),2);
    assert.equal(await js("getComputedStyle(document.querySelector('.kite-canvas')).opacity"),'1','clear of other controls, the kite is solid');
    const crowd=[];for(let x=0;x<760;x+=40)for(let y=0;y<960;y+=30)if(!(x<366&&x+36>294&&y<152&&y+26>114))crowd.push({x,y,width:36,height:26});
    overlay.webContents.send('guide:state',{...view,nearby:crowd});await delay(200);
    assert.equal(await js("Number(getComputedStyle(document.querySelector('.kite-canvas')).opacity).toFixed(2)"),'0.85','over neighbouring labels, the kite lets them show through (K-08)');
    overlay.webContents.send('guide:state',view);await delay(200);
    assert.match(await js("document.querySelector('.guide-card').textContent"),/Step 1 of 3.*Click the Insert tab\..*Insert/);
    // The goal titles the card, the control is a keycap, and there is no Back on step 1 (UX-30, UX-32).
    assert.equal(await js("document.querySelector('.guide-goal').textContent+' '+document.querySelector('.guide-app').textContent"),'Add a footer · Word');
    assert.equal(await js("document.querySelector('.guide-key').textContent"),'Insert');
    assert.equal(await js("[...document.querySelectorAll('.guide-actions button')].some(b=>b.textContent==='Back')"),false);
    const cardRect=await js("JSON.parse(JSON.stringify(document.querySelector('.guide-card').getBoundingClientRect()))");
    assert.ok(cardRect.y>=view.rect.y+view.rect.height||cardRect.y+cardRect.height<=view.rect.y,'card never covers the target');
    assert.ok(guideBounds.some(b=>b&&b.width>200),'card bounds reported for hit testing');
    const kiteAt=async()=>(await js("document.querySelector('.kite-canvas > g').getAttribute('transform')")).match(/translate\(([-\d.]+) ([-\d.]+)\)/).slice(1).map(Number);
    const [kx,ky]=await kiteAt();
    assert.ok(Math.hypot(kx-330,ky-133)<110&&Math.hypot(kx-(350+32),ky-(250+28))>60,'kite flew from the cursor to the control: '+[kx,ky]);
    fs.writeFileSync(path.join(temporary,'guide.png'),(await overlay.webContents.capturePage()).toPNG());
    await js("[...document.querySelectorAll('.guide-actions button')].find(b=>b.textContent==='Skip').click()");
    await js("[...document.querySelectorAll('.guide-actions button')].find(b=>b.textContent==='Pause').click()");
    await js("document.querySelector('.guide-stop').click()");await delay(50);
    assert.deepEqual(guideActions,['next','pause','stop']);
    overlay.webContents.send('guide:state',{...view,index:1,completed:1,instruction:'Click Footer.',target:'Footer',rect:{x:420,y:120,width:50,height:40}});await delay(100);
    assert.match(await js("document.querySelector('.guide-card').textContent"),/Step 2 of 3.*Click Footer\./);
    // While the next control is found, the tail's three dots wave after its name; no blinking keycap (UX-06).
    overlay.webContents.send('guide:state',{...view,index:1,status:'locating',target:'Footer',rect:null});await delay(100);
    assert.ok(await js("!!document.querySelector('.guide-target .busy-dots')&&getComputedStyle(document.querySelector('.guide-key')).animationName==='none'"));
    // Lost always offers a way forward: Look again re-runs the search; Skip step moves on (UX-31).
    overlay.webContents.send('guide:state',{...view,index:1,status:'lost',target:'Footer',rect:null});await delay(100);
    assert.deepEqual(await js("[...document.querySelectorAll('.guide-actions button')].map(b=>b.textContent)"),['Look again','Skip step','Stop']);
    assert.match(await js("document.querySelector('.guide-instruction').textContent"),/Bring Word to the front/);
    await js("[...document.querySelectorAll('.guide-actions button')].find(b=>b.textContent==='Look again').click()");await delay(30);
    assert.equal(guideActions.at(-1),'repeat');
    overlay.webContents.send('guide:state',{...view,index:1,status:'paused'});await delay(100);
    assert.equal(await js("document.querySelectorAll('.guide-ring path').length"),0,'no ring while paused');
    assert.match(await js("document.querySelector('.guide-card').textContent"),/Paused on step 2.*Resume/);
    overlay.webContents.send('guide:state',{...view,index:2,status:'done',rect:null,display:null});await delay(100);
    assert.match(await js("document.querySelector('.guide-card').textContent"),/All done/);
    overlay.webContents.send('guide:state',null);await delay(100);
    assert.equal(await js("document.querySelector('.guide-card')"),null);
    assert.equal(guideBounds.at(-1),null,'hit-test bounds cleared with the card');
    // Whiteboard: elements draw stroke by stroke while the kite holds the pen, then controls, highlight, and export.
    const { layoutScene, applyBeat } = require('../src/shared/board.ts'); const { demoLesson } = require('../src/main/board/service.ts');
    const boardActions=[],drawnAcks=[],boardBounds=[],exported=[];
    ipcMain.on('test:board',(_e,action)=>boardActions.push(action));ipcMain.on('test:boardDrawn',(_e,id,key)=>drawnAcks.push([id,key]));ipcMain.on('test:boardBounds',(_e,bounds)=>boardBounds.push(bounds));
    ipcMain.handle('test:boardExport',(_e,action,png,title)=>{exported.push({action,png:Buffer.from(png),title});return {ok:true};});
    overlay.webContents.send('guide:state',null);overlay.webContents.send('cursor:update',{x:700,y:900},{origin:{x:0,y:0},display:{x:0,y:0,width:760,height:960}});
    const beats=demoLesson.beats, lesson=n=>layoutScene(beats.slice(0,n).reduce(applyBeat,[]));
    const thumbnails=[];ipcMain.on('test:thumbnail',(_e,id,png)=>thumbnails.push({id,png:Buffer.from(png)}));
    const boardView={id:3,savedId:'render-save',title:'How a kite flies',status:'playing',beat:1,total:beats.length,caption:beats[1].say,note:null,elements:lesson(2),drawing:{key:1,beat:1,ids:['wind1','wind2'],durationMs:2600},highlight:['kite']};
    overlay.webContents.send('board:state',{...boardView,beat:0,caption:beats[0].say,elements:lesson(1),drawing:{key:0,beat:0,ids:['title','kite'],durationMs:1800},highlight:[]});
    await delay(500);
    assert.equal(await js("document.querySelectorAll('.board [data-el]').length"),2);
    const frame=await js("JSON.parse(JSON.stringify(document.querySelector('.board').getBoundingClientRect()))");
    const inFrame=([x,y])=>x>=frame.x-40&&x<=frame.x+frame.width+40&&y>=frame.y-40&&y<=frame.y+frame.height+40;
    assert.ok(inFrame(await kiteAt()),'the kite flew from the cursor to the board to draw: '+(await kiteAt()));
    fs.writeFileSync(path.join(temporary,'board-drawing.png'),(await overlay.webContents.capturePage()).toPNG());
    for(let i=0;i<120&&!drawnAcks.some(a=>a[1]===0);i++)await delay(50);
    assert.deepEqual(drawnAcks[0],[3,0],'the overlay reports each drawn beat');
    overlay.webContents.send('board:state',boardView);await delay(200);
    assert.equal(await js("document.querySelectorAll('.board-ring path').length"),2,'highlighted element is circled');
    assert.match(await js("document.querySelector('.board-caption').textContent"),/Wind blows/);
    // While the line is being heard, the caption can stay for screen readers only.
    overlay.webContents.send('board:state',{...boardView,captions:false});await delay(80);
    assert.equal(await js("document.querySelector('.board-caption > .sr-only')?.textContent"),boardView.caption,'heard lines are hidden but still announced');
    overlay.webContents.send('board:state',boardView);await delay(80);
    for(let i=0;i<120&&!drawnAcks.some(a=>a[1]===1);i++)await delay(50);
    assert.ok(drawnAcks.some(a=>a[0]===3&&a[1]===1));
    // The final frame, fully drawn, with the text written out and nothing left mid-animation.
    overlay.webContents.send('board:state',{...boardView,status:'done',beat:5,caption:'',note:'That’s the picture. Ask me anything about it.',elements:lesson(beats.length),drawing:null,highlight:[]});await delay(300);
    assert.equal(await js("document.querySelectorAll('.board [data-el]').length"),layoutScene(beats.reduce(applyBeat,[])).length);
    assert.equal(await js("[...document.querySelectorAll('.board [data-kind]')].filter(n=>n.style.strokeDashoffset||n.getAttribute('clip-path')||n.style.opacity==='0').length"),0,'nothing is left half drawn');
    assert.match(await js("document.querySelector('.board text').textContent"),/How a kite flies/);
    assert.ok(boardBounds.some(b=>b&&b.width>400),'board bounds reported for hit testing');
    fs.writeFileSync(path.join(temporary,'board.png'),(await overlay.webContents.capturePage()).toPNG());
    for(let i=0;i<100&&!thumbnails.length;i++)await delay(50);
    assert.equal(thumbnails[0].id,'render-save');
    const thumbSize=nativeImage.createFromBuffer(thumbnails[0].png).getSize();
    assert.ok(thumbSize.width>0&&thumbSize.height>0&&Math.max(thumbSize.width,thumbSize.height)<=420,'archive thumbnail is a small PNG');
    await js("[...document.querySelectorAll('.board-tools button')].find(b=>b.textContent==='Copy').click()");
    for(let i=0;i<100&&!exported.length;i++)await delay(50);
    assert.equal(exported[0].action,'copy');assert.equal(exported[0].title,'How a kite flies');
    assert.deepEqual([...exported[0].png.subarray(0,4)],[0x89,0x50,0x4e,0x47],'exports a PNG');
    fs.writeFileSync(path.join(temporary,'board-export.png'),exported[0].png);
    assert.ok(nativeImage.createFromBuffer(exported[0].png).getSize().width>600,'export is cropped to the content at 2x');
    // Presentation mode: the button asks main, and a presenting view fills most of the screen, then returns.
    await js("[...document.querySelectorAll('.board-tools button')].find(b=>b.textContent==='Bigger').click()");
    const smallFrame=await js("JSON.parse(JSON.stringify(document.querySelector('.board').getBoundingClientRect()))");
    overlay.webContents.send('board:state',{...boardView,status:'done',beat:5,caption:'',note:'x',elements:lesson(beats.length),drawing:null,highlight:[],presenting:true});await delay(150);
    const bigFrame=await js("JSON.parse(JSON.stringify(document.querySelector('.board').getBoundingClientRect()))");
    assert.ok(bigFrame.width>smallFrame.width&&bigFrame.height>=smallFrame.height,'presenting is bigger: '+JSON.stringify([smallFrame,bigFrame]));
    overlay.webContents.send('board:state',{...boardView,status:'done',beat:5,caption:'',note:'x',elements:lesson(beats.length),drawing:null,highlight:[],presenting:false});await delay(150);
    assert.equal(await js("document.querySelector('.board').getBoundingClientRect().width"),smallFrame.width,'and goes back');
    boardActions.splice(boardActions.indexOf('bigger'),1);
    await js("[...document.querySelectorAll('.board-tools button')].find(b=>b.textContent==='Replay').click()");
    await js("document.querySelector('.board-close').click()");await delay(50);
    overlay.webContents.send('board:state',{...boardView,status:'paused',note:'Paused. Say “continue” when you’re ready.',drawing:null});await delay(100);
    await js("[...document.querySelectorAll('.board-tools button')].find(b=>b.textContent==='Resume').click()");
    await js("[...document.querySelectorAll('.board-tools button')].find(b=>b.textContent==='Next').click()");await delay(50);
    assert.deepEqual(boardActions,['replay','close','resume','next']);
    overlay.webContents.send('board:state',null);await delay(100);
    assert.equal(await js("document.querySelector('.board')"),null);
    assert.equal(boardBounds.at(-1),null,'hit-test bounds cleared with the board');
    // Phase 3: actual SVG cue onsets, simultaneous swaps/bound arrows, erasure, formulas and navigation.
    const cueAcks=[];ipcMain.on('test:boardCue',(_e,id,key,expected,actual)=>cueAcks.push({id,key,expected,actual,errorMs:Math.abs(actual-expected)}));
    const input=[{id:'a',type:'rectangle',label:'7',x:80,y:160,width:160,height:80},{id:'b',type:'rectangle',label:'3',x:380,y:160,width:160,height:80},{id:'edge',type:'arrow',from:'a',to:'b'}];
    const teach={id:30,title:'Array values',status:'playing',beat:0,total:3,caption:'Seven precedes three.',note:null,elements:layoutScene(input),highlight:[],teaching:true,speed:1,
      drawing:{key:30,beat:0,ids:['a','b','edge'],durationMs:1500,cues:[{id:'a',startMs:200,durationMs:500},{id:'b',startMs:700,durationMs:500},{id:'edge',startMs:1200,durationMs:300}]}};
    overlay.webContents.send('board:state',teach);
    for(let i=0;i<100&&!drawnAcks.some(a=>a[0]===30&&a[1]===30);i++)await delay(30);
    assert.equal(cueAcks.filter(a=>a.key===30).length,3);assert.ok(cueAcks.filter(a=>a.key===30).every(a=>a.errorMs<=250),'cue onset follows the drawing clock within 250 ms: '+JSON.stringify(cueAcks));
    assert.equal(await js("document.querySelectorAll('.board-beats button').length"),3);
    await js("document.querySelector('.board-beats button:last-child').click(); document.querySelector('[aria-label=\"Lesson speed\"]').value='1.5';document.querySelector('[aria-label=\"Lesson speed\"]').dispatchEvent(new Event('change',{bubbles:true}))");
    assert.deepEqual(boardActions.at(-2),{type:'jump',beat:2});assert.deepEqual(boardActions.at(-1),{type:'speed',speed:1.5});
    const swapped=input.map(e=>e.id==='a'?{...e,x:380}:e.id==='b'?{...e,x:80}:e);
    overlay.webContents.send('board:state',{...teach,beat:1,elements:layoutScene(swapped),drawing:{key:31,beat:1,ids:['a','b','edge'],durationMs:700,cues:[{id:'a',startMs:0,durationMs:300},{id:'b',startMs:0,durationMs:300},{id:'edge',startMs:0,durationMs:300}]},transition:{before:layoutScene(input),erased:[],changed:['a','b','edge']},effects:[{kind:'dim',ids:['a']},{kind:'pulse',ids:['a']},{kind:'badge',id:'a',number:1}]});
    await delay(100);assert.ok(await js("!!document.querySelector('[data-el=a]').getAttribute('transform')&&!!document.querySelector('[data-el=b]').getAttribute('transform')"),'both values move in the same frame');
    fs.writeFileSync(path.join(temporary,'board-teaching.png'),(await overlay.webContents.capturePage()).toPNG());
    for(let i=0;i<100&&!drawnAcks.some(a=>a[1]===31);i++)await delay(30);
    assert.ok(drawnAcks.some(a=>a[1]===31),'swap and emphasis finish');
    const final=[{...swapped[0],label:'4'}];
    overlay.webContents.send('board:state',{...teach,beat:2,elements:layoutScene(final),drawing:{key:32,beat:2,ids:['a'],durationMs:900,cues:[{id:'a',startMs:0,durationMs:500}]},transition:{before:layoutScene(swapped),erased:['b','edge'],changed:['a']},effects:[{kind:'underline',ids:['a']},{kind:'strike',ids:['a']}],recap:true,highlight:['a']});
    await delay(100);assert.ok(await js("!!document.querySelector('[data-el=b]')"),'erased values remain for the eraser animation');
    for(let i=0;i<100&&!drawnAcks.some(a=>a[1]===32);i++)await delay(30);
    assert.ok(drawnAcks.some(a=>a[1]===32));
    overlay.webContents.send('board:state',{...teach,status:'asking',beat:2,elements:layoutScene(final),drawing:null,note:'Which value remains?',breadcrumbs:['Sorting']});await delay(100);
    assert.match(await js("document.querySelector('.board-caption').textContent"),/Sorting.*Which value remains/);assert.equal(await js("document.querySelector('[data-el=b]')"),null);
    await js("[...document.querySelectorAll('.board-tools button')].find(b=>b.textContent==='Go back').click()");assert.equal(boardActions.at(-1),'back');
    const {compileScript}=require('../src/shared/board/compile.ts'),{formulaPaths,closeMathWorker}=require('../src/main/board/math.ts');
    let maths;try{maths=await compileScript({version:2,title:'Solve for x',family:'steps',mode:'new',nodes:[{id:'eq',label:'Subtract two',tex:'x+2=5'},{id:'answer',label:'Answer',tex:'x=3'}],edges:[],beats:[{say:'Subtract two.',reveal:['eq','answer']}]},{formula:formulaPaths});}finally{closeMathWorker();}
    const mathElements=layoutScene(maths.beats.reduce(applyBeat,[]));overlay.webContents.send('board:state',{...teach,id:31,title:maths.title,status:'done',beat:0,total:1,elements:mathElements,drawing:null,note:'x equals three.'});await delay(200);
    assert.ok(await js("document.querySelector('[data-el=eq] path').getTotalLength()>0"));fs.writeFileSync(path.join(temporary,'board-maths.png'),(await overlay.webContents.capturePage()).toPNG());
    if(process.env.KITE_BOARD_PHASE3_REPORT){const out=path.resolve(process.env.KITE_BOARD_PHASE3_REPORT);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({checkedAt:new Date().toISOString(),conditions:'Real offscreen overlay, ordinary motion, synthetic cue timings with voice off. Measures SVG onset against its local drawing clock, not live Cartesia word accuracy or network dead air.',cueAcks,medianCueErrorMs:cueAcks.filter(a=>a.key===30).map(a=>a.errorMs).sort((a,b)=>a-b)[1],liveVoiceGate:'Measured separately in phase3-live.json; this report uses synthetic cue timings',clarityGate:'pending human/provider comparison'},null,2)+'\n');}
    overlay.webContents.send('board:state',null);await delay(80);
    // Tasks: the approval card offers task-wide or step-by-step trust; the task card shows progress, confirmations, and Stop.
    const taskActions=[],taskBounds=[];ipcMain.on('test:task',(_e,a)=>taskActions.push(a));ipcMain.on('test:taskBounds',(_e,b)=>taskBounds.push(b));
    overlay.webContents.send('test:voice',{id:300,type:'model:changed',text:'Preview'});await delay(50);
    const taskCard={approvalId:'task-approval',toolName:'do_task',summary:'Let me do this in Notepad: "Write a haiku"? I\'ll click and type in Notepad only, never move your mouse, ask before anything that sends, deletes, buys, or submits, and stop after 15 steps.',input:{goal:'Write a haiku',app:'Notepad'},expiresAt:Date.now()+30000,dryRun:false};
    overlay.webContents.send('test:voice',{id:300,type:'tool:approvalRequired',approval:taskCard});await delay(100);
    assert.deepEqual(await js("[...document.querySelectorAll('.approval-buttons button')].map(b=>b.textContent)"),['Start','Hands-off for this job','Step by step','Not now']);
    assert.match(await js("document.querySelector('.approval-card').textContent"),/“Start” follows your Balanced permissions/);
    await js("[...document.querySelectorAll('.approval-buttons button')].find(b=>b.textContent==='Step by step').click()");await delay(100);
    assert.deepEqual(decisions.at(-1),{id:'task-approval',approved:true,scope:'once'});
    overlay.webContents.send('test:voice',{id:300,type:'tool:decision',approval:taskCard,decision:'approved'});overlay.webContents.send('test:voice',{id:300,type:'voice:aborted'});await delay(100);
    // "Order my protein again" (phase 5): the reorder card is the one question; it names the order, its price and the checkout plan.
    const reorderCard={approvalId:'reorder-approval',toolName:'reorder',summary:'Same as last time: Sunfold Whey Protein, 60 sachets, Unflavoured, about ₹2,149, from shop.example.in, to your Home address? I’ll check out like last time, paying by Cash on delivery, and ask again only if the cart or the price has changed.',input:{about:'my protein'},expiresAt:Date.now()+30000,dryRun:false};
    overlay.webContents.send('test:voice',{id:301,type:'model:changed',text:'Preview'});await delay(50);
    overlay.webContents.send('test:voice',{id:301,type:'tool:approvalRequired',approval:reorderCard});await delay(100);
    assert.deepEqual(await js("[...document.querySelectorAll('.approval-buttons button')].map(b=>b.textContent)"),['Order again','Not now']);
    assert.match(await js("document.querySelector('.approval-flow').textContent"),/store’s pages to .*Your saved details stay on this PC\./);
    fs.writeFileSync(path.join(temporary,'reorder.png'),(await overlay.webContents.capturePage()).toPNG());
    await js("document.querySelector('.approval-buttons button').click()");await delay(100);
    assert.deepEqual(decisions.at(-1),{id:'reorder-approval',approved:true});
    overlay.webContents.send('test:voice',{id:301,type:'tool:decision',approval:reorderCard,decision:'approved'});overlay.webContents.send('test:voice',{id:301,type:'voice:aborted'});await delay(100);
    const taskView={id:5,goal:'Write a haiku in Notepad and save it',app:'Notepad',status:'approval',step:3,budget:15,scope:'once',action:'Click “Save” button',risk:null,message:'Okay to do this step?',
      target:{x:200,y:300,width:60,height:24},display:{x:0,y:0,width:760,height:960},log:[{text:'Click “File” menu item',ok:true},{text:'Type into “Text editor” document: “An old pond…”',ok:true}]};
    overlay.webContents.send('task:state',taskView);await delay(900);
    assert.match(await js("document.querySelector('.task-card').textContent"),/Your OK · Notepad.*Step 3 of 15.*Write a haiku.*Next.*Click “Save” button/);
    assert.equal(await js("document.querySelectorAll('.task-layer .guide-ring path').length"),2,'the control is ringed');
    const [tx,ty]=await kiteAt();
    assert.ok(Math.hypot(tx-230,ty-312)<110,'the kite points at the control it is about to use: '+[tx,ty]);
    const taskRect=await js("JSON.parse(JSON.stringify(document.querySelector('.task-card').getBoundingClientRect()))");
    assert.ok(!(taskRect.x<260&&taskRect.x+taskRect.width>200&&taskRect.y<324&&taskRect.y+taskRect.height>300),'the card never covers the control');
    assert.ok(taskBounds.some(b=>b&&b.width>200),'task card bounds reported for hit testing');
    fs.writeFileSync(path.join(temporary,'task.png'),(await overlay.webContents.capturePage()).toPNG());
    await js("[...document.querySelectorAll('.task-approval button')].find(b=>b.textContent==='Allow the rest').click()");
    await js("[...document.querySelectorAll('.task-approval button')].find(b=>b.textContent==='No').click()");
    await js("document.querySelector('.task-stop').click()");
    assert.deepEqual(taskActions,['allowAll','skip','stop']);
    overlay.webContents.send('task:state',{...taskView,status:'approval',scope:'task',risk:'“Delete” button may delete or overwrite something that can’t be undone.',message:'“Delete” button may delete or overwrite something that can’t be undone.',action:'Click “Delete” button',
      ask:{category:'delete',label:'Delete or overwrite',place:'notepad',always:true}});await delay(100);
    assert.deepEqual(await js("[...document.querySelectorAll('.task-approval button')].map(b=>b.textContent)"),['Yes','No'],'risky steps offer no blanket approval');
    // Always and Never remember the answer here (the app or site) or everywhere (ADR 014).
    assert.deepEqual(await js("[...document.querySelectorAll('.task-remember button')].map(b=>b.textContent)"),['Always','Never']);
    assert.deepEqual(await js("[...document.querySelectorAll('.task-remember option')].map(o=>o.textContent)"),['on notepad','everywhere']);
    fs.writeFileSync(path.join(temporary,'task-remember.png'),(await overlay.webContents.capturePage()).toPNG());
    await js("[...document.querySelectorAll('.task-remember button')].find(b=>b.textContent==='Always').click()");
    await js("(()=>{const s=document.querySelector('.task-remember select');s.value='everywhere';s.dispatchEvent(new Event('change',{bubbles:true}));})()");await delay(50);
    await js("[...document.querySelectorAll('.task-remember button')].find(b=>b.textContent==='Never').click()");await delay(50);
    assert.deepEqual(taskActions.slice(-2),['always','neverEverywhere']);
    overlay.webContents.send('task:state',{...taskView,status:'approval',scope:'task',risk:'This may spend money: the total here is ₹2,169.',message:'This may spend money: the total here is ₹2,169.',action:'Click “Place order” button',
      ask:{category:'money',label:'Spend money',place:null,always:false}});await delay(100);
    assert.deepEqual(await js("[...document.querySelectorAll('.task-remember button')].map(b=>b.textContent)"),['Never'],'the floor offers no Always');
    assert.equal(await js("document.querySelector('.task-remember select')"),null,'no place, no choice of where');
    // Hands-off for this job: a tag on the card, and the kite wears its ring.
    overlay.webContents.send('task:state',{...taskView,status:'thinking',scope:'handsOff',action:null,target:null,message:'Looking…'});await delay(150);
    assert.equal(await js("document.querySelector('.task-handsoff').textContent"),'Hands-off');
    assert.equal(await js("document.querySelector('.kite-handsoff').getAttribute('opacity')"),'1');
    assert.match(await js("document.querySelector('.kite-canvas').getAttribute('aria-label')"),/hands-off$/);
    overlay.webContents.send('task:state',{...taskView,status:'done',action:null,target:null,message:'I wrote the haiku and saved it as haiku.txt.'});await delay(100);
    assert.match(await js("document.querySelector('.task-card').textContent"),/Done · Notepad.*saved it as haiku\.txt/);
    assert.equal(await js("document.querySelector('.task-stop')"),null,'no Stop button once finished');
    // A job: the phase checklist (the user's steps marked "You"), and a choice answered from the card.
    const chosen=[];ipcMain.on('test:taskChoose',(_e,i,remember)=>chosen.push(remember?[i,remember]:i));
    const job={url:'https://shop.example/p/whey',choices:[{label:'Whey Protein, one pack of 60 sachets',detail:'₹2,149'},{label:'Whey Protein, two packs of 30',detail:'₹2,298'}],
      phases:[{id:'find',title:'Find it',state:'done'},{id:'choose',title:'Choose',state:'active'},{id:'cart',title:'Add to cart',state:'pending'},{id:'checkout',title:'Check out',state:'yours'},{id:'pay',title:'Pay',state:'yours'}]};
    overlay.webContents.send('task:state',{...taskView,goal:'Find whey protein, 60 sachets, and add it to the cart',app:'Microsoft Edge',status:'asking',action:null,target:null,message:'I found two. Which one?',budget:45,job});await delay(150);
    assert.deepEqual(await js("[...document.querySelectorAll('.job-phases li')].map(li=>li.className+':'+li.textContent)"),['done:✓Find it','active:●Choose','pending:○Add to cart','yours:YouCheck out (you do this)','yours:YouPay (you do this)']);
    assert.equal(await js("document.querySelector('.job-phases [aria-current=step]').textContent"),'●Choose');
    assert.deepEqual(await js("[...document.querySelectorAll('.task-choices button')].map(b=>b.textContent)"),['1Whey Protein, one pack of 60 sachets₹2,149','2Whey Protein, two packs of 30₹2,298','None of these']);
    fs.writeFileSync(path.join(temporary,'task-job.png'),(await overlay.webContents.capturePage()).toPNG());
    await js("document.querySelectorAll('.task-choices button')[1].click()");await js("document.querySelector('.task-choices .choice-none').click()");await delay(50);
    assert.deepEqual(chosen,[1,-1]);
    overlay.webContents.send('task:state',{...taskView,app:'Microsoft Edge',status:'thinking',action:null,target:null,message:'Looking…',job:{...job,choices:null}});await delay(100);
    assert.equal(await js("document.querySelector('.task-choices')"),null,'no choices once answered');
    // Checkout (phase 4): who checks out, with "Remember for this site"; the order card; then the user's turn to pay.
    const checkoutJob={...job,phases:job.phases.map(p=>({...p,state:p.id==='cart'?'done':p.state==='active'?'done':p.state})),remember:'Remember for shop.example.in',
      choices:[{label:'I’ll do it',detail:'I stop here and leave the cart on screen'},{label:'You do it',detail:'I fill in checkout and ask you before placing the order'}]};
    overlay.webContents.send('task:state',{...taskView,app:'Microsoft Edge',status:'asking',action:null,target:null,budget:45,message:'It’s in your cart: Sunfold Whey Protein, 60 sachets, ₹2,149. Do you want to check out yourself, or should I?',job:checkoutJob});await delay(150);
    assert.deepEqual(await js("[...document.querySelectorAll('.task-choices button')].map(b=>b.textContent)"),['1I’ll do itI stop here and leave the cart on screen','2You do itI fill in checkout and ask you before placing the order']);
    assert.equal(await js("document.querySelector('.choice-remember').textContent"),'Remember for shop.example.in');
    await js("document.querySelector('.choice-remember input').click()");await delay(30);
    fs.writeFileSync(path.join(temporary,'task-checkout.png'),(await overlay.webContents.capturePage()).toPNG());
    await js("document.querySelectorAll('.task-choices button')[1].click()");await delay(50);
    assert.deepEqual(chosen.at(-1),[1,true]);
    const order={total:'₹2,169',address:'Asha K, Flat 12, Baner Road, Pune 411045',payment:'UPI',delivery:'Standard delivery'};
    overlay.webContents.send('task:state',{...taskView,app:'Microsoft Edge',status:'approval',scope:'task',budget:45,action:'Click “Place order” button',risk:'This may spend money: the total here is ₹2,169.',
      message:'Place the order for ₹2,169?',ask:null,job:{...checkoutJob,choices:null,remember:null,order}});await delay(150);
    assert.deepEqual(await js("[...document.querySelectorAll('.task-order dt')].map(d=>d.textContent+': '+d.nextElementSibling.textContent)"),['Total: ₹2,169','Deliver to: Asha K, Flat 12, Baner Road, Pune 411045','Payment: UPI','Delivery: Standard delivery']);
    assert.deepEqual(await js("[...document.querySelectorAll('.task-approval button')].map(b=>b.textContent)"),['Place order','No']);
    assert.equal(await js("document.querySelector('.task-remember')"),null,'no Always for placing an order');
    fs.writeFileSync(path.join(temporary,'task-order.png'),(await overlay.webContents.capturePage()).toPNG());
    overlay.webContents.send('task:state',{...taskView,app:'Microsoft Edge',status:'waiting',action:null,target:null,budget:45,message:'Approve the payment request in your UPI app. I’ll wait.',job:{...checkoutJob,choices:null,remember:null}});await delay(150);
    assert.match(await js("document.querySelector('.task-card').textContent"),/Your turn · Microsoft Edge.*Approve the payment request in your UPI app/);
    assert.deepEqual(await js("[...document.querySelectorAll('.task-actions button')].map(b=>b.textContent)"),['I’ve paid','Stop']);
    await js("[...document.querySelectorAll('.task-actions button')].find(b=>b.textContent==='I’ve paid').click()");await delay(30);
    assert.equal(taskActions.at(-1),'resume');
    overlay.webContents.send('task:state',null);await delay(100);
    assert.equal(await js("document.querySelector('.task-card')"),null); assert.equal(taskBounds.at(-1),null);
    // Overlay delight (UX-16 to UX-18, design.md K-09).
    overlay.webContents.send('cursor:update',{x:350,y:250},{origin:{x:0,y:0},display:{x:0,y:0,width:760,height:960}});await delay(300);
    const voice=(id,event)=>overlay.webContents.send('test:voice',{id,...event});
    voice(400,{type:'ptt:start'});await delay(40);voice(400,{type:'ptt:stop'});await delay(40);
    voice(400,{type:'llm:delta',text:'## Add a footer\n1. Open **Insert**\n\n2. Click `Footer`\n- Pick *Blank*\n\nMore at [Microsoft](https://support.microsoft.com/word).'});
    voice(400,{type:'llm:done'});await delay(300);
    // An answer reads as a heading line, lists, and marks; a link is a chip that copies and never navigates (UX-17).
    assert.equal(await js("document.querySelector('.bubble-reply .md-heading').textContent"),'Add a footer');
    assert.deepEqual(await js("[...document.querySelectorAll('.bubble-reply ol li')].map(l=>l.textContent)"),['Open Insert','Click Footer']);
    assert.equal(await js("document.querySelector('.bubble-reply ul li em').textContent"),'Blank');
    assert.equal(await js("document.querySelector('.bubble-reply a')"),null,'nothing in an answer navigates');
    await js("document.querySelector('.link-chip').click()");await delay(30);
    assert.equal(await js("document.querySelector('.link-chip').textContent"),'Copied');
    // The bubble is placed with translate and grows from the side facing the kite; it collapses back on dismiss (UX-16).
    const grown=await js("(()=>{const b=document.querySelector('.speech-bubble'),s=getComputedStyle(b);return {translate:b.style.translate,transform:s.transform,origin:s.transformOrigin};})()");
    assert.ok(/px/.test(grown.translate)&&grown.transform==='none',JSON.stringify(grown));
    voice(400,{type:'voice:aborted'});await delay(350);
    assert.equal(await js("getComputedStyle(document.querySelector('.speech-bubble')).transform"),'none','reading panel fades without scaling its text');
    // Something finished well: one loop-de-loop in place, while the bubble holds still beside it (K-09).
    voice(401,{type:'ptt:start'});await delay(40);voice(401,{type:'ptt:stop'});await delay(40);voice(401,{type:'tool:executing'});await delay(200);
    voice(401,{type:'tool:result',success:true,text:'Saved your note.'});
    let looped=0,last=(await kiteFrame()).rotation;const places=new Set();
    for(let i=0;i<40;i++){await delay(30);const f=await kiteFrame();looped+=((f.rotation-last)%360+540)%360-180;last=f.rotation;if(i<14)places.add(await js("document.querySelector('.speech-bubble').style.translate"));}
    assert.ok(Math.abs(looped)<45,'no celebration flight while reading: '+looped);
    assert.equal(places.size,1,'the bubble holds still during the loop');
    // A reminder tugs toward its bubble for a few seconds, then the kite settles (K-09).
    voice(401,{type:'reminder:fired'});await delay(100);
    const side=await js("document.querySelector('.speech-bubble').dataset.side")==='left'?-1:1;let tug=0;
    for(let i=0;i<30;i++){await delay(40);tug=Math.max(tug,((await kiteFrame()).x-382)*side);}
    assert.ok(tug<2.5,'no repeated reminder tug while reading: '+tug);
    await delay(2600);assert.ok(Math.abs((await kiteFrame()).x-382)<1.5,'then settles');
    await js("[...document.querySelectorAll('.speech-bubble button')].find(b=>b.textContent==='Dismiss reminder').click()");
    voice(401,{type:'voice:aborted'});await delay(300);
    await js("[...document.querySelectorAll('.bubble-header button')].find(b=>b.textContent==='Close')?.click()");await delay(50);
    // App notices come from the kite as a small bubble; they wait while an answer shows, and an update offers Restart (UX-18).
    voice(402,{type:'ptt:start'});await delay(60);
    overlay.webContents.send('app:event',{type:'update:ready'});await delay(400);
    assert.equal(await js("document.querySelector('.speech-bubble.notice.visible')"),null,'waits while Kite is listening');
    voice(402,{type:'ptt:cancel'});await delay(100);
    await js("[...document.querySelectorAll('.bubble-header button')].find(b=>b.textContent==='Close')?.click()");await delay(400);
    assert.equal(await js("document.querySelector('.speech-bubble.notice.visible [role=status]').textContent"),'I have an update ready.');
    assert.match(await js("document.querySelector('.speech-bubble.notice').style.translate"),/px/,'placed beside the kite');
    await js("[...document.querySelectorAll('.speech-bubble.notice button')].find(b=>b.textContent==='Restart').click()");await delay(250);
    assert.deepEqual(abouts,['restart']);
    assert.equal(await js("document.querySelector('.speech-bubble.notice.visible')"),null,'the notice closes once used');
    // Memory is never silent: "Saved … · Undo · Edit" by the kite; saved values asked for are shown here, never to a model.
    overlay.webContents.send('app:event',{type:'memory:saved',token:'tok-1',text:'Saved your home pincode'});await delay(400);
    assert.equal(await js("document.querySelector('.speech-bubble.notice.visible [role=status]').textContent"),'Saved your home pincode.');
    assert.deepEqual(await js("[...document.querySelectorAll('.speech-bubble.notice button')].map(b=>b.textContent)"),['Undo','Edit']);
    fs.writeFileSync(path.join(temporary,'memory-notice.png'),(await overlay.webContents.capturePage()).toPNG());
    await js("[...document.querySelectorAll('.speech-bubble.notice button')].find(b=>b.textContent==='Undo').click()");await delay(250);
    assert.deepEqual(memoryCalls.at(-1),['undo','tok-1']);
    overlay.webContents.send('app:event',{type:'memory:saved',token:'tok-2',text:'Updated your phone number'});await delay(400);
    await js("[...document.querySelectorAll('.speech-bubble.notice button')].find(b=>b.textContent==='Edit').click()");await delay(250);
    assert.deepEqual(memoryCalls.at(-1),['open','memory']);
    overlay.webContents.send('app:event',{type:'memory:show',text:'Home pincode: 411045'});await delay(400);
    assert.equal(await js("document.querySelector('.speech-bubble.notice.visible [role=status]').textContent"),'Home pincode: 411045');
    // Your details on screen can be put away at once.
    await js("[...document.querySelectorAll('.speech-bubble.notice button')].find(b=>b.textContent==='Hide').click()");await delay(250);
    assert.equal(await js("document.querySelector('.speech-bubble.notice.visible')"),null);
    // Paused: the kite says goodbye, reels out of sight, then drifts back down on resume and says hello (design.md §K5.3).
    overlay.webContents.send('app:event',{type:'paused',until:null});await delay(300);
    assert.equal(await js("document.querySelector('.speech-bubble.notice.visible [role=status]').textContent"),'Paused — see you soon.');
    await delay(2600);
    assert.equal(await js("getComputedStyle(document.querySelector('.kite-canvas')).visibility"),'hidden','out of sight');
    assert.equal(await js("document.querySelector('.kite-canvas').getAttribute('aria-label')"),'Kite, paused');
    overlay.webContents.send('app:event',{type:'resumed'});await delay(200);
    assert.ok((await kiteFrame()).y<250,'drifts down from above');
    await delay(1800);
    const back=await kiteFrame();
    assert.ok(Math.hypot(back.x-382,back.y-278)<6,'back by the cursor: '+JSON.stringify(back));
    assert.equal(await js("document.querySelector('.speech-bubble.notice.visible [role=status]').textContent"),'Welcome back.');
    // Extra large (K-14): the kite is 1.6x, sits at its scaled offset, and its bubble keeps clear of its wings.
    snapshot.settings.kiteSize='extraLarge';overlay.webContents.send('settings:changed',snapshot);await delay(800);
    voice(403,{type:'ptt:start'});await delay(40);voice(403,{type:'ptt:tooShort'});await delay(600);
    const xl=await kiteFrame(), pill=await js("parseFloat(document.querySelector('.speech-bubble').style.translate)");
    assert.ok(xl.scale===1.6&&Math.hypot(xl.x-(350+32*1.6),xl.y-(250+28*1.6))<6,'scaled kite at its scaled offset: '+JSON.stringify(xl));
    assert.ok(pill>=12&&pill<748,'the retained conversation stays on screen with the bigger kite');
    snapshot.settings.kiteSize='standard';overlay.webContents.send('settings:changed',snapshot);await delay(200);
    // A kite color (K-15) recolors the sail's gradient in the overlay; rose comes back when chosen again.
    const sailStop=()=>js("getComputedStyle(document.querySelector('.kite-glint-body')).stopColor");
    const rose=await sailStop();
    snapshot.settings.kiteSkin='teal';overlay.webContents.send('settings:changed',snapshot);await delay(150);
    assert.equal(await js("document.documentElement.dataset.skin"),'teal');
    assert.notEqual(await sailStop(),rose,'the sail wears teal');
    snapshot.settings.kiteSkin='rose';overlay.webContents.send('settings:changed',snapshot);await delay(150);
    assert.equal(await sailStop(),rose);
    // Phase 1: Subtle settles at the screen edge and remains still even as the pointer moves.
    voice(500,{type:'model:changed'});voice(500,{type:'voice:aborted'});
    snapshot.settings.liveliness='subtle';snapshot.settings.kitePlacement='screenEdge';
    overlay.webContents.send('settings:changed',snapshot);await delay(1500);
    const resting=await kiteFrame(), sailAtRest=await js("document.querySelector('.kite-sail').getAttribute('d')");
    overlay.webContents.send('cursor:update',{x:80,y:70},{origin:{x:0,y:0},display:{x:0,y:0,width:760,height:960}});await delay(500);
    const settled=await kiteFrame();
    assert.ok(Math.hypot(resting.x-settled.x,resting.y-settled.y)<.01,'no idle floating or pointer following at screen edge');
    assert.equal(await js("document.querySelector('.kite-sail').getAttribute('d')"),sailAtRest,'no perpetual sail breathing');
    voice(501,{type:'model:changed'});voice(501,{type:'tts:start'});
    voice(501,{type:'llm:delta',text:'## A comfortable answer\nYou can read all of this immediately, even while the voice is still on the first word.\n\n1. Expand for more room.\n2. Make the text larger.\n3. Minimize and come back later.'});
    voice(501,{type:'tts:chunk',audio:new Float32Array(44100*8).buffer});voice(501,{type:'tts:done'});voice(501,{type:'llm:done'});await delay(300);
    const answerPosition=await js("document.querySelector('.speech-bubble').style.translate");
    snapshot.settings.kitePlacement='pointer';overlay.webContents.send('settings:changed',snapshot);
    overlay.webContents.send('cursor:update',{x:600,y:450},{origin:{x:0,y:0},display:{x:0,y:0,width:760,height:960}});await delay(200);
    assert.equal(await js("document.querySelector('.speech-bubble').style.translate"),answerPosition);
    overlay.webContents.send('cursor:update',{x:900,y:450},{origin:{x:0,y:0},display:{x:760,y:0,width:760,height:960}});await delay(200);
    assert.equal(await js("document.querySelector('.speech-bubble').style.translate"),answerPosition,'answer stays on its opening display');
    overlay.webContents.send('cursor:update',{x:600,y:450},{origin:{x:0,y:0},display:{x:0,y:0,width:760,height:960}});
    await js("document.querySelector('.bubble-stop-speech').click()");await delay(100);
    assert.equal(speechStops.at(-1),501);assert.match(await js("document.querySelector('.bubble-reply').textContent"),/come back later/);
    voice(501,{type:'tts:start'});voice(501,{type:'tts:chunk',audio:new Float32Array(44100).buffer});await delay(100);
    assert.equal(await js("document.querySelector('.bubble-stop-speech')"),null,'late audio cannot restart stopped speech');
    await js("document.querySelector('[aria-label=\"Larger answer text\"]').click()");await delay(80);
    assert.equal(await js("getComputedStyle(document.querySelector('.speech-bubble')).fontSize"),'18px');
    await js("[...document.querySelectorAll('.bubble-header button')].find(b=>b.textContent==='Expand').click()");await delay(100);
    assert.equal(await js("document.querySelector('.speech-bubble').offsetWidth"),640);
    assert.equal(await js("getComputedStyle(document.querySelector('.speech-bubble')).resize"),'both');
    await js("document.querySelector('.speech-bubble').style.width='500px';document.querySelector('.speech-bubble').style.height='400px'");await delay(100);
    assert.ok(await js("(()=>{const r=document.querySelector('.speech-bubble').getBoundingClientRect();return r.left>=12&&r.top>=12&&r.right<=748&&r.bottom<=948})()"),'resizing stays on screen');
    await js("[...document.querySelectorAll('.bubble-header button')].find(b=>b.textContent==='Minimize').click()");await delay(100);
    assert.equal(await js("getComputedStyle(document.querySelector('.bubble-body')).display"),'none');
    assert.ok(await js("document.querySelector('.speech-bubble').offsetHeight<65"),'resized answer minimizes to a small handle');
    await delay(9000);
    assert.equal(await js("document.querySelector('.speech-bubble').getAttribute('aria-hidden')"),'false','answer does not expire');
    await js("[...document.querySelectorAll('.bubble-header button')].find(b=>b.textContent==='Show answer').click()");await delay(100);
    assert.match(await js("document.querySelector('.bubble-reply').textContent"),/come back later/);
    overlay.webContents.debugger.attach('1.3');
    for(const [name,features] of [['light',[{name:'prefers-color-scheme',value:'light'}]],['dark',[{name:'prefers-color-scheme',value:'dark'}]],['contrast',[{name:'forced-colors',value:'active'}]]]) {
      await overlay.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features});await delay(100);
      fs.writeFileSync(path.join(temporary,`answer-${name}.png`),(await overlay.webContents.capturePage()).toPNG());
    }
    await overlay.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[]});overlay.webContents.debugger.detach();
    await js("[...document.querySelectorAll('.bubble-header button')].find(b=>b.textContent==='Close').click()");voice(501,{type:'llm:delta',text:' Late text.'});await delay(100);
    assert.equal(await js("document.querySelector('.speech-bubble').getAttribute('aria-hidden')"),'true','closed answers do not reopen as text arrives');
    snapshot.settings.kitePlacement='invoked';overlay.webContents.send('settings:changed',snapshot);voice(502,{type:'model:changed'});voice(502,{type:'llm:delta',text:'Here when needed.'});voice(502,{type:'llm:done'});await delay(400);
    assert.equal(await js("document.querySelector('.kite-canvas').style.visibility"),'visible');
    await js("[...document.querySelectorAll('.bubble-header button')].find(b=>b.textContent==='Close').click()");await delay(500);
    assert.equal(await js("document.querySelector('.kite-canvas').style.visibility"),'hidden');
    // Phase 2: open from the tray/keyboard path, then continue one conversation with voice and text.
    overlay.webContents.send('conversation:open',{id:testConversation,messages:[],reason:'new'});await delay(100);
    voice(550,{type:'ptt:start'});voice(550,{type:'voice:transcript',text:'Explain this error.'});voice(550,{type:'conversation:started',conversationId:testConversation});
    voice(550,{type:'vision:attached',attachment:{label:'Marked screen · Display 1',capturedAt:Date.now(),preview:'data:image/jpeg;base64,'+Buffer.from(images.overview).toString('base64')}});await delay(80);
    assert.match(await js("document.querySelector('.conversation-attachment').textContent"),/Display 1.*View capture/s);
    await js("document.querySelector('.conversation-attachment details').open=true");await delay(30);
    assert.equal(await js("document.querySelector('.conversation-attachment img').getAttribute('alt')"),'Screen content shared with this question');
    voice(550,{type:'llm:delta',text:'The service needs to restart.'});voice(550,{type:'llm:done'});await delay(100);
    const setDraft=text=>js(`(()=>{const input=document.querySelector('#conversation-reply');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(text)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const submit=()=>js("document.querySelector('.conversation-composer').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
    await setDraft('Give me the shortest fix.');await delay(50);await submit();await delay(250);
    assert.equal(typedSends.at(-1),'Give me the shortest fix.');
    assert.match(await js("document.querySelector('.conversation-turns').textContent"),/Explain this error.*service needs to restart/s);
    assert.match(await js("document.querySelector('.conversation-turns .conversation-attachment').textContent"),/Earlier capture.*not attached/s);
    assert.equal(await js("document.querySelector('.conversation-turns .conversation-attachment img')"),null,'old captures keep their label, without retaining image pixels');
    assert.match(await js("document.querySelector('.bubble-transcript').textContent"),/Give me the shortest fix/);
    assert.match(await js("document.querySelector('.bubble-reply').textContent"),/Shortest fix/);
    assert.equal(await js("document.querySelector('#conversation-reply').value"),'');
    await setDraft('Why does that work?');await delay(40);
    await js("document.querySelector('.speech-bubble').style.width='640px';document.querySelector('.speech-bubble').style.height='560px';document.querySelector('.bubble-body').scrollTop=0");await delay(100);
    for(const [name,features] of [['light',[{name:'prefers-color-scheme',value:'light'}]],['dark',[{name:'prefers-color-scheme',value:'dark'}]],['contrast',[{name:'forced-colors',value:'active'}]]]) {
      overlay.webContents.debugger.attach('1.3');await overlay.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features});await delay(80);
      fs.writeFileSync(path.join(temporary,`conversation-${name}.png`),(await overlay.webContents.capturePage()).toPNG());overlay.webContents.debugger.detach();
    }
    overlay.webContents.debugger.attach('1.3');await overlay.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[]});overlay.webContents.debugger.detach();
    await js("[...document.querySelectorAll('.bubble-header button')].find(b=>b.textContent==='Minimize').click()");await delay(80);
    await js("[...document.querySelectorAll('.bubble-header button')].find(b=>b.textContent==='Show answer').click()");await delay(80);
    assert.equal(await js("document.querySelector('#conversation-reply').value"),'Why does that work?');
    await js("[...document.querySelectorAll('.bubble-header button')].find(b=>b.textContent==='Close').click()");await delay(50);
    overlay.webContents.send('app:event',{type:'conversation:show'});await delay(80);
    assert.equal(await js("document.querySelector('#conversation-reply').value"),'Why does that work?');
    assert.equal(await js("document.querySelectorAll('.conversation-turn').length"),1,'closing and reopening do not duplicate turns');
    // Accidental holds preserve the last answer and draft, without duplicating it.
    for(const [id,type] of [[560,'ptt:tooShort'],[561,'voice:empty'],[562,'ptt:cancel']]){
      voice(id,{type:'ptt:start'});await delay(30);voice(id,{type});await delay(80);
      assert.match(await js("document.querySelector('.bubble-reply').textContent"),/Shortest fix/);
      assert.equal(await js("document.querySelector('#conversation-reply').value"),'Why does that work?');
      assert.equal(await js("document.querySelectorAll('.conversation-turn').length"),1);
    }
    rejectTyped=true;await submit();await delay(80);
    assert.equal(await js("document.querySelector('#conversation-reply').value"),'Why does that work?');
    assert.match(await js("document.querySelector('.composer-error').textContent"),/Couldn’t send/);rejectTyped=false;
    await setDraft('A question that fails');await delay(40);await submit();await delay(200);
    assert.match(await js("document.querySelector('.bubble-transcript').textContent"),/question that fails/);
    await js("[...document.querySelectorAll('.bubble-body button')].find(b=>b.textContent==='Edit and retry').click()");await delay(80);
    assert.equal(await js("document.querySelector('#conversation-reply').value"),'A question that fails');
    // Reading earlier turns must not jump to the bottom while new text streams.
    await js("const readingBody=document.querySelector('.bubble-body');readingBody.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:-300}));readingBody.scrollTop=0");await delay(80);
    voice(typedId,{type:'llm:delta',text:' More context.'});await delay(100);
    assert.ok(await js("document.querySelector('.bubble-body').scrollTop<5"));voice(typedId,{type:'llm:done'});await delay(50);
    fs.writeFileSync(path.join(temporary,'conversation.png'),(await overlay.webContents.capturePage()).toPNG());
    await js("document.querySelector('.new-conversation').click()");await delay(150);
    assert.equal(await js("document.querySelectorAll('.conversation-turn').length"),0);
    assert.equal(await js("document.querySelector('#conversation-reply').value"),'');
    assert.equal(await js("document.querySelector('.bubble-reply')"),null,'New conversation clears the visible chat deliberately');
    const resumedHistory=await create('history');await delay(250);
    for(let i=0;i<100&&!await resumedHistory.webContents.executeJavaScript("[...document.querySelectorAll('.conversation-head button')].some(b=>b.textContent==='Continue conversation'&&!b.disabled)");i++)await delay(30);
    await resumedHistory.webContents.executeJavaScript("[...document.querySelectorAll('.conversation-head button')].find(b=>b.textContent==='Continue conversation').click()");await delay(150);
    assert.equal(continued.at(-1),'history-test');assert.match(await js("document.querySelector('.conversation-turns').textContent"),/saved error.*saved explanation/s);
    await setDraft('Draft for saved chat');await delay(50);await submit();await delay(150);
    assert.match(await js("document.querySelector('.conversation-turns').textContent"),/saved explanation/);
    // Preserve a per-conversation draft while switching to another saved chat and back.
    await setDraft('Keep this draft');await delay(50);
    overlay.webContents.send('conversation:open',{id:'another-chat',messages:[],reason:'resume'});await delay(80);
    assert.equal(await js("document.querySelector('#conversation-reply').value"),'');
    await resumedHistory.webContents.executeJavaScript("[...document.querySelectorAll('.conversation-head button')].find(b=>b.textContent==='Continue conversation').click()");await delay(100);
    assert.equal(await js("document.querySelector('#conversation-reply').value"),'Keep this draft');resumedHistory.destroy();
    overlay.webContents.send('conversation:open',{id:null,messages:[],reason:'deleted'});await delay(100);
    assert.equal(await js("document.querySelector('.speech-bubble').getAttribute('aria-hidden')"),'true','history deletion removes retained chat and drafts');
    assert.deepEqual(errors.filter(e=>!e.includes('NotAllowedError')),[]);
    console.log('PASS settings, model IPC, Web Audio, timestamp reveal, hover, interrupt, approval arguments/countdown/approve/deny, scaled JPEGs, tap ring, annotation pointer capture/limits/fade, capture hiding, guide ring/card/flight/controls, whiteboard drawing/pen/highlight/export/controls, task approval scopes/card/ring/pointing/controls. Screenshots: '+temporary);
  } catch(error) {console.error(error);console.error('Last script:',lastScript,'Renderer errors:',errors);process.exitCode=1;}
  finally {windows.forEach(w=>{if(!w.isDestroyed())w.destroy();});app.exit(process.exitCode||0);}
});
