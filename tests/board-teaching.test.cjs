const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {expression,samplePlot}=require('../src/shared/boardExpression.ts');
const {cueTimings,sanitizeTeaching}=require('../src/shared/boardTeaching.ts');
const {BoardScriptParser,serializeScript,sanitizeScript}=require('../src/shared/boardScript.ts');
const {compileScript}=require('../src/shared/board/compile.ts');
const {formulaPaths,closeMathWorker}=require('../src/main/board/math.ts');
const {applyBeat,layoutScene,lintScene,classifyBoardCommand}=require('../src/shared/board.ts');
const {BoardSession}=require('../src/main/board/session.ts');
const {BoardService}=require('../src/main/board/service.ts');
const {TTSService}=require('../src/main/voice/tts.ts');
const {VoiceController}=require('../src/main/voice/controller.ts');
const tick=()=>new Promise(r=>setImmediate(r)),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const basic=()=>({version:2,title:'Array',family:'data',collection:'array',mode:'new',nodes:[{id:'a',label:'7',index:0},{id:'b',label:'3',index:1}],edges:[],beats:[{say:'Seven precedes three.',reveal:['a','b'],cues:{a:'Seven',b:'three'}},{say:'Swap the two values.',reveal:[],changes:[{kind:'swap',a:'a',b:'b'}]},{say:'Update the value.',reveal:[],changes:[{kind:'value',id:'b',value:'123456789'}],recap:true,highlight:['a','b']}]});
test('safe expressions obey precedence and break plots at discontinuities',()=>{
 assert.equal(expression('-x^2 + 2^3^2')(3),503);assert.equal(expression('sin(pi/2)+sqrt(4)+abs(-3)')(0),6);
 for(const s of ['process.exit()','x;alert(1)','constructor(1)','x[0]','sin x','('.repeat(50)+'x'+')'.repeat(50),'1..2'])assert.throws(()=>expression(s),s);
 const paths=samplePlot({expression:'1/x',xmin:-3,xmax:3,ymin:-4,ymax:4});assert.ok(paths.length>=2);assert.ok(paths.every(path=>path.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))));
 assert.throws(()=>samplePlot({expression:'x',xmin:1,xmax:1,ymin:0,ymax:2}));
});
test('cue schedules use explicit phrases, label matches and audio seconds without network offsets',()=>{
 const elements=[{id:'a',label:'Client'},{id:'b',label:'Server'}],words={words:['The','client','sends','to','the','server'],start:[0,.2,.4,.6,.8,1],end:[.1,.3,.5,.7,.9,1.2]};
 const cues=cueTimings(elements,'The client sends to the server',{b:'the server'},words);assert.equal(cues[0].startMs,200);assert.equal(cues[1].startMs,800);assert.equal(cues[0].durationMs,600);
 assert.ok(cueTimings(elements,'Client Server',{},undefined,1.5)[1].startMs<cueTimings(elements,'Client Server')[1].startMs);
 const clean=sanitizeTeaching({cues:{a:'client',unknown:'evil'},effects:[{kind:'badge',id:'a',number:1},{kind:'badge',id:'a',number:999}],changes:[{kind:'value',id:'a',value:'4'},{kind:'swap',a:'a',b:'unknown'}],ask:' Which one? '},new Set(['a']));
 assert.deepEqual(clean.cues,{a:'client'});assert.equal(clean.effects.length,1);assert.equal(clean.changes.length,1);assert.equal(clean.ask,'Which one?');
});
test('teaching metadata survives arbitrary streaming chunks and malformed actions are dropped',()=>{
 const script=basic();script.navigation='child';script.beats[0].effects=[{kind:'underline',ids:['a']}];script.beats[1].ask='What comes first?';
 for(const size of [1,3,11]){const p=new BoardScriptParser(),text=serializeScript(script,'lines');for(let i=0;i<text.length;i+=size)p.push(text.slice(i,i+size));const parsed=p.finish();assert.deepEqual(parsed.script,script);}
 assert.deepEqual(sanitizeScript(JSON.parse(serializeScript(script,'json'))).script,script);
});
test('data families reserve future values and support swaps, value updates and stable indices',async()=>{
 for(const collection of ['array','stack','queue','linked-list','hash']){
  const script={...basic(),collection},lesson=await compileScript(script);let scene=[];const first=lesson.beats[0].draw;
  for(const beat of lesson.beats){scene=applyBeat(scene,beat);const m=lintScene(scene);assert.equal(m.overlaps+m.overflow,0,collection);}
  assert.equal(scene.find(e=>e.id==='a').x,first.find(e=>e.id==='b').x);assert.equal(scene.find(e=>e.id==='b').label,'123456789');
  assert.deepEqual(scene.find(e=>e.id==='a_index'),first.find(e=>e.id==='a_index'));
  const mixed=await compileScript({...script,beats:[script.beats[0],{say:'Swap and update.',reveal:[],changes:[{kind:'swap',a:'a',b:'b'},{kind:'value',id:'a',value:'123456789'}]}]});
  const last=mixed.beats[1].draw;assert.equal(last.filter(e=>e.id==='a').length,1);assert.equal(last.find(e=>e.id==='a').label,'123456789');assert.equal(lintScene(mixed.beats.reduce(applyBeat,[])).overlaps,0);
 }
});
test('MathJax loads in a worker; equation columns align and plots expose axes, points and shade',async()=>{
 try{
  const tex=await formulaPaths('\\frac{x^2}{2}+\\sqrt{3}');assert.ok(tex.paths.length>3);assert.ok(tex.box.width>0);assert.ok(tex.paths.every(p=>p.d&&!/<|href|script/i.test(p.d)));
  const script={...basic(),family:'steps',nodes:[{id:'a',label:'Equation',tex:'x+2=5'},{id:'b',label:'Answer',tex:'x=3'}],beats:[{say:'Subtract two from both sides.',reveal:['a','b']}]};
  const lesson=await compileScript(script,{formula:formulaPaths}),draw=lesson.beats[0].draw;assert.equal(draw.find(e=>e.id==='a_eq').x,draw.find(e=>e.id==='b_eq').x);assert.ok(draw.filter(e=>e.type==='formula').every(e=>e.formula.paths.length));assert.equal(lintScene(draw).overlaps,0);
  assert.equal(draw.find(e=>e.id==='a_note').text,'Equation');assert.equal(draw.find(e=>e.id==='b_note').text,'Answer');
  const plot={...basic(),family:'plot',nodes:[{id:'p',label:'Parabola',plot:{expression:'x^2',xmin:-3,xmax:3,ymin:-1,ymax:9,points:[{x:0,y:0}],shade:true}}],beats:[{say:'Here is the parabola.',reveal:['p']}]};
  const graph=await compileScript(plot);assert.ok(graph.beats[0].draw.some(e=>e.id==='p_xaxis'));assert.ok(graph.beats[0].draw.some(e=>e.id==='p_point_0'));assert.ok(graph.beats[0].draw.some(e=>e.fill==='solid'));
 }finally{closeMathWorker();}
});
test('quiz waits after both speech and drawing; navigation, speed and stale timestamp cancellation work',async()=>{
 const said=[],views=[],prefetched=[],beats=[{say:'Client calls server.',ask:'Who replies?',draw:[{id:'a',type:'rectangle',label:'Client',x:0,y:0}],cues:{a:'Client'}},{say:'The server replies.',draw:[{id:'b',type:'rectangle',label:'Server',x:400,y:0}]},{say:'Recap.',recap:true,highlight:['a','b']}];
 const s=new BoardSession(1,'Quiz',beats,{emit:v=>views.push(v),teaching:()=>true,speed:()=>1,silence:()=>{},prefetch:t=>prefetched.push(t),speak:(text,hooks)=>{said.push({text,hooks});return true;}},[],{gapMs:1,drawSlackMs:1000,idleMs:60000});
 try{s.start();let hooks=said[0].hooks;hooks.timestamps({words:['Client','calls','server'],start:[0,.4,.8],end:[.3,.7,1.1]},42);hooks.started(42);assert.equal(views.at(-1).drawing.audioId,42);s.drew(views.at(-1).drawing.key);assert.equal(s.state,'playing');hooks.done('spoken');await sleep(8);assert.equal(s.state,'asking');assert.equal(s.question,'Who replies?');assert.equal(prefetched.length,0);
  s.answerQuestion('The server');assert.equal(s.state,'paused');assert.equal(s.answer,'The server');s.next();assert.equal(s.beat,1);assert.equal(prefetched.at(-1),'Recap.');s.setSpeed(1.5);assert.equal(said.at(-1).hooks.speed,1.5);s.previous();assert.equal(s.beat,0);
  const last=views.at(-1);hooks.timestamps({words:['STALE'],start:[0],end:[1]},42);assert.equal(views.at(-1),last);s.jump(2);assert.equal(s.beat,2);assert.equal(s.scene().length,2);s.jump(99);assert.equal(s.beat,2);
  assert.equal(classifyBoardCommand('previous'),'previous');assert.equal(classifyBoardCommand('go back'),'back');assert.deepEqual(classifyBoardCommand('slower'),{type:'speed',speed:.75});
 }finally{s.stop();}
});
class Socket extends EventEmitter {readyState=0;messages=[];send(data,cb){this.messages.push(JSON.parse(data));cb?.();}terminate(){this.readyState=3;this.emit('close');}close(){this.terminate();}}
test('prefetched Cartesia audio is silent until adopted and forwards its arriving tail with the right id',async()=>{
 const sockets=[],events=[],settings={ttsEnabled:true,voiceId:'voice',speed:1};const tts=new TTSService(()=> 'key',e=>events.push(e),()=>{const s=new Socket();sockets.push(s);setImmediate(()=>{s.readyState=1;s.emit('open');});return s;});
 const emit=(s,type,data={})=>s.emit('message',Buffer.from(JSON.stringify({type,context_id:s.messages[0].context_id,...data})));
 try{tts.prefetch('Next beat.',settings);await tick();await tick();const socket=sockets[0];emit(socket,'chunk',{data:Buffer.from(new Float32Array([.2,.3]).buffer).toString('base64')});assert.equal(events.length,0);
  tts.speak(7,settings,'Next beat.');assert.deepEqual(events.map(e=>[e.id,e.type]),[[7,'tts:start'],[7,'tts:chunk']]);emit(socket,'timestamps',{word_timestamps:{words:['Next'],start:[0],end:[]}});emit(socket,'timestamps',{word_timestamps:{words:['Next'],start:[1],end:[.4]}});assert.equal(events.length,2);emit(socket,'timestamps',{word_timestamps:{words:['Next'],start:[0],end:[.4]}});emit(socket,'done');assert.equal(events.at(-1).type,'tts:done');assert.ok(events.every(e=>e.id===7));
  tts.prefetch('Another beat.',settings);await tick();const before=events.length;tts.clearPrefetch();const cancelled=sockets[1];emit(cancelled,'chunk',{data:'AAAAAA=='});assert.equal(events.length,before);
 }finally{tts.close();}
});
test('quiet announcement forwards timestamps and playback identity and honors lesson speed',()=>{
 const events=[],spoken=[],controller=new VoiceController({emit:e=>events.push(e),getKey:()=> 'key',transcribe:async()=>'',ask:async()=>'',history:{},conversation:{},setEscape:()=>{},settings:()=>({ttsEnabled:true,voiceId:'voice',speed:1}),tts:{start(){},push(){},finish(){},cancel(){},speak:(id,s,text)=>spoken.push({id,s,text})}});
 const words=[],starts=[];controller.announce('The server replies.',{speed:1.5,started:id=>starts.push(id),timestamps:(t,id)=>words.push({t,id}),done:()=>{}});
 const id=spoken[0].id;controller.ttsEvent({id,type:'tts:timestamps',timestamps:{words:['server'],start:[.3],end:[.8]}});controller.playback(id,'started');assert.equal(words[0].id,id);assert.deepEqual(starts,[id]);assert.equal(spoken[0].s.speed,1.5);controller.announce(null);
});
test('drill-down returns to its pinned parent and preserves the parent archive identity',async()=>{
 const views=[],saved=[],service=new BoardService({emit:v=>views.push(v),enabled:()=>true,structured:()=>true,teaching:()=>true,speak:()=>false,silence:()=>{},speed:()=>1,save:b=>saved.push(b)});
 try{const parent=await compileScript(basic());service.start(parent,{messageId:3});const id=views.at(-1).id,archive=views.at(-1).savedId,scene=views.at(-1).elements;
  const child=await compileScript({...basic(),title:'Detail',navigation:'child'});service.start(child,{messageId:4});assert.deepEqual(views.at(-1).breadcrumbs,['Array']);assert.notEqual(views.at(-1).id,id);service.control('back');assert.equal(views.at(-1).id,id);assert.equal(views.at(-1).savedId,archive);assert.deepEqual(views.at(-1).elements,scene);assert.ok(saved.some(b=>b.id===archive));
 }finally{service.close();}
});
