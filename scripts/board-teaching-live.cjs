// Live teaching timing through Cartesia, quiet announcements, Web Audio and the actual pen player.
// Offscreen output is muted; the renderer still schedules real PCM and reports playback timing.
require('../tests/register.cjs');
const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {keyFor}=require('./eval-common.cjs'),{listVoices}=require('../src/main/ai/discovery.ts');
const {BoardService}=require('../src/main/board/service.ts'),{VoiceController}=require('../src/main/voice/controller.ts'),{TTSService}=require('../src/main/voice/tts.ts');
const {cueTimings}=require('../src/shared/boardTeaching.ts');
const root=path.join(__dirname,'..'),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'kite-board-teaching-live-'));
app.setPath('userData',path.join(temporary,'profile'));app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
const preload=path.join(temporary,'preload.cjs');
fs.writeFileSync(preload,`const {ipcRenderer}=require('electron');window.liveReady={};const sub=c=>cb=>{window.liveReady[c]=true;const f=(_e,v,g)=>cb(v,g);ipcRenderer.on(c,f);return()=>ipcRenderer.removeListener(c,f)};
const known={getSettings:()=>ipcRenderer.invoke('live:settings'),onBoardEvent:sub('board:state'),onVoiceEvent:sub('live:voice'),onCursorUpdate:sub('cursor:update'),reportPlayback:(id,type)=>ipcRenderer.send('live:playback',id,type),boardStarted:(id,key)=>ipcRenderer.send('live:started',id,key),boardDrawn:(id,key)=>ipcRenderer.send('live:drawn',id,key),boardCue:(id,key,expected,actual)=>ipcRenderer.send('live:cue',id,key,expected,actual)};
window.kite=new Proxy({},{get:(_t,n)=>known[n]??(String(n).startsWith('on')?()=>()=>{}:()=>Promise.resolve({ok:true}))});`);
const lesson={title:'Word-cued teaching',mode:'new',beats:[
 {say:'First, the client sends its request to the server.',cues:{a:'client',b:'server'},draw:[{id:'a',type:'rectangle',x:80,y:160,label:'Client'},{id:'b',type:'rectangle',x:440,y:160,label:'Server'}]},
 {say:'Next, the database checks the cache before returning a result.',cues:{c:'database',d:'cache'},draw:[{id:'c',type:'rectangle',x:80,y:380,label:'Database'},{id:'d',type:'rectangle',x:440,y:380,label:'Cache'}]},
 {say:'Finally, the response reaches the browser and completes the exchange.',cues:{e:'response',f:'browser'},draw:[{id:'e',type:'rectangle',x:80,y:600,label:'Response'},{id:'f',type:'rectangle',x:440,y:600,label:'Browser'}]}
]};
const median=values=>{const a=values.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2:null;};
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{let win,board,controller,tts,view;const records=[],cues=[],errors=[];let complete=false;
 try{
  const key=keyFor('cartesia');if(!key)throw new Error('No Cartesia development key configured');
  const voices=await listVoices(key),voice=voices.find(v=>v.language==='en')??voices[0];if(!voice)throw new Error('No available Cartesia voice');
  const settings={onboardingComplete:true,reducedMotion:false,ttsEnabled:true,voiceId:voice.id,speed:1,whiteboard:true,boardCaptions:true,kiteSize:'standard',liveliness:'calm',kiteSkin:'rose',earcons:false,model:{provider:'deepseek',id:'deepseek-flash'}};
  ipcMain.handle('live:settings',()=>({settings,models:[],voices:[],keys:{}}));
  win=new BrowserWindow({width:1920,height:1080,show:false,webPreferences:{preload,sandbox:false,contextIsolation:false,offscreen:true,backgroundThrottling:false}});
  win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(String(event.message).slice(0,200));});
  win.webContents.setAudioMuted(true);await win.loadFile(path.join(root,'.vite/renderer/main_window/index.html'),{hash:'overlay'});
  let ready=false;for(let i=0;i<100&&!ready;i++){await new Promise(r=>setTimeout(r,100));ready=await win.webContents.executeJavaScript("!!window.liveReady['live:voice'] && !!window.liveReady['board:state']");}
  if(!ready)throw new Error('Overlay voice/board listeners did not become ready');console.log('Overlay voice and board listeners ready');
  win.webContents.send('cursor:update',{x:1890,y:1050},{origin:{x:0,y:0},display:{x:0,y:0,width:1920,height:1080}});
  tts=new TTSService(()=>key,event=>{if(event.type==='tts:error')errors.push(event.type);controller.ttsEvent(event);});
  controller=new VoiceController({emit:event=>win.webContents.send('live:voice',event),settings:()=>settings,tts,setEscape:()=>{},getKey:()=>key,history:{},conversation:{},transcribe:async()=>'',ask:async()=>''});
  board=new BoardService({enabled:()=>true,structured:()=>true,teaching:()=>true,speed:()=>1,
   speak:(text,hooks)=>{const record={beat:view.beat,words:{words:[],start:[],end:[]},started:null,ended:null};records.push(record);return controller.announce(text,{...hooks,
    started:id=>{record.id=id;record.started=performance.now();hooks.started(id);},
    timestamps:(words,id)=>{for(const k of ['words','start','end'])record.words[k].push(...words[k]);hooks.timestamps?.(words,id);},done:end=>{record.ended=performance.now();record.end=end;hooks.done(end);}});},
   silence:()=>controller.announce(null),prefetch:(text,speed)=>controller.prefetchAnnouncement(text,speed),cancelPrefetch:()=>controller.cancelPrefetch(),
   emit:v=>{view=v;win.webContents.send('board:state',v);if(v?.status==='done')complete=true;}});
  ipcMain.on('live:playback',(_e,id,type)=>controller.playback(id,type));ipcMain.on('live:started',(_e,id,key)=>board.started(id,key));ipcMain.on('live:drawn',(_e,id,key)=>board.drawn(id,key));
  ipcMain.on('live:cue',(_e,id,key,expected,actual)=>{if(view?.id!==id||view.drawing?.key!==key)return;const ids=view.drawing.cues.filter(c=>Math.abs(c.startMs-expected)<.01).map(c=>c.id);cues.push({beat:view.beat,ids,expected,actual});});
  board.start(lesson);const deadline=Date.now()+60000;while(!complete&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));
  const measurements=[];for(const r of records){const beat=lesson.beats[r.beat];if(!beat)continue;for(const target of cueTimings(beat.draw,beat.say,beat.cues,r.words)){const ack=cues.find(c=>c.beat===r.beat&&c.ids.includes(target.id));measurements.push({beat:r.beat,cue:measurements.length,expectedMs:target.startMs,actualMs:ack?.actual??null,errorMs:ack?Math.abs(ack.actual-target.startMs):null});}}
  const gaps=records.slice(1).map((r,i)=>r.started-records[i].ended),medianError=median(measurements.map(m=>m.errorMs));
  const report={checkedAt:new Date().toISOString(),conditions:'1920x1080 real offscreen overlay, ordinary motion, Cartesia sonic-3.5, real PCM/Web Audio playback clock with output muted. Three fully known fixture beats; no planner or human clarity score. Cue error compares actual SVG onset with final provider word timestamps.',complete,records:records.map(r=>({beat:r.beat,spoken:r.end,wordCount:r.words.words.length})),measurements,deadAirMs:gaps,medianCueErrorMs:medianError,maxDeadAirMs:Math.max(...gaps),errors,
   gates:{wordSync:complete&&measurements.length===6&&measurements.every(m=>m.actualMs!==null)&&medianError<=250,deadAir:complete&&records.length===3&&gaps.every(g=>g>=0&&g<=700),providerClarity:'pending human comparison'}};
  fs.writeFileSync(path.join(root,'docs/performance/whiteboard/phase3-live.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
  if(!report.gates.wordSync||!report.gates.deadAir)process.exitCode=1;
 }catch(error){console.error(String(error?.message??error));process.exitCode=1;}
 finally{board?.close();await controller?.shutdown();tts?.close();if(win&&!win.isDestroyed())win.destroy();app.exit(process.exitCode||0);}
});
