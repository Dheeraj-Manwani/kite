const {test}=require('node:test'),assert=require('node:assert/strict');
const {boardAppearance,handwritingStrokes,themeInk,themePaper,multilingualBoardCommand}=require('../src/shared/boardDelight.ts');
const {classifyBoardCommand,layoutScene}=require('../src/shared/board.ts');
const {boardVideoPlan,validBoardWebm}=require('../src/shared/boardVideo.ts');
const {BoardVideoExports,synthesizeBoardNarration}=require('../src/main/board/video.ts');
const {BoardService}=require('../src/main/board/service.ts');
const {structuredBoards,teachingBoards,ownedBoards,delightBoards}=require('../src/main/board/feature.ts');
const lesson={title:'Connection',beats:[{say:'Client sends a request.',draw:[{id:'a',type:'rectangle',label:'Client',x:100,y:100}]},{say:'Server receives the request.',draw:[{id:'b',type:'rectangle',label:'Server',x:500,y:100},{id:'ab',type:'arrow',from:'a',to:'b',label:'request'}],ask:'Who sends it?'}]};
const settings={voiceId:'fixture',ttsEnabled:true,speed:1},pcm=new Uint8Array(new Float32Array([0,.1,-.1,0]).buffer);
test('phase 5 implies earlier extensions, respecting the phase 2 override',()=>{
 const keys=['2','3','4','5'].map(n=>`KITE_BOARD_PHASE${n}`),old=keys.map(k=>process.env[k]);try{keys.forEach(k=>delete process.env[k]);process.env.KITE_BOARD_PHASE5='1';assert.deepEqual([structuredBoards(),teachingBoards(),ownedBoards(),delightBoards()],[true,true,true,true]);process.env.KITE_BOARD_PHASE2='0';assert.deepEqual([structuredBoards(),teachingBoards(),ownedBoards(),delightBoards()],[false,false,false,false]);}finally{keys.forEach((k,i)=>old[i]===undefined?delete process.env[k]:process.env[k]=old[i]);}
});
test('theme ink has readable contrast in all three themes; malformed archives fall back',()=>{
 const luminance=hex=>{const rgb=hex.slice(1).match(/../g).map(s=>parseInt(s,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
 for(const theme of ['paper','chalkboard','blueprint'])for(const color of ['black','blue','red','green','purple','teal']){const ink=luminance(themeInk(theme,color).stroke),paper=luminance(themePaper(theme));assert.ok((Math.max(ink,paper)+.05)/(Math.min(ink,paper)+.05)>3,`${theme}:${color}`);}
 assert.deepEqual(boardAppearance({theme:'bogus',handwriting:false}),{theme:'paper',handwriting:false});assert.deepEqual(boardAppearance(),{theme:'paper',handwriting:true});
});
test('short labels are monoline paths; long text and unsupported scripts use text',()=>{
 const block=layoutScene([{id:'text',type:'text',text:'Client 42',x:100,y:100}])[0].text,paths=handwritingStrokes(block);assert.equal(paths.length,8);assert.ok(paths.every(p=>p.d.startsWith('M')&&p.transform.startsWith('translate(')));
 for(const text of ['हिन्दी','éclair','This narration is deliberately longer than thirty two characters.'])assert.equal(handwritingStrokes({...block,lines:[text]}),undefined);
 const narrow=handwritingStrokes({...block,lines:['IIII'],width:10});assert.ok(narrow.every(p=>!p.transform.includes('NaN')));
});
test('Hindi, romanized Hindi, Spanish, French and German commands remain exact and opt-in',()=>{
 for(const [text,action] of [['रुकिए।','pause'],['ruko','pause'],['जारी रखो','resume'],['अगला चरण','next'],['पिछला भाग','previous'],['दोहराओ','repeat'],['बोर्ड बंद करो','close'],['siguiente paso','next'],['CONTINÚA!','resume'],['étape suivante','next'],['von vorne','replay'],['más pequeño','smaller'],['vuelve al tablero anterior','back']]){assert.equal(classifyBoardCommand(text,true),action);assert.equal(classifyBoardCommand(text),'new-request');}
 assert.deepEqual(multilingualBoardCommand('धीरे बोलो'),{type:'speed',speed:.75});assert.deepEqual(multilingualBoardCommand('plus vite'),{type:'speed',speed:1.5});
 for(const text of ['अगला चरण क्यों है','why is the next phase useful','siguiente paso por qué','how do I pause this thread','répète le nom du serveur'])assert.equal(classifyBoardCommand(text,true),'new-request');
});
test('style changes pause, change revision, save and survive archive replay',()=>{
 const saved=[],views=[],board=new BoardService({emit:v=>views.push(v),speak:()=>false,silence:()=>{},speed:()=>1,enabled:()=>true,editable:()=>true,delight:()=>true,save:s=>saved.push(s)});
 try{board.start(lesson,{messageId:42});const before=board.snapshot();assert.ok(board.appearance(before.id,{theme:'blueprint',handwriting:false}));assert.notEqual(board.snapshot().revision,before.revision);assert.equal(views.at(-1).status,'paused');assert.equal(saved.at(-1).lesson.appearance.theme,'blueprint');board.close();board.reopen(saved.at(-1));assert.equal(views.at(-1).appearance.handwriting,false);assert.equal(views.at(-1).appearance.theme,'blueprint');assert.equal(board.appearance(before.id,{theme:'paper',handwriting:true}),false);assert.equal(board.command('रुको'),'Okay, I’ll wait.');}finally{board.close();}
});
test('video reconstructs every beat with edits, erasures, changed values and quiz captions',()=>{
 const plan=boardVideoPlan('token',{...lesson,appearance:{theme:'chalkboard',handwriting:true},edits:{elements:[{...lesson.beats[0].draw[0],label:'Edited',x:180}],deleted:[]}});
 assert.equal(plan.appearance.theme,'chalkboard');assert.equal(plan.beats[0].scene[0].label.lines[0],'Edited');assert.equal(plan.beats[0].scene.length,1);assert.equal(plan.beats[1].scene.length,3);assert.match(plan.beats[1].say,/Who sends it\?/);
 const change=boardVideoPlan('token',{title:'Changed',beats:[lesson.beats[0],{say:'Change it',draw:[{...lesson.beats[0].draw[0],label:'Changed'}]},{say:'Erase',erase:['a']}]});assert.deepEqual(change.beats[1].changed,['a']);assert.deepEqual(change.beats[2].erased,['a']);assert.equal(change.beats[2].scene.length,0);
});
test('video jobs freeze settings, reject duplicate/out-of-order requests, and require full narration',async()=>{
 let snapshot={id:1,revision:'a',lesson,streaming:false},release;const seen=[],exports=new BoardVideoExports(()=>snapshot,(text,s,signal)=>{seen.push({text,s,signal});return new Promise(r=>release=r);});
 try{const plan=exports.prepare(1,'a',settings);assert.throws(()=>exports.complete(plan.token),/incomplete/);await assert.rejects(exports.narration(plan.token,1),/Invalid/);const pending=exports.narration(plan.token,0);await assert.rejects(exports.narration(plan.token,0),/Invalid/);settings.speed=1.5;assert.equal(seen[0].s.speed,1);release({pcm});await pending;const second=exports.narration(plan.token,1);release({pcm});await second;assert.equal(exports.complete(plan.token),'Connection');await assert.rejects(exports.narration(plan.token,0),/cancelled/);snapshot={...snapshot,streaming:true};assert.throws(()=>exports.prepare(1,'a',settings),/planning/);}finally{settings.speed=1;exports.cancel();}
});
test('closing, replacing, changing style, cancellation and provider failure discard video jobs',async()=>{
 let snapshot={id:1,revision:'a',lesson,streaming:false};let release,signal;const exports=new BoardVideoExports(()=>snapshot,(_text,_s,s)=>{signal=s;return new Promise(r=>release=r);});
 try{for(const how of ['cancel','changed','replace']){snapshot={id:1,revision:'a',lesson,streaming:false};const plan=exports.prepare(1,'a',settings),pending=exports.narration(plan.token,0);if(how==='cancel')exports.cancel(plan.token);else if(how==='changed')exports.changed(1,'b');else{snapshot={...snapshot,id:2};exports.changed(2,'a');}assert.equal(signal.aborted,true);release({pcm});await assert.rejects(pending,/cancelled/);}
 const failed=new BoardVideoExports(()=>({id:1,revision:'a',lesson,streaming:false}),async()=>{throw Error('offline');});const p=failed.prepare(1,'a',settings);await assert.rejects(failed.narration(p.token,0),/offline/);assert.throws(()=>failed.complete(p.token),/cancelled/);}finally{exports.cancel();}
});
test('WebM validator bounds untrusted IPC data and checks EBML header',()=>{
 assert.equal(validBoardWebm(new Uint8Array([0x1a,0x45,0xdf,0xa3])),false);const good=new Uint8Array(32);good.set([0x1a,0x45,0xdf,0xa3]);assert.ok(validBoardWebm(good));assert.equal(validBoardWebm('video'),false);good[0]=0;assert.equal(validBoardWebm(good),false);
});
test('dedicated narration concatenates PCM, retains timestamps and closes exactly once',async()=>{
 let emit,closed=0;const pending=synthesizeBoardNarration('Text',settings,()=>'',new AbortController().signal,cb=>{emit=cb;return{close:()=>closed++,speak:()=>{}};});
 emit({type:'tts:chunk',audio:pcm.buffer});emit({type:'tts:chunk',audio:pcm.buffer});emit({type:'tts:timestamps',timestamps:{words:['First'],start:[0],end:[.3]}});emit({type:'tts:timestamps',timestamps:{words:['second'],start:[.4],end:[.7]}});emit({type:'tts:done'});const audio=await pending;assert.equal(audio.pcm.length,pcm.length*2);assert.deepEqual(audio.timestamps,{words:['First','second'],start:[0,.4],end:[.3,.7]});assert.equal(closed,1);emit({type:'tts:done'});assert.equal(closed,1);
});
test('dedicated narration aborts, rejects empty audio and limits provider audio',async()=>{
 for(const kind of ['abort','empty','oversize','error']){let emit,closed=0;const controller=new AbortController(),pending=synthesizeBoardNarration('Text',settings,()=>'',controller.signal,cb=>{emit=cb;return{close:()=>closed++,speak:()=>{}};});const rejection=assert.rejects(pending);if(kind==='abort')controller.abort();if(kind==='empty')emit({type:'tts:done'});if(kind==='oversize')emit({type:'tts:chunk',audio:new ArrayBuffer(12_000_004)});if(kind==='error')emit({type:'tts:error'});await rejection;assert.equal(closed,1);}
});
