const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseBoardEdit,applyEdits,boardOutline,moveInput,boardInputContext}=require('../src/shared/boardEditing.ts');
const {excalidrawScene,mermaidBoard,validBoardSvg}=require('../src/shared/boardExports.ts');
const {layoutScene,applyBeat}=require('../src/shared/board.ts');
const {BoardSession}=require('../src/main/board/session.ts');
const {BoardService}=require('../src/main/board/service.ts');
const {BoardImages}=require('../src/main/board/images.ts');
const {VoiceController}=require('../src/main/voice/controller.ts');
const {Conversation}=require('../src/main/ai/conversation.ts');
const {compileScript}=require('../src/shared/board/compile.ts');
const {planBoard}=require('../src/main/board/planner.ts');
const inputs=[{id:'a',type:'rectangle',label:'Client',x:100,y:100},{id:'b',type:'rectangle',label:'Server',x:500,y:100},{id:'ab',type:'arrow',from:'a',to:'b',label:'request'}];
const script=(family='flow')=>({version:2,title:'Connection',family,mode:'new',nodes:[{id:'a',label:'Client'},{id:'b',label:'Server'}],edges:[{id:'ab',from:'a',to:'b',label:'request'}],beats:[{say:'Client calls server.',reveal:['a','b','ab']}]});
const deps={emit:()=>{},speed:()=>1,silence:()=>{},speak:()=>false};
function session(){const s=new BoardSession(1,'Test',[{say:'Client calls server.',draw:inputs},{say:'Change client.',draw:[{...inputs[0],x:900,label:'Future'}]}],deps,[],{gapMs:1,drawSlackMs:60000,idleMs:60000});s.start();s.pause();return s;}
test('editing parser validates ids, coordinates, sizes and strips untrusted properties',()=>{
 for(const bad of [{type:'move',id:'<img>',dx:0,dy:0},{type:'move',id:'a',dx:Infinity,dy:0},{type:'move',id:'a',dx:100001,dy:0},{type:'label',id:'a',text:'x'.repeat(501)},{type:'add',element:{id:'a',type:'text',text:'X',x:1,y:1}},{type:'add',element:{id:'user_a',type:'line',points:[{x:1,y:2}]}},{type:'add',element:{id:'user_a',type:'line',points:Array(2049).fill({x:1,y:2})}}])assert.equal(parseBoardEdit(bad),undefined);
 assert.deepEqual(parseBoardEdit({type:'add',element:{id:'user_a',type:'text',text:'My note',x:1,y:2,html:'<script>',color:'red'}}).element,{id:'user_a',type:'text',text:'My note',x:1,y:2,color:'blue',user:true});
 assert.equal(parseBoardEdit({type:'add',element:{id:'user_p',type:'line',points:[{x:0,y:0},{x:1,y:2}],freehand:false}}).element.freehand,true);
});
test('pins and label edits survive future updates, replay, undo and redo',()=>{const s=session();try{
 assert.ok(s.edit({type:'move',id:'a',dx:50,dy:70}));assert.equal(s.visibleInputs()[0].x,150);assert.ok(s.edit({type:'label',id:'a',text:'My client'}));
 s.next();s.pause();assert.equal(s.visibleInputs()[0].label,'My client');assert.equal(s.visibleInputs()[0].x,150);
 assert.ok(s.edit({type:'undo'}));assert.equal(s.visibleInputs()[0].label,'Client');assert.ok(s.edit({type:'redo'}));assert.equal(s.visibleInputs()[0].label,'My client');
 s.replay();s.pause();assert.equal(s.visibleInputs()[0].label,'My client');assert.equal(s.visibleInputs()[0].x,150);
 assert.ok(s.script().edits.elements.length);assert.equal(s.edit({type:'move',id:'missing',dx:1,dy:1}),false);
}finally{s.stop();}});
test('deleting a node also deletes its bindings; undo restores them together',()=>{const s=session();try{assert.ok(s.edit({type:'delete',id:'b'}));assert.deepEqual(s.scene().map(e=>e.id),['a']);assert.ok(s.edit({type:'undo'}));assert.deepEqual(s.scene().map(e=>e.id),['a','b','ab']);assert.ok(s.edit({type:'redo'}));assert.deepEqual(s.scene().map(e=>e.id),['a']);}finally{s.stop();}});
test('user text, pen and bound arrows survive replay; invalid refs and collisions are rejected',()=>{const s=session();try{
 const line=parseBoardEdit({type:'add',element:{id:'user_p',type:'line',points:[{x:0,y:0},{x:60,y:80}]}});assert.ok(s.edit(line));assert.ok(s.scene().find(e=>e.id==='user_p').freehand);
 assert.ok(s.edit(parseBoardEdit({type:'add',element:{id:'user_a',type:'arrow',from:'a',to:'b',points:[{x:120,y:120},{x:520,y:120}]}})));assert.equal(s.visibleInputs().find(e=>e.id==='user_a').points,undefined);
 assert.equal(s.edit({type:'add',element:{id:'user_bad',type:'arrow',from:'missing',points:[{x:1,y:1},{x:2,y:2}]}}),false);assert.equal(s.edit(line),false);
 s.replay();s.pause();assert.ok(s.scene().find(e=>e.id==='user_p'));
 assert.equal(s.edit({type:'move',id:'a',dx:100000,dy:0}),false);
}finally{s.stop();}});
test('overrides never reveal future model nodes; partially bound arrows keep their free endpoint',()=>{
 const user={id:'user_note',type:'text',text:'Mine',user:true,x:0,y:0},edits={elements:[{...inputs[1],x:1000},user],deleted:[]};assert.deepEqual(applyEdits([inputs[0]],edits).map(e=>e.id),['a','user_note']);
 const line={id:'loose',type:'arrow',from:'a',points:[{x:120,y:120},{x:400,y:600}]};const moved=applyEdits([inputs[0],line],{elements:[moveInput(inputs[0],50,50)],deleted:[]});assert.deepEqual(moved[1].points,[{x:400,y:600}]);assert.ok(layoutScene(moved).find(e=>e.id==='loose'));
 const points=Array.from({length:2048},(_,i)=>({x:i,y:i*2})),context=boardInputContext([{id:'user_pen',type:'line',user:true,points}])[0];assert.equal(context.points.length,32);assert.deepEqual(context.points[0],points[0]);assert.deepEqual(context.points.at(-1),points.at(-1));
 const future=new BoardSession(9,'Reserved',[{say:'First',draw:[inputs[0]]},{say:'Later',draw:Array.from({length:199},(_,i)=>({id:`future${i}`,type:'text',text:'Reserved',x:i*100,y:500}))}],deps,[],{gapMs:1,drawSlackMs:60000,idleMs:60000},true);try{future.start();future.pause();assert.equal(future.visibleInputs().length,1);assert.equal(future.edit({type:'add',element:{id:'user_note',type:'text',user:true,text:'Extra',x:0,y:0}}),false);}finally{future.stop();}
});
test('edited boards persist and reopen with original archive id and user coordinates',async()=>{
 const saved=[],views=[],board=new BoardService({...deps,emit:v=>views.push(v),enabled:()=>true,structured:()=>true,editable:()=>true,save:b=>saved.push(b)});
 try{board.start(await compileScript(script()),{messageId:42});board.pause();const snapshot=board.snapshot(),epoch=board.beginPlan(),signal=board.planSignal();assert.equal(board.edit(snapshot.id,{type:'delete',id:'missing'}),false);assert.equal(board.currentPlan(epoch),true);assert.equal(signal.aborted,false);assert.ok(board.edit(snapshot.id,{type:'move',id:'a',dx:70,dy:90}));assert.equal(signal.aborted,true);assert.ok(board.edit(snapshot.id,{type:'label',id:'a',text:'Edited client'}));
 const archive=saved.at(-1),x=board.inputs().find(e=>e.id==='a').x;assert.equal(archive.lesson.edits.elements[0].label,'Edited client');board.close();board.reopen(archive);board.pause();assert.equal(board.inputs().find(e=>e.id==='a').x,x);assert.equal(views.at(-1).savedId,archive.id);assert.match(board.context(),/Edited client/);assert.equal(board.edit(snapshot.id,{type:'delete',id:'a'}),false);
 }finally{board.close();}
});
test('image broker rejects mismatched replies, aborts and resolves on shutdown',async()=>{
 const sent=[],images=new BoardImages(r=>sent.push(r)),controller=new AbortController(),png=new Uint8Array([1,2,3]);let resolved=false;
 const pending=images.request(7,'2',controller.signal).then(v=>{resolved=true;return v;});const r=sent[0];images.reply(r.request,8,'2',png);images.reply(r.request,7,'1',png);await new Promise(r=>setImmediate(r));assert.equal(resolved,false);images.reply(r.request,7,'2',png);assert.equal(await pending,png);
 const cancelled=images.request(7,'3',controller.signal);controller.abort();assert.equal(await cancelled,undefined);const close=images.request(8,'4',new AbortController().signal);images.close();assert.equal(await close,undefined);
 assert.equal(await new BoardImages(()=>{throw Error('gone');}).request(1,'1',new AbortController().signal),undefined);
});
test('board image is discarded if edits or replacement change the snapshot while rendering',async()=>{
 let resolve;const board=new BoardService({...deps,enabled:()=>true,structured:()=>true,editable:()=>true,image:()=>new Promise(r=>resolve=r)});
 try{board.start(await compileScript(script()));board.pause();const pending=board.image(new AbortController().signal);board.edit(board.snapshot().id,{type:'move',id:'a',dx:30,dy:0});resolve(new Uint8Array([1]));assert.equal(await pending,undefined);
 const stale=board.image(new AbortController().signal);board.close();resolve(new Uint8Array([1]));assert.equal(await stale,undefined);
 }finally{board.close();}
});
for(const capable of [true,false])test(`typed element questions use ephemeral own PNG only on vision models: ${capable}`,async()=>{
 const conversation=new Conversation(()=> 'test'),events=[],rows=[];let images=0;
 const controller=new VoiceController({emit:e=>events.push(e),getKey:()=> 'key',transcribe:async()=>assert.fail('No microphone transcription'),conversation,setEscape:()=>{},
 settings:()=>({model:{provider:'groq',id:'mock'}}),describe:()=>({provider:'groq',id:'mock',label:'Mock',supportsVision:capable,supportsTools:false}),
 history:{createConversation:()=>{},addMessage:(...args)=>rows.push(args)},guide:{command:()=>undefined,context:()=> 'Own structure',marks:ids=>`Selected: ${ids}`,image:async()=>{images++;return new Uint8Array([1,2,3]);}},
 vision:{start:()=>assert.fail('No capture'),leave:()=>{},clear:()=>{},prepare:async()=>assert.fail('No capture'),route:()=>assert.fail('No vision reroute')},
 ask:async(messages,_k,_s,delta,_model,_tools,context)=>{assert.equal(context,'Own structure');const content=messages.at(-1).content;if(capable){assert.equal(content[1].mediaType,'image/png');assert.match(content[0].text,/Selected: a/);}else assert.match(content,/Selected: a/);delta('Client');return 'Client';}});
 await controller.submitText('What does this do?',['a']);assert.equal(images,capable?1:0);assert.ok(conversation.context().every(m=>typeof m.content==='string'));assert.ok(!events.some(e=>e.type==='ptt:start'||e.type==='vision:routed'));assert.deepEqual(rows.map(r=>r[1]),['user','assistant']);await controller.shutdown();
});
test('accessibility outline includes every element and every connection beyond sixty elements',()=>{
 const scene=layoutScene([...inputs,...Array.from({length:70},(_,i)=>({id:`note${i}`,type:'text',x:i*50,y:700,text:`Note ${i}`}))]);const outline=boardOutline(scene);assert.equal(outline.length,73);assert.match(outline.find(n=>n.id==='a').label,/Connects to Server/);assert.match(outline.find(n=>n.id==='b').label,/Receives from Client/);assert.match(outline.find(n=>n.id==='ab').label,/From Client to Server/);assert.match(outline.at(-1).label,/Note 69/);
});
test('Excalidraw maps reciprocal bindings, unique bound labels, pen strokes and UTF-8 formula images',()=>{
 const formula={box:{x:0,y:0,width:100,height:50},paths:[{d:'M0 0L50 50',transform:''}]};const scene=layoutScene([...inputs,{id:'a_label',type:'text',text:'Collision',x:0,y:400},{id:'user_pen',type:'line',points:[{x:0,y:0},{x:40,y:50}],freehand:true},{id:'eq',type:'formula',x:0,y:500,label:'x² = 三',formula}]);const json=excalidrawScene(scene);assert.equal(json.type,'excalidraw');assert.equal(new Set(json.elements.map(e=>e.id)).size,json.elements.length);
 const a=json.elements.find(e=>e.id==='a'),edge=json.elements.find(e=>e.id==='ab');assert.equal(edge.startBinding.elementId,'a');assert.equal(edge.endBinding.elementId,'b');assert.ok(a.boundElements.some(e=>e.id==='ab'));assert.ok(a.boundElements.some(e=>e.type==='text'&&e.id!=='a_label'));assert.equal(json.elements.find(e=>e.id==='user_pen').type,'freedraw');assert.match(Buffer.from(json.files.math_eq.dataURL.split(',')[1],'base64').toString(),/^<svg/);assert.equal(json.elements.find(e=>e.id==='eq').customData.tex,'x² = 三');assert.equal(excalidrawScene(scene,true).type,'excalidraw/clipboard');
});
test('Mermaid respects edited visible labels and preserves sequence order; hostile labels stay data',async()=>{
 for(const family of ['flow','sequence']){const s=script(family);s.nodes[0].label='Client"\nclick x "javascript:evil" <script>';s.edges.push({id:'ba',from:'b',to:'a',label:'reply'});s.beats[0].reveal.push('ba');const lesson=await compileScript(s);const scene=layoutScene(lesson.beats.reduce(applyBeat,[]));const out=mermaidBoard(s,scene);assert.ok(out.startsWith(family==='flow'?'flowchart TD':'sequenceDiagram'));assert.ok(!out.includes('<script>'));assert.ok(!out.includes('\nclick'));assert.ok(out.indexOf('request')<out.indexOf('reply'));
 const hidden=mermaidBoard(s,scene.filter(e=>e.id!=='ba'));assert.ok(!hidden.includes('reply'));}
 assert.throws(()=>mermaidBoard(script('data'),[]),/flow and sequence/);
});
test('SVG validation accepts embedded fonts and text, rejects active content and remote references',()=>{
 assert.ok(validBoardSvg('<svg xmlns="http://www.w3.org/2000/svg"><style>@font-face{src:url(data:font/woff2;base64,AAAA)}</style><text>onload=foo url(example)</text></svg>'));
 for(const svg of ['<svg onload="evil()"></svg>','<svg ><script>evil()</script></svg>','<svg ><foreignObject/></svg>','<svg ><style>@import url(https://evil)</style></svg>','<svg ><use href="https://evil"/></svg>','<svg ><a href="#x"/></svg>'])assert.equal(validBoardSvg(svg),false);
});
test('specialist receives own PNG and current edited structure in a follow-up',async()=>{
 let prompt;const model={specificationVersion:'v4',provider:'test',modelId:'board',supportedUrls:{},doStream:async options=>{prompt=options.prompt;return{stream:new ReadableStream({start(c){c.enqueue({type:'text-start',id:'t'});c.enqueue({type:'text-delta',id:'t',delta:JSON.stringify({...script(),mode:'add',nodes:[],edges:[],ready:true,beats:[{say:'The client calls server.',reveal:[],highlight:['a']}]})});c.enqueue({type:'text-end',id:'t'});c.enqueue({type:'finish',finishReason:{unified:'stop',raw:'stop'},usage:{inputTokens:{total:1},outputTokens:{total:10}}});c.close();}})};}};
 await planBoard({model,format:'json',signal:new AbortController().signal,request:{topic:'Explain my edit',mode:'add'},base:[{...inputs[0],label:'Edited client'}],current:script(),image:new Uint8Array([1,2,3])});const user=prompt.find(m=>m.role==='user');assert.match(user.content[0].text,/Edited client/);assert.equal(user.content[1].type,'file');assert.equal(user.content[1].mediaType,'image/png');
});
test('Open in Excalidraw targets only its sandboxed editor, pastes by keyboard and restores the clipboard',async()=>{
 const Module=require('node:module'),load=Module._load,windows=[];let value='Previous clipboard',failLoad=false,pasted;
 class Item{constructor(entries){this.entries=entries;this.types=Object.keys(entries);}async getType(type){return this.entries[type];}}
 const clipboard={read:async()=>[new Item({'text/plain':new Blob([value],{type:'text/plain'})})],write:async items=>{value=await (await items[0].getType('text/plain')).text();},writeText:async text=>{value=text;},clear:()=>{value='';}};
 class Window{destroyed=false;constructor(options){this.options=options;windows.push(this);this.keys=[];this.webContents={session:{setPermissionRequestHandler:handler=>{handler(null,'camera',granted=>assert.equal(granted,false));}},setWindowOpenHandler:handler=>assert.deepEqual(handler({url:'https://evil.example'}),{action:'deny'}),on:()=>{},executeJavaScript:async source=>{assert.match(source,/querySelector/);return true;},focus:()=>{},sendInputEvent:key=>{this.keys.push(key);if(key.type==='keyDown'&&key.keyCode==='V')pasted=value;}};}async loadURL(url){this.url=url;if(failLoad)throw Error('offline');}focus(){}isDestroyed(){return this.destroyed;}destroy(){this.destroyed=true;}}
 let files;try{Module._load=function(name,...args){return name==='electron'?{BrowserWindow:Window,clipboard,ClipboardItem:Item}:load.call(this,name,...args);};files=require('../src/main/board/files.ts');}finally{Module._load=load;}
 try{await files.openInExcalidraw('{"type":"excalidraw/clipboard"}');const win=windows[0];assert.equal(win.url,'https://excalidraw.com');assert.equal(win.options.webPreferences.sandbox,true);assert.equal(win.options.webPreferences.nodeIntegration,false);assert.equal(value,'Previous clipboard');assert.match(pasted,/excalidraw\/clipboard/);assert.deepEqual(win.keys.map(k=>k.keyCode),['Escape','Escape','V','V']);assert.deepEqual(win.keys[2].modifiers,['control']);
 failLoad=true;await assert.rejects(files.openInExcalidraw('{}'),/offline/);assert.ok(windows.at(-1).destroyed);assert.equal(value,'Previous clipboard');const c=new AbortController();c.abort();const count=windows.length;await assert.rejects(files.openInExcalidraw('{}',c.signal));assert.equal(windows.length,count);
 }finally{delete require.cache[require.resolve('../src/main/board/files.ts')];delete require.cache[require.resolve('../src/main/tools/electronClipboard.ts')];}
});
