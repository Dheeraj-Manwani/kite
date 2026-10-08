const {test}=require('node:test'),assert=require('node:assert/strict');
const {BoardScriptParser,sanitizeScript,serializeScript,adaptSavedLesson,diagramFamilies}=require('../src/shared/boardScript.ts');
const {compileScript}=require('../src/shared/board/compile.ts');
const {elkLayout}=require('../src/main/board/elk.ts');
const {applyBeat,layoutScene,lintScene}=require('../src/shared/board.ts');
const {BoardService}=require('../src/main/board/service.ts');
const {boardIcons}=require('../src/shared/boardIcons.ts');
const {elementStrokes}=require('../src/renderer/board/rough.ts');
const {planWhiteboard,boardRequestInput}=require('../src/main/tools/impl/plan_whiteboard.ts');
const {boardModel}=require('../src/shared/board/model.ts');
const {planBoard}=require('../src/main/board/planner.ts');
const script=(family='flow')=>({version:2,title:'Connection',family,mode:'new',nodes:[{id:'client',label:'Client',icon:'user'},{id:'server',label:'Server',icon:'server'}],edges:[{id:'syn',from:'client',to:'server',label:'SYN'},{id:'ack',from:'server',to:'client',label:'ACK'}],beats:[{say:'These are the client and server.',reveal:['client','server']},{say:'The client sends SYN.',reveal:['syn']},{say:'The server replies ACK.',reveal:['ack']}]});
test('line parser is independent of chunk boundaries, respects ready, escapes narration, repairs references',()=>{
 const value=script('sequence');value.beats[0].say='a | b\nwith \\ escapes';const source=serializeScript(value,'lines');
 for(const size of [1,2,7,19,source.length]){const p=new BoardScriptParser();for(let i=0;i<source.length;i+=size)p.push(source.slice(i,i+size));assert.deepEqual(p.finish().script,value);}
 const p=new BoardScriptParser();assert.equal(p.push('board|flow|Test|new\nnode|a|A\nready\nbeat|a|hel').script.beats.length,0);
 assert.equal(p.push('lo\nnode|b|late\nbeat|missing|keep narration\n').script.nodes.length,1);assert.ok(p.finish().fixes.length);
 assert.throws(()=>p.push('x'.repeat(100001)),/100 KB/);
});
test('script sanitizer strips coordinates and repairs cyclic groups, duplicates and invalid edges',()=>{
 const r=sanitizeScript({...script(),nodes:[{id:'a',label:'A',group:true,parent:'b',x:1},{id:'b',label:'B',group:true,parent:'a'},{id:'a',label:'again'},{id:'c'}],edges:[{id:'bad',from:'c',to:'missing'}]});
 assert.equal(r.script.nodes.length,3);assert.ok(r.fixes.length);assert.equal(r.script.edges.length,0);assert.equal(r.script.nodes[0].x,undefined);
});
test('all families keep random labels separate and route clear of shapes',async()=>{
 let state=927;const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2**32;};
 for(const family of diagramFamilies)for(let trial=0;trial<12;trial++){
   const n=2+Math.floor(rand()*14),nodes=Array.from({length:n},(_,i)=>({id:`n${i}`,label:(i%4===0?'ExtraordinaryComponentName':'Component')+i,...(i%3===0?{icon:'server'}:{})}));
   const edges=Array.from({length:n-1},(_,i)=>({id:`e${i}`,from:`n${Math.floor(rand()*(i+1))}`,to:`n${i+1}`,label:'connect'}));
   const value={version:2,title:family,family,mode:'new',nodes,edges,beats:nodes.map((node,i)=>({say:`Explain ${node.label}`,reveal:[node.id,...edges.filter(e=>e.to===node.id).map(e=>e.id)]}))};
   const lesson=await compileScript(value);let scene=[];
   for(const beat of lesson.beats){scene=applyBeat(scene,beat);const m=lintScene(scene);assert.equal(m.overlaps,0,`${family} trial${trial}: ${JSON.stringify(m.issues)}`);assert.equal(m.overflow,0,`${family} overflow ${JSON.stringify(m.issues)}`);assert.equal(m.through,0,`${family} through ${JSON.stringify(m.issues)} ${JSON.stringify(scene)}`);}
   const placements=new Map();for(const beat of lesson.beats)for(const e of beat.draw||[]){if(placements.has(e.id))assert.deepEqual(e,placements.get(e.id));else placements.set(e.id,e);}
 }
});
test('ELK worker lays out nested architecture and mrtree, supports abort',async()=>{
 const value=script('architecture');value.nodes.unshift({id:'group',label:'Backend',group:true});value.nodes.find(n=>n.id==='server').parent='group';
 const lesson=await compileScript(value,{layout:elkLayout});const scene=lesson.beats.reduce(applyBeat,[]),m=lintScene(scene);
 assert.equal(m.overlaps,0,JSON.stringify(m.issues));assert.equal(m.through,0);assert.ok(scene.some(e=>e.id==='group'));
 const tree=await compileScript({...script('tree'),edges:[script().edges[0]]},{layout:elkLayout});assert.equal(lintScene(tree.beats.reduce(applyBeat,[])).through,0);
 const fallback=await compileScript(value,{layout:async()=>{throw new Error('worker unavailable');}});assert.ok(fallback.beats.reduce(applyBeat,[]).some(e=>e.id==='group'));
 assert.equal(lintScene(fallback.beats.reduce(applyBeat,[])).overlaps,0);
 const long={...value,nodes:[...value.nodes,{id:'empty',group:true,label:'An empty group with a rather long heading'}]};long.nodes[0].label='A nested backend with a rather long descriptive heading';
 for(const layout of [elkLayout,async()=>{throw new Error('missing');}]){const l=await compileScript(long,{layout});assert.equal(lintScene(l.beats.reduce(applyBeat,[])).overlaps,0);}
 const controller=new AbortController();controller.abort();await assert.rejects(elkLayout({id:'root'},controller.signal));
});
test('follow-ups pin existing geometry and legacy replay retains the original lesson',async()=>{
 const lesson=await compileScript(script()),base=lesson.beats.reduce(applyBeat,[]);
 const follow={...script(),mode:'add',nodes:[{id:'db',label:'Database',relative:'server',icon:'database'}],edges:[{id:'write',from:'server',to:'db',label:'write'}],beats:[{say:'The server writes here.',reveal:['db','write'],highlight:['server']}]};
 const next=await compileScript(follow,{base});const final=next.beats.reduce(applyBeat,base);
 base.forEach(e=>assert.deepEqual(final.find(v=>v.id===e.id),e));assert.equal(lintScene(final).through,0);assert.equal(lintScene(final).overlaps,0);
 const early=await compileScript(follow,{base,visible:[base[0].id]});assert.ok(early.beats[0].draw.some(e=>e.id==='server'),'a follow-up can reveal a reserved future endpoint without moving it');
 const fresh=await compileScript(script(),{base,visible:base.map(e=>e.id)});assert.ok(fresh.beats[0].draw.some(e=>e.id==='client'),'a new board reveals shared ids from scratch');
 const sequenceLesson=await compileScript(script('sequence')),seqBase=sequenceLesson.beats.reduce(applyBeat,[]);
 const seqAdd=await compileScript({...script('sequence'),mode:'add',nodes:[],edges:[{id:'retry',from:'client',to:'server',label:'retry'}],beats:[{say:'Retry the request.',reveal:['retry']}]},{base:seqBase});
 assert.ok(seqAdd.beats[0].draw.some(e=>e.id==='retry'));seqBase.forEach(e=>assert.deepEqual(seqAdd.beats.reduce(applyBeat,seqBase).find(v=>v.id===e.id),e));
 const legacy={title:'Old board',beats:[{say:'Original',draw:[{id:'a',type:'rectangle',x:132,y:456,label:'Old'}]}]};
 assert.equal(await compileScript(adaptSavedLesson(legacy)),legacy);assert.equal(adaptSavedLesson(lesson),lesson.structure);
});
test('60 generated icons are drawable by the ordinary pen player',()=>{
 assert.equal(Object.keys(boardIcons).length,60);for(const icon of Object.keys(boardIcons)){const e=layoutScene([{id:icon,type:'rectangle',icon,label:'Server',x:0,y:0}])[0];assert.ok(elementStrokes(e).some(s=>s.role==='icon'));}
});
test('small request validates, honors dry-run and cancellation, uses explicit model selection',async()=>{
 let calls=0;const d=planWhiteboard(async()=>{calls++;return{ok:true,message:'drawing'};});
 assert.ok(JSON.stringify(require('zod').z.toJSONSchema(boardRequestInput)).length<800);
 await d.execute({topic:'TCP',mode:'new'},{dryRun:true,signal:new AbortController().signal});assert.equal(calls,0);
 const c=new AbortController();c.abort();await assert.rejects(d.execute({topic:'TCP',mode:'new'},{dryRun:false,signal:c.signal}));assert.equal(calls,0);
 const models=[{provider:'deepseek',id:'deepseek-flash'},{provider:'groq',id:'chosen'}];assert.equal(boardModel({model:models[1]},models,()=>true).id,'deepseek-flash');
 assert.equal(boardModel({model:models[0],boardModel:models[1]},models,()=>true).id,'chosen');assert.throws(()=>boardModel({model:models[0],boardModel:models[1]},models,()=>false));
});
test('closed boards invalidate delayed planner callbacks',()=>{
 const board=new BoardService({emit:()=>{},enabled:()=>true,speak:()=>false,silence:()=>{},speed:()=>1});const epoch=board.beginPlan();assert.equal(board.currentPlan(epoch),true);board.close();assert.equal(board.currentPlan(epoch),false);
});
function fakeModel(source,reason='stop'){
 return {specificationVersion:'v4',provider:'test',modelId:'board',supportedUrls:{},doStream:async()=>({stream:new ReadableStream({start(c){c.enqueue({type:'text-start',id:'t'});for(const chunk of source.match(/.{1,27}|\n/g)||[])c.enqueue({type:'text-delta',id:'t',delta:chunk});c.enqueue({type:'text-end',id:'t'});c.enqueue({type:'finish',finishReason:{unified:reason,raw:reason},usage:{inputTokens:{total:1},outputTokens:{total:99}}});c.close();}})})};
}
test('specialist streams completed beats on a frozen picture in both formats',async()=>{
 for(const format of ['lines','json']){const previews=[],r=await planBoard({model:fakeModel(serializeScript(script(),format)),request:{topic:'TCP',mode:'new'},format,signal:new AbortController().signal,onLesson:l=>previews.push(l)});
 assert.equal(r.script.beats.length,3);assert.equal(r.outputTokens,99);assert.ok(previews.length>=2);assert.equal(previews[0].beats.length,1);
 assert.deepEqual(previews[0].beats[0],r.lesson.beats[0]);assert.equal(r.truncated,false);}
});
test('truncated scripts retain only complete beats; no playable beat fails cleanly',async()=>{
 const source=serializeScript(script(),'lines');const r=await planBoard({model:fakeModel(source+'beat|server|incom','length'),request:{topic:'TCP',mode:'new'},signal:new AbortController().signal});assert.equal(r.truncated,true);
 await assert.rejects(planBoard({model:fakeModel('board|flow|Bad|new\nready\n'),request:{topic:'TCP',mode:'new'},signal:new AbortController().signal}),/no complete/);
});
test('small tool plans, streams, seals and archives structure through the real board service',async()=>{
 const views=[],saved=[];const board=new BoardService({emit:v=>{if(v)views.push(v);},enabled:()=>true,speak:()=>false,silence:()=>{},speed:()=>1,save:b=>saved.push(b)});
 try{
  const value=script('architecture'),tool=planWhiteboard(async(request,ctx)=>{const planned=await planBoard({model:fakeModel(serializeScript(value,'lines')),request,signal:ctx.signal,
   onLesson:lesson=>board.preview(ctx.callId,lesson,{messageId:42})});return board.start(planned.lesson,{callId:ctx.callId,messageId:42});});
  const result=await tool.execute({topic:'Connection',mode:'new'},{dryRun:false,signal:new AbortController().signal,callId:'real-request'});
  assert.equal(result.ok,true);assert.ok(views.some(v=>v.total===1&&v.drawing));assert.equal(board.structuredContext().beats.length,3);
  for(let i=0;i<3;i++)board.control('next');assert.equal(saved.at(-1).lesson.structure.family,'architecture');
  assert.equal(new Set(saved.at(-1).scene.map(e=>e.id)).size,saved.at(-1).scene.length);
  const before=board.inputs();board.reopen(saved.at(-1));assert.deepEqual(board.inputs(),before);
  const epoch=board.beginPlan(),signal=board.planSignal();board.control('close');assert.equal(signal.aborted,true);assert.equal(board.currentPlan(epoch),false);
 }finally{board.close();}
});
