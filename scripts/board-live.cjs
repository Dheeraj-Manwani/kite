// Live phase-1 latency through the real streaming tool, service, camera and SVG player (voice off).
// npx electron scripts/board-live.cjs [--provider deepseek --model deepseek-flash] [--limit N]
const { app, BrowserWindow, ipcMain } = require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
require('../tests/register.cjs');
const { keyFor, voiceDefinitions }=require('./eval-common.cjs');
const { describeModel }=require('../src/main/ai/catalog.ts');
const { getModel }=require('../src/main/ai/providers.ts');
const { providerOptionsFor }=require('../src/main/ai/ask.ts');
const { buildSystemPrompt }=require('../src/main/ai/systemPrompt.ts');
const { BoardService }=require('../src/main/board/service.ts');
const { completeBeats }=require('../src/main/tools/impl/explain_on_whiteboard.ts');
const { voiceOutputTokens }=require('../src/main/ai/agentLoop.ts');
const { streamText,tool,stepCountIs,parsePartialJson }=require('ai');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'kite-board-live-'));app.setPath('userData',path.join(temporary,'profile'));
const root=path.join(__dirname,'..'),argv=process.argv.slice(2),arg=(name,fallback)=>argv.includes(name)?argv[argv.indexOf(name)+1]:fallback;
const provider=arg('--provider','deepseek'),modelId=arg('--model','deepseek-flash'),spec=`${provider}:${modelId}`;
const model=describeModel({provider,id:modelId}),key=keyFor(provider);
const limit=Number(argv[argv.indexOf('--limit')+1])||3;
const prompts=JSON.parse(fs.readFileSync(path.join(__dirname,'board-eval','prompts.json'),'utf8')).prompts.slice(0,limit);
const preload=path.join(temporary,'preload.cjs');
fs.writeFileSync(preload,`const {ipcRenderer}=require('electron');const sub=c=>cb=>{const f=(_e,v,g)=>cb(v,g);ipcRenderer.on(c,f);return()=>ipcRenderer.removeListener(c,f)};
const known={getSettings:()=>ipcRenderer.invoke('live:settings'),onBoardEvent:sub('board:state'),onCursorUpdate:sub('cursor:update'),boardStarted:(id,key)=>ipcRenderer.send('live:started',id,key),boardDrawn:(id,key)=>ipcRenderer.send('live:drawn',id,key)};
window.kite=new Proxy({},{get:(_t,n)=>known[n]??(String(n).startsWith('on')?()=>()=>{}:()=>Promise.resolve({ok:true}))});`);
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
  let win,board;const runs=[];
  try{
    if(!key)throw new Error(`No ${provider} key configured`);
    ipcMain.handle('live:settings',()=>({settings:{onboardingComplete:true,reducedMotion:false,ttsEnabled:false,whiteboard:true,kiteSize:'standard',liveliness:'calm',kiteSkin:'rose'},models:[],voices:[],keys:{}}));
    win=new BrowserWindow({width:1920,height:1080,show:false,webPreferences:{preload,sandbox:false,contextIsolation:false,offscreen:true,backgroundThrottling:false}});
    await win.loadFile(path.join(root,'.vite','renderer','main_window','index.html'),{hash:'overlay'});
    await new Promise(r=>setTimeout(r,400));
    win.webContents.send('cursor:update',{x:1890,y:1050},{origin:{x:0,y:0},display:{x:0,y:0,width:1920,height:1080}});
    ipcMain.on('live:started',(_e,id,key)=>board?.started(id,key));ipcMain.on('live:drawn',(_e,id,key)=>board?.drawn(id,key));
    for(const prompt of prompts){
      // The free Groq dev key permits approximately one full voice-turn prompt per minute.
      if(runs.length && provider==='groq')await new Promise(r=>setTimeout(r,60000));
      let firstStrokeMs=null,started;
      board=new BoardService({enabled:()=>true,speed:()=>1,speak:()=>false,silence:()=>{},emit:v=>win.webContents.send('board:state',v),log:(name,data)=>{if(name==='board:lesson'&&data?.firstStrokeMs!==undefined)firstStrokeMs??=data.firstStrokeMs;}});
      const definitions=voiceDefinitions(model,{whiteboard:(lesson,callId)=>board.start(lesson,{callId,requestedAt:started})});
      const tools=Object.fromEntries(definitions.map(d=>[d.name,tool({description:d.description,inputSchema:d.inputSchema,...(d.name==='explain_on_whiteboard'?{execute:(input,ctx)=>d.execute(input,{dryRun:false,signal:ctx.abortSignal??new AbortController().signal,callId:ctx.toolCallId})}:{})})]));
      started=performance.now();const inputs=new Map();
      const result=streamText({model:getModel(model.provider,model.id,{getKey:()=>key}),system:buildSystemPrompt(model,board.context()),messages:[{role:'user',content:prompt.text}],tools,maxOutputTokens:voiceOutputTokens,providerOptions:providerOptionsFor(model),stopWhen:stepCountIs(1),abortSignal:AbortSignal.timeout(90000),maxRetries:0});
      let drew=false;
      for await(const part of result.fullStream){
        if(part.type==='error')throw part.error;
        if(part.type==='tool-input-start'&&part.toolName==='explain_on_whiteboard')inputs.set(part.id,'');
        if(part.type==='tool-input-delta'&&inputs.has(part.id)){const text=inputs.get(part.id)+part.delta;inputs.set(part.id,text);const {value}=await parsePartialJson(text);const complete=completeBeats(value);if(complete)board.preview(part.id,complete,{requestedAt:started});}
        if(part.type==='tool-result'&&part.toolName==='explain_on_whiteboard'&&part.output?.ok)drew=true;
      }
      for(let i=0;i<100&&firstStrokeMs===null;i++)await new Promise(r=>setTimeout(r,50));
      runs.push({prompt:prompt.id,firstStrokeMs,totalMs:Math.round(performance.now()-started),drew});
      console.log(JSON.stringify(runs.at(-1)));board.close();await new Promise(r=>setTimeout(r,120));
    }
    const values=runs.map(r=>r.firstStrokeMs).filter(Number.isFinite).sort((a,b)=>a-b);
    const report={checkedAt:new Date().toISOString(),model:spec,conditions:'1920x1080 real offscreen overlay, voice off, ordinary motion, font/camera/player included',runs,medianFirstStrokeMs:values.length?(values[Math.floor((values.length-1)/2)]+values[Math.floor(values.length/2)])/2:null,targetMs:5000};
    const out=path.join(root,'docs','performance','whiteboard','phase1-live.json');
    let old=[];try{const data=JSON.parse(fs.readFileSync(out,'utf8'));old=data.models??(data.model?[data]:[]);}catch{ /* first run */ }
    fs.writeFileSync(out,JSON.stringify({checkedAt:report.checkedAt,models:[...old.filter(m=>m.model!==spec),report]},null,2)+'\n');
    if(values.length!==runs.length||report.medianFirstStrokeMs>5000)throw new Error('First-stroke gate failed');
  }catch(error){const message=String(error?.stack??error);console.error(message);fs.writeFileSync(path.join(root,'docs','performance','whiteboard','live-error.txt'),message);process.exitCode=1;}
  finally{board?.close();if(win&&!win.isDestroyed())win.destroy();app.exit(process.exitCode||0);}
});
