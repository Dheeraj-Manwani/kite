const { test } = require('node:test');
const assert = require('node:assert/strict');
const { analyzeStrokes, dipToPixel, cropRect, routeVision, VisionUnavailableError, asksForScreen } = require('../src/shared/vision.ts');
const { protectedCapture } = require('../src/main/vision/captureCore.ts');
const { Conversation } = require('../src/main/ai/conversation.ts');
const { VoiceController } = require('../src/main/voice/controller.ts');
const { readScreen } = require('../src/main/tools/impl/read_screen.ts');
const { needsApproval, ApprovalBroker } = require('../src/main/tools/approval.ts');
const { ToolSession } = require('../src/main/tools/registry.ts');
const { runAgentLoop } = require('../src/main/ai/agentLoop.ts');
const { MockLanguageModelV3, simulateReadableStream } = require('ai/test');
const points = pairs => pairs.map(([x,y],t)=>({x,y,t}));
const circle = (x=100,y=100) => Array.from({length:65},(_,i)=>({x:x+50*Math.cos(i*Math.PI/32),y:y+40*Math.sin(i*Math.PI/32),t:i}));
test('circle, lasso, underline, arrow, tap and multiple regions',()=>{
  for(const stroke of [circle(), points([[10,10],[80,0],[150,50],[100,90],[20,65],[10,10]])]) assert.equal(analyzeStrokes([stroke]).marks[0].markType,'enclosure');
  assert.equal(analyzeStrokes([points([[0,50],[50,51],[100,50]])]).marks[0].markType,'underline');
  assert.equal(analyzeStrokes([points([[0,0],[50,50],[100,100],[80,95],[100,100],[95,80]])]).marks[0].markType,'arrow');
  assert.equal(analyzeStrokes([points([[0,0],[5,5]])]).marks[0].markType,'tap');
  const multi=analyzeStrokes([circle(),circle(400,200)]);assert.equal(multi.marks.length,2);assert.deepEqual(multi.union,{x:50,y:60,width:400,height:180});
  assert.deepEqual(analyzeStrokes([]),{marks:[],union:null});
});
for (const scaleFactor of [1,1.25,1.5,2]) test(`DIP pixels at ${scaleFactor}, including negative monitor origins`,()=>{
  for(const x of [0,-1920]) assert.deepEqual(dipToPixel({x:x+80,y:40},{id:1,bounds:{x,y:-100,width:1920,height:1080},scaleFactor}),{x:80*scaleFactor,y:140*scaleFactor});
});
test('crop padding, minimum context, native pixels and edge clamps',()=>{
  const d={id:1,bounds:{x:-1000,y:0,width:1000,height:800},scaleFactor:1};
  assert.deepEqual(cropRect({x:-600,y:300,width:200,height:100},d,1000,800),{x:350,y:200,width:300,height:300});
  assert.deepEqual(cropRect({x:-1000,y:0,width:0,height:0},d,1000,800),{x:0,y:0,width:300,height:300});
  assert.deepEqual(cropRect({x:-1,y:799,width:0,height:0},d,1000,800),{x:700,y:500,width:300,height:300});
  assert.equal(cropRect({x:-800,y:200,width:400,height:300},d,1000,800).width,560);
  assert.deepEqual(cropRect({x:0,y:0,width:5000,height:5000},d,200,100),{x:0,y:0,width:200,height:100});
});
const active={provider:'groq',id:'text',label:'Text',supportsVision:false,supportsTools:true,tier:'fast'};
const vision={provider:'moonshot',id:'kimi-k2.5',label:'Kimi K2.5',supportsVision:true,supportsTools:true,tier:'fast'};
test('vision routing preserves capable model, chooses configured fallback and errors without a key',()=>{
  assert.equal(routeVision(active,vision,[active,vision],()=>true),vision);
  assert.equal(routeVision(vision,active,[active,vision],()=>true),vision);
  assert.throws(()=>routeVision(active,vision,[active,vision],()=>false),VisionUnavailableError);
  assert.throws(()=>routeVision(active,vision,[active],()=>true),VisionUnavailableError);
  assert.ok(asksForScreen("what's on my screen?"));
});
test('context hygiene removes image bytes and scopes cleanup to its own turn',()=>{
  const c=new Conversation(()=> 'x');c.begin(0);
  const first=[{type:'image',image:new Uint8Array([1,2]),mediaType:'image/jpeg'}];
  const second=[{type:'image',image:new Uint8Array([3,4]),mediaType:'image/jpeg'}];
  c.add({role:'user',content:first},1);c.add({role:'user',content:second},2);
  c.scrubImages('A word','enclosure',first);
  assert.match(c.context()[0].content,/enclosure.*A word/);assert.ok(Array.isArray(c.context()[1].content));
  c.scrubImages('Button','tap',second);assert.ok(c.context().every(m=>typeof m.content==='string'));
});
for(const fail of [false,true]) test(`capture resets protection and visibility when desktopCapturer ${fail?'throws':'succeeds'}`,async()=>{
  const calls=[];const desktopCapturer={getSources:async()=>{calls.push('capture');if(fail)throw Error('failure');return 'PNG';}};
  const run=()=>protectedCapture({protect:v=>calls.push(`protect:${v}`),hide:async v=>calls.push(`hide:${v}`),wait:async()=>calls.push('frames'),capture:()=>desktopCapturer.getSources()});
  if(fail)await assert.rejects(run);else assert.equal(await run(),'PNG');
  assert.deepEqual(calls,['protect:true','hide:true','frames','capture','protect:false','hide:false']);
});
test('failed renderer hide restores protection without capturing',async()=>{
  const calls=[];await assert.rejects(()=>protectedCapture({protect:v=>calls.push(v),hide:async v=>{if(v)throw Error('hide failed');},wait:async()=>{},capture:async()=>assert.fail()}));assert.deepEqual(calls,[true,false]);
});
test('read_screen is always confirmed in v1, validated and respects dry-run',async()=>{
  let count=0;const tool=readScreen(false,async()=>{count++;return {ok:true,message:'screen'};});
  assert.equal(needsApproval(tool),true);assert.equal(needsApproval(readScreen(true,async()=>{})),true);
  assert.equal(tool.summarize({reason:'Describe the button'}),'Let me look at your screen? (Describe the button)');
  await tool.execute({reason:'test'},{dryRun:true,signal:new AbortController().signal});assert.equal(count,0);
  await assert.rejects(()=>tool.execute({reason:''},{dryRun:false,signal:new AbortController().signal}));
});
test('silent marked hold sends two images, routes, persists metadata and cleans conversation',async()=>{
  const events=[],rows=[],saved=[];const conversation=new Conversation(()=> 'x');
  const turn={images:{overview:new Uint8Array([255,216,1]),zoom:new Uint8Array([255,216,2])},analysis:analyzeStrokes([circle()]),captureMs:42};
  const controller=new VoiceController({emit:e=>events.push(e),getKey:()=> 'key',transcribe:async()=>assert.fail('silence must not need STT'),conversation,setEscape:()=>{},
    settings:()=>({model:active,visionModel:vision}),describe:()=>active,
    history:{createConversation:()=>{},addMessage:(...r)=>{rows.push(r);return rows.length;}},
    vision:{start:()=>{},leave:()=>{},clear:()=>{},prepare:async()=>turn,route:m=>routeVision(m,vision,[vision],()=>true),persist:async(...a)=>saved.push(a)},
    ask:async(messages,_k,_s,delta,model)=>{assert.equal(model,vision);const content=messages[0].content;assert.match(content[0].text,/What is this\?/);assert.equal(content.filter(p=>p.type==='image').length,2);delta('A word.');return 'A word.';},
  });
  const id=controller.start();controller.stop();await controller.submit(id,new ArrayBuffer(0),[circle()]);
  assert.equal(saved.length,1);assert.equal(rows.at(-1)[4],vision);assert.ok(events.some(e=>e.type==='vision:routed'));
  assert.ok(conversation.context().every(m=>typeof m.content==='string'));await controller.shutdown();
});
function stream(parts) {return {stream:simulateReadableStream({initialDelayInMs:null,chunkDelayInMs:null,chunks:[{type:'stream-start',warnings:[]},...parts,{type:'finish',finishReason:{unified:parts.some(p=>p.type==='tool-call')?'tool-calls':'stop'},usage:{inputTokens:{total:1},outputTokens:{total:1}}}]})};}
for(const native of [false,true]) for(const approved of [false,true]) test(`screen tool ${native?'native image':'follow-up image'}, ${approved?'approved':'denied'}, no bytes in audit`,async()=>{
  let captured=0,index=0;const rows=[];const bytes=new Uint8Array([255,216,13,37]);
  const broker=new ApprovalBroker(card=>queueMicrotask(()=>broker.decide(card.approvalId,approved)),()=>{});
  const session=new ToolSession({imageToolResults:native,definitions:[readScreen(false,async()=>{captured++;return {ok:true,message:'screen',image:bytes};})],broker,
    audit:{beginTool:()=>1,finishTool:(_id,_decision,result)=>rows.push(result),recentTools:()=>[]},messageId:1,context:{dryRun:false,signal:new AbortController().signal},activity:()=>{},changed:()=>{},event:()=>{}});
  const model=new MockLanguageModelV3({doStream:async()=>stream(index++===0?[{type:'tool-call',toolCallId:'s',toolName:'read_screen',input:JSON.stringify({reason:'Answer question'})}]:[{type:'text-start',id:'t'},{type:'text-delta',id:'t',delta:'Done'},{type:'text-end',id:'t'}])});
  await runAgentLoop({model,system:'test',messages:[{role:'user',content:'what is on my screen?'}],signal:session.options.context.signal,onDelta:()=>{},session});
  assert.equal(captured,approved?1:0);assert.ok(rows.every(r=>!r?.image));
  const prompt=model.doStreamCalls.at(-1).prompt;
  if(approved) {const role=native?'tool':'user';assert.ok(prompt.some(m=>m.role===role&&JSON.stringify(m.content).includes('image/jpeg')),JSON.stringify(prompt));}
  else assert.ok(!JSON.stringify(prompt).includes('image-data'));
});
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
test('default history writes metadata only; opt-in writes both JPEGs and attachment rows',async()=>{
  const {persistVision}=require('../src/main/vision/history.ts');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'kite-vision-history-'));
  const metadata=[],files=[];const options={userData:dir,keep:false,row:1,turn:{images:{overview:new Uint8Array([255,216,1]),zoom:new Uint8Array([255,216,2])},analysis:analyzeStrokes([circle()]),captureMs:22},signal:new AbortController().signal,history:{annotate:(...v)=>metadata.push(v),attach:(_id,p)=>files.push(p)}};
  await persistVision(options);assert.equal(metadata.length,1);assert.deepEqual(await fs.readdir(dir),[]);assert.deepEqual(files,[]);
  await persistVision({...options,keep:true});assert.equal(files.length,2);assert.equal((await fs.readdir(path.join(dir,'screens'))).length,2);assert.deepEqual(new Uint8Array(await fs.readFile(files[0])),options.turn.images.overview);
});
for(const toolName of ['create_note','web_search']) test(`annotated user image flows into approved ${toolName}`,async()=>{
  const effects=[],cards=[];let index=0;const dir=await fs.mkdtemp(path.join(os.tmpdir(),'kite-vision-action-'));
  const def=toolName==='create_note'?require('../src/main/tools/impl/create_note.ts').createNote(dir,async p=>{effects.push(p);return '';}):require('../src/main/tools/impl/web_search.ts').webSearch('google',async url=>effects.push(url));
  const input=toolName==='create_note'?{title:'Marked paragraph',content:'A summary of the selected paragraph.'}:{query:'TypeError: Cannot read properties of undefined'};
  const broker=new ApprovalBroker(card=>{cards.push(card);queueMicrotask(()=>broker.decide(card.approvalId,true));},()=>{});
  const session=new ToolSession({definitions:[def],broker,audit:{beginTool:()=>1,finishTool:()=>{},recentTools:()=>[]},messageId:1,context:{dryRun:false,signal:new AbortController().signal},activity:()=>{},changed:()=>{},event:()=>{}});
  const model=new MockLanguageModelV3({doStream:async()=>stream(index++===0?[{type:'tool-call',toolCallId:'action',toolName,input:JSON.stringify(input)}]:[{type:'text-start',id:'t'},{type:'text-delta',id:'t',delta:'Done'},{type:'text-end',id:'t'}])});
  await runAgentLoop({model,system:'test',messages:[{role:'user',content:[{type:'text',text:'Use the circled content.'},{type:'image',image:new Uint8Array([255,216,1]),mediaType:'image/jpeg'}]}],signal:session.options.context.signal,onDelta:()=>{},session});
  assert.equal(cards.length,1);assert.deepEqual(cards[0].input,input);assert.equal(effects.length,1);assert.ok(JSON.stringify(model.doStreamCalls[0].prompt).includes('image/jpeg'));
  if(toolName==='create_note')assert.match(await fs.readFile(effects[0],'utf8'),/selected paragraph/);else assert.ok(effects[0].includes(encodeURIComponent(input.query)));
});
