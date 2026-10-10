const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { MockLanguageModelV3, simulateReadableStream } = require('ai/test');
const { ApprovalBroker, classifyApproval, needsApproval } = require('../src/main/tools/approval.ts');
const { ToolSession } = require('../src/main/tools/registry.ts');
const { runAgentLoop } = require('../src/main/ai/agentLoop.ts');
const { pasteText } = require('../src/main/tools/clipboard.ts');
const { findApps } = require('../src/main/tools/appIndex.ts');
const { ReminderScheduler } = require('../src/main/tools/reminders.ts');
const impl = name => require(`../src/main/tools/impl/${name}.ts`);
const fixture = ['Google Chrome','Visual Studio Code','Notepad','Spotify','Firefox','Firefox Developer Edition','Acme Editor','Acme Reader'].map(displayName=>({displayName,lnkPath:`C:/fixture/${displayName}.lnk`}));
function definitions(effect = ()=>{}) {
  const store={addReminder:()=>{effect();return 1;},listReminders:()=>{effect();return [];},cancelReminder:()=>{effect();return true;}};
  const clipboard={read:async()=>{effect();return [];},write:async()=>effect(),readText:async()=>{effect();return 'x'.repeat(5000);},writeText:async()=>effect(),clear:()=>effect()};
  return [impl('get_datetime').getDatetime,impl('open_app').openApp(fixture,async()=>{effect();return '';}),impl('open_url').openUrl(async()=>effect()),impl('web_search').webSearch('google',async()=>effect()),impl('type_text').typeText(clipboard,{capture:async()=>({hwnd:1,pid:2,title:'Fixture',process:'Fixture'}),paste:async()=>{effect();return true;}}),impl('read_clipboard').readClipboard(clipboard.readText),impl('write_clipboard').writeClipboard(clipboard.writeText),impl('set_timer').setTimer(store),impl('set_reminder').setReminder(store),impl('list_reminders').listReminders(store),impl('cancel_reminder').cancelReminder(store),impl('create_note').createNote('Z:/must-not-exist',async()=>{effect();return '';})];
}
const future = new Date(Date.now()+86400000).toISOString();
const inputs=[{}, {name:'Spotify'}, {url:'https://youtube.com/watch?v=abc'}, {query:'lo-fi & beats'}, {text:'meeting at 5'}, {}, {text:'hello'}, {minutes:1,label:'stretch'}, {at:future,label:'stretch'}, {}, {id:1}, {title:'draft',content:'hello'}];
const invalid=[{extra:true},{name:''},{url:'file:///C:/'},{query:''},{text:'x'.repeat(5001)},{extra:1},{text:''},{minutes:-1,label:'x'},{at:'2000-01-01T00:00:00Z',label:'x'},{extra:true},{id:0},{title:'',content:'x'}];
test('every tool validates before execution, has deterministic summary, and dry run has no effects',async()=>{
  let effects=0; const defs=definitions(()=>effects++);const ctx={signal:new AbortController().signal,dryRun:true};
  const summaries=['Check the current local date and time.','Open "Spotify"?','Open youtube.com?','Search the web for "lo-fi & beats" (google)?','Paste "meeting at 5" into the destination app?','Let me read your clipboard?','Copy "hello" to your clipboard?','Set a 1-minute timer: "stretch"?',`Remind you at ${future}: "stretch"?`,'List your scheduled reminders.','Cancel reminder #1?','Create and open "draft.md" in Documents/Kite Notes?'];
  for(let i=0;i<defs.length;i++) {
    const d=defs[i];assert.ok(d.inputSchema.safeParse(inputs[i]).success,d.name);
    assert.equal(d.inputSchema.safeParse(invalid[i]).success,false,d.name);
    assert.throws(()=>d.summarize(invalid[i]));await assert.rejects(()=>d.execute(invalid[i],ctx));
    assert.equal(d.summarize(inputs[i]),summaries[i]);
    assert.equal((await d.execute(inputs[i],ctx)).dryRun,true,d.name);
    assert.equal(needsApproval(d),!['get_datetime','list_reminders'].includes(d.name));
  }
  assert.equal(effects,0);
  assert.equal(defs[1].summarize(inputs[1]),'Open "Spotify"?');
  assert.equal(defs[2].summarize(inputs[2]),'Open youtube.com?');
  assert.equal(defs[5].summarize({}),'Let me read your clipboard?');
  assert.equal(defs[10].summarize({id:1}),'Cancel reminder #1?');
  assert.match(defs[4].summarize({text:'x'.repeat(200)}),/x{80}…/);
});
test('URLs reject unsafe schemes, credentials, malformed values and extra arguments',()=>{
  const d=definitions()[2];
  for(const url of ['file:///C:/','javascript:alert(1)','data:text/plain,hi','ftp://example.com','https://user:pass@example.com','not a url']) assert.equal(d.inputSchema.safeParse({url}).success,false,url);
  assert.equal(d.inputSchema.safeParse({url:'https://example.com',command:'anything'}).success,false);
});
test('approval classifier exact affirmatives, negatives and changed instructions',()=>{
  for(const s of ['yes','Yeah!','sure','do it','go ahead','okay','yes please.']) assert.equal(classifyApproval(s),'approve');
  for(const s of ['no','nope','cancel','stop',"don't",'don’t.']) assert.equal(classifyApproval(s),'deny');
  for(const s of ['no, open Firefox instead','yes and delete it','not sure','','okay open Chrome']) assert.equal(classifyApproval(s),'new-request');
  assert.equal(needsApproval({name:'x',kind:'action'},{defaults:{info:false,action:true},tools:{x:false}}),false);
});
test('app aliases, fuzzy match, weak and ambiguous results never guess',async()=>{
  for(const [q,want] of [['chrome','Google Chrome'],['vs code','Visual Studio Code'],['notepad','Notepad'],['spotfy','Spotify']]) assert.equal(findApps(fixture,q).match.displayName,want);
  const ambiguous=findApps(fixture,'Acme');assert.equal(ambiguous.match,undefined);assert.equal(ambiguous.candidates.length,2);
  assert.equal(findApps(fixture,'completely unrelated application').match,undefined);
  let opened=0;const d=impl('open_app').openApp(fixture,async()=>{opened++;return '';});
  const result=await d.execute({name:'Acme'},{dryRun:false,signal:new AbortController().signal});assert.equal(opened,0);assert.equal(result.data.length,2);
});
test('clipboard restores all formats, empty clipboard and abort after write',async()=>{
  for(const saved of [[],[{types:['text/plain','image/png'],data:'opaque snapshot'}]]) {
    const events=[]; const c={read:async()=>saved,writeText:async t=>events.push(t),write:async items=>{assert.equal(items,saved);events.push('restore');},clear:()=>events.push('clear')};
    await pasteText(c,'meeting',new AbortController().signal,()=>events.push('paste'),async ms=>{assert.equal(ms,300);events.push('delay');});
    assert.deepEqual(events,['meeting','paste','delay',saved.length?'restore':'clear']);
    const abort=new AbortController();c.writeText=async()=>{events.push('write');abort.abort();};
    await assert.rejects(()=>pasteText(c,'x',abort.signal,()=>assert.fail('must not paste')));
    assert.equal(events.at(-1),saved.length?'restore':'clear');
  }
});
test('paste approval names and binds the destination; execution rechecks after writing and restores clipboard on rejection',async()=>{
  const target={hwnd:12,pid:34,title:'Draft — editor',process:'Test editor'},events=[];
  const clipboard={read:async()=>[{data:'saved'}],writeText:async text=>events.push(['write',text]),write:async()=>events.push(['restore']),clear:()=>assert.fail('snapshot exists')};
  let changed=true;
  const tool=impl('type_text').typeText(clipboard,{capture:async()=>target,paste:async reviewed=>{assert.equal(reviewed,target);events.push(['check']);return !changed;}});
  const h=harness('approved',false,[tool]);h.session.options.audit.updateToolSummary=(id,summary)=>h.rows[id-1].summary=summary;
  assert.equal(await h.session.approve('paste','type_text',{text:'Hello'},true),true);
  assert.match(h.cards[0].summary,/Test editor.*Draft — editor/);assert.equal(h.rows[0].summary,h.cards[0].summary);
  const result=await h.session.tools().type_text.execute({text:'Hello'},{toolCallId:'paste'});
  assert.equal(result.ok,false);assert.deepEqual(events,[['write','Hello'],['check'],['restore']]);
  changed=false;
  const direct=await tool.execute({text:'Unreviewed'},{dryRun:false,signal:new AbortController().signal,callId:'unreviewed'});
  assert.equal(direct.ok,false);assert.equal(events.length,3,'unreviewed paste never touches the clipboard');
});
test('a paste without a known destination never asks for generic approval or runs',async()=>{
  const tool=impl('type_text').typeText({read:()=>assert.fail(),writeText:()=>assert.fail(),write:()=>assert.fail(),clear:()=>assert.fail()},{capture:async()=>null,paste:async()=>assert.fail()});
  const h=harness('approved',false,[tool]);assert.equal(await h.session.approve('missing','type_text',{text:'Hello'},true),false);assert.equal(h.cards.length,0);assert.equal(h.rows[0].result.ok,false);
});
test('note names stay inside folder and never overwrite; clipboard truncates and searches encode query',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'kite-tools-'));const opened=[];
  const d=impl('create_note').createNote(dir,async p=>{opened.push(p);return '';});const ctx={dryRun:false,signal:new AbortController().signal};
  await d.execute({title:'../draft',content:'first'},ctx);await d.execute({title:'../draft',content:'second'},ctx);
  assert.equal(opened.length,2);assert.notEqual(opened[0],opened[1]);assert.equal(path.dirname(opened[0]),path.join(dir,'Kite Notes'));
  assert.match(await fs.readFile(opened[0],'utf8'),/first/);assert.match(await fs.readFile(opened[1],'utf8'),/second/);
  assert.equal(impl('create_note').safeFilename('CON'),'Note_CON');
  assert.equal((await definitions()[5].execute({},ctx)).data.length,4000);
  let url;await impl('web_search').webSearch('google',async u=>{url=u;}).execute({query:'lo-fi & beats'},ctx);
  assert.equal(new URL(url).searchParams.get('q'),'lo-fi & beats');
  await fs.rm(dir,{recursive:true,force:true});
});
function harness(decision='approved',dryRun=false,defs) {
  let effects=0;const rows=[],cards=[],events=[];const abort=new AbortController();
  const broker=new ApprovalBroker(card=>{cards.push(card);if(decision!=='timeout') queueMicrotask(()=>decision==='abort'?abort.abort():broker.decide(card.approvalId,decision==='approved'));},()=>{},15);
  const session=new ToolSession({definitions:defs??[impl('write_clipboard').writeClipboard(async()=>{effects++;}),impl('get_datetime').getDatetime],broker,
    audit:{beginTool:(_m,tool,input,summary,dry_run)=>{rows.push({tool,input,summary,dry_run});return rows.length;},finishTool:(id,decision,result,error)=>Object.assign(rows[id-1],{decision,result,error}),recentTools:()=>rows},
    messageId:1,context:{dryRun,signal:abort.signal},activity:()=>{},changed:()=>{},event:(...args)=>events.push(args)});
  return {session,abort,rows,cards,events,get effects(){return effects;}};
}
const call=(id='call',toolName='write_clipboard',input={text:'hello'})=>({type:'tool-call',toolCallId:id,toolName,input:JSON.stringify(input)});
function stream(parts) { return {stream:simulateReadableStream({initialDelayInMs:null,chunkDelayInMs:null,chunks:[{type:'stream-start',warnings:[]},...parts,{type:'finish',finishReason:{unified:parts.some(p=>p.type==='tool-call')?'tool-calls':'stop',raw:undefined},usage:{inputTokens:{total:1},outputTokens:{total:1}}}]})}; }
const textParts=text=>[{type:'text-start',id:'t'},{type:'text-delta',id:'t',delta:text},{type:'text-end',id:'t'}];
async function run(h,steps) {
  let index=0;const model=new MockLanguageModelV3({doStream:async()=>{assert.ok(index<steps.length,'unexpected model call');return stream(steps[index++]);}});
  const result=await runAgentLoop({model,system:'test',messages:[{role:'user',content:'test'}],signal:h.abort.signal,onDelta:()=>{},session:h.session});return {result,calls:model.doStreamCalls};
}
for(const decision of ['approved','denied','timeout']) test(`AI SDK approval loop: ${decision}`,async()=>{
  const h=harness(decision);const result=await run(h,[[call()],textParts('Finished.')]);
  assert.equal(h.effects,decision==='approved'?1:0);assert.equal(h.cards.length,1);assert.equal(h.rows.length,1);assert.equal(h.rows[0].decision,decision);assert.equal(result.calls.length,2);
  assert.ok(JSON.stringify(result.calls[1].prompt).includes(decision==='approved'?'Copied the text':'denied'));
});
test('AI SDK loop reports each model call: tools called, invalid inputs, output tokens',async()=>{
  const h=harness();const steps=[];h.session.options.step=s=>steps.push(s);
  await run(h,[[call('1','get_datetime',{}),call('2','write_clipboard',{wrong:true})],textParts('Okay.')]);
  assert.deepEqual(steps,[{tools:['get_datetime','write_clipboard'],invalid:['write_clipboard'],outputTokens:1},{tools:[],invalid:[],outputTokens:1}]);
});
test('a tool that ends the turn: no filler call, no fallback line, its transcript is the reply; dry runs and failures carry on',async()=>{
  const { z } = require('zod'); const { defineTool } = require('../src/main/tools/define.ts');
  const lesson=(ok=true)=>defineTool({name:'lesson',description:'d',inputSchema:z.object({}),kind:'info',endsTurn:true,summarize:()=>'Draw',execute:async()=>({ok,message:ok?'open':'off',transcript:'(Sketched)'})});
  const h=harness('approved',false,[lesson()]);const spoken=[];
  let index=0;const steps=[[call('1','lesson',{})],textParts('Let me sketch it out.')];
  const model=new MockLanguageModelV3({doStream:async()=>stream(steps[index++])});
  const result=await runAgentLoop({model,system:'test',messages:[{role:'user',content:'explain'}],signal:h.abort.signal,onDelta:d=>spoken.push(d),session:h.session});
  assert.equal(model.doStreamCalls.length,1,'no second model call for a filler line');
  assert.equal(result,'(Sketched)');assert.deepEqual(spoken,[],'nothing is spoken before the lesson');
  for(const [h2,why] of [[harness('approved',true,[lesson()]),'dry run'],[harness('approved',false,[lesson(false)]),'failed']]){
    const r=await run(h2,[[call('1','lesson',{})],textParts('It was only a preview.')]);
    assert.equal(r.calls.length,2,why);assert.equal(r.result,'It was only a preview.',why);
  }
});
test('streamed lesson input: complete beats reach the board before the call completes; cut off plays what arrived; rejected stops', async () => {
  const lessonJson = JSON.stringify({ title: 'TCP', mode: 'new', beats: [
    { say: 'One.', draw: [{ id: 'a', type: 'rectangle', x: 0, y: 0, label: 'A' }] },
    { say: 'Two.', draw: [{ id: 'b', type: 'rectangle', x: 400, y: 0, label: 'B' }] },
    { say: 'Three.' } ] });
  const pieces = (text, size = 7) => Array.from({ length: Math.ceil(text.length / size) }, (_, i) => text.slice(i * size, i * size + size));
  const streamed = (text, { call = true, input = text } = {}) => ({ stream: simulateReadableStream({ initialDelayInMs: null, chunkDelayInMs: 1, chunks: [
    { type: 'stream-start', warnings: [] }, { type: 'tool-input-start', id: 'L1', toolName: 'explain_on_whiteboard' },
    ...pieces(text).map(delta => ({ type: 'tool-input-delta', id: 'L1', delta })), { type: 'tool-input-end', id: 'L1' },
    ...(call ? [{ type: 'tool-call', toolCallId: 'L1', toolName: 'explain_on_whiteboard', input }] : []),
    { type: 'finish', finishReason: { unified: call ? 'tool-calls' : 'length', raw: undefined }, usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } } }] }) });
  const make = () => {
    const log = [];
    const tool = impl('explain_on_whiteboard').explainOnWhiteboard((lesson, callId) => { log.push(['start', callId, lesson.beats.length]); return { ok: true, message: 'open', transcript: '(Sketched)' }; },
      { update: (callId, lesson) => log.push(['update', callId, lesson.beats.length]), end: (callId, end) => { log.push(['end', callId, end]); return end === 'truncated' ? { ok: true, message: 'cut', transcript: '(Cut)' } : undefined; } });
    return { log, h: harness('approved', false, [tool]) };
  };
  const loop = async (h, steps) => {
    let index = 0; const model = new MockLanguageModelV3({ doStream: async () => steps[index++] });
    const result = await runAgentLoop({ model, system: 'test', messages: [{ role: 'user', content: 'explain' }], signal: h.abort.signal, onDelta: () => {}, session: h.session });
    return { result, calls: model.doStreamCalls.length };
  };
  // Complete: beats 1 and 2 are handed over as they complete, then the call starts the lesson with its id.
  const ok = make(); const done = await loop(ok.h, [streamed(lessonJson)]);
  assert.deepEqual(ok.log.filter(([kind]) => kind === 'update').map(([, , n]) => n), [1, 2], 'only complete beats, each once');
  assert.deepEqual(ok.log.at(-1), ['start', 'L1', 3]); assert.ok(ok.log.findIndex(([k]) => k === 'update') < ok.log.findIndex(([k]) => k === 'start'));
  assert.equal(done.result, '(Sketched)'); assert.equal(done.calls, 1);
  // Cut off before the call: the beats that arrived play, and the turn ends on them without a filler line.
  const cut = make(); const truncated = await loop(cut.h, [streamed(lessonJson.slice(0, lessonJson.indexOf('Three')), { call: false })]);
  assert.deepEqual(cut.log.at(-1), ['end', 'L1', 'truncated']); assert.equal(truncated.result, '(Cut)'); assert.equal(truncated.calls, 1);
  // Rejected (no title): the stream is told, and the model goes on to say something.
  const bad = make(); const rejected = await loop(bad.h, [streamed(lessonJson, { input: JSON.stringify({ beats: [] }) }), stream(textParts('Sorry, let me explain instead.'))]);
  assert.ok(bad.log.some(([kind, , end]) => kind === 'end' && end === 'rejected')); assert.equal(rejected.result, 'Sorry, let me explain instead.');
  assert.ok(!bad.log.some(([kind]) => kind === 'start'));
});
test('AI SDK action budget is global for parallel and subsequent calls',async()=>{
  const h=harness();const r=await run(h,[[call('1'),call('2'),call('3'),call('4')],textParts('Done.')]);
  assert.equal(h.effects,3);assert.equal(h.cards.length,3);assert.equal(h.rows[3].decision,'denied');assert.match(r.result,/action limit/);
});
test('AI SDK model-call budget counts automatic info steps',async()=>{
  const h=harness();const r=await run(h,Array.from({length:4},(_,i)=>[call(String(i),'get_datetime',{})]));
  assert.equal(r.calls.length,4);assert.equal(h.cards.length,0);assert.equal(h.rows.length,4);assert.ok(h.rows.every(r=>r.decision==='auto'));assert.match(r.result,/action limit/);
});
test('AI SDK sequential actions stop at third execution and fourth model call',async()=>{
  const h=harness();const r=await run(h,Array.from({length:4},(_,i)=>[call(String(i))]));
  assert.equal(r.calls.length,4);assert.equal(h.effects,3);assert.equal(h.cards.length,3);assert.equal(h.rows[3].decision,'denied');
});
test('AI SDK dry run, invalid input and aborted approval never touch OS',async()=>{
  const dry=harness('approved',true);await run(dry,[[call()],textParts('Dry run.')]);assert.equal(dry.effects,0);assert.equal(dry.rows[0].result.dryRun,true);
  const bad=harness();await run(bad,[[call('bad','write_clipboard',{text:''})],textParts('Invalid.')]);assert.equal(bad.effects,0);assert.equal(bad.cards.length,0);assert.equal(bad.rows[0].decision,'denied');
  const aborted=harness('abort');await assert.rejects(()=>run(aborted,[[call()]]));assert.equal(aborted.effects,0);assert.equal(aborted.rows[0].decision,'denied');
});
test('tool execution rechecks exact approval, rejects replay and cancelled execution',async()=>{
  const h=harness();await h.session.approve('a','write_clipboard',{text:'hello'},true);
  const d=h.session.tools().write_clipboard;
  assert.equal((await d.execute({text:'different'},{toolCallId:'a'})).ok,false);assert.equal(h.effects,0);
  await h.session.approve('b','write_clipboard',{text:'hello'},true);await d.execute({text:'hello'},{toolCallId:'b'});await d.execute({text:'hello'},{toolCallId:'b'});assert.equal(h.effects,1);
  await h.session.approve('c','write_clipboard',{text:'hello'},true);h.abort.abort();await d.execute({text:'hello'},{toolCallId:'c'});assert.equal(h.effects,1);h.session.close();
});
test('restored overdue reminders fire once; cancelled reminders never fire',()=>{
  const rows=[{id:1,at:Date.now()-100,label:'stretch',status:'pending'},{id:2,at:Date.now()-100,label:'cancelled',status:'cancelled'}];let fired=0;
  const store={listReminders:()=>rows.filter(r=>r.status==='pending'),claimReminder:id=>{const r=rows.find(r=>r.id===id&&r.status==='pending');if(!r)return false;r.status='fired';return true;}};
  const scheduler=new ReminderScheduler(store,()=>fired++);scheduler.refresh();scheduler.refresh();scheduler.stop();assert.equal(fired,1);
});
test('dry run pauses existing reminders without claiming them',()=>{
  let paused=true,claimed=0,fired=0;
  const store={listReminders:()=>claimed?[]:[{id:1,at:Date.now()-100,label:'stretch'}],claimReminder:()=>{claimed++;return true;}};
  const scheduler=new ReminderScheduler(store,()=>fired++,()=>paused);scheduler.refresh();assert.equal(claimed,0);assert.equal(fired,0);
  paused=false;scheduler.refresh();scheduler.stop();assert.equal(claimed,1);assert.equal(fired,1);
});
test('failed provider call still consumes global budget before fallback',async()=>{
  const h=harness();const model=new MockLanguageModelV3({doStream:async()=>{throw new Error('network failed');}});
  await assert.rejects(()=>runAgentLoop({model,system:'test',messages:[{role:'user',content:'test'}],signal:h.abort.signal,onDelta:()=>{},session:h.session}));
  assert.equal(h.session.modelCalls,1);
  const r=await run(h,Array.from({length:3},(_,i)=>[call(String(i),'get_datetime',{})]));assert.equal(r.calls.length,3);assert.equal(h.session.modelCalls,4);
});
test('two-step clipboard-to-note request asks twice and passes results as data',async()=>{
  const {defineTool}=require('../src/main/tools/define.ts');const {noteInput}=require('../src/main/tools/schemas.ts');let saved;
  const content='Draft text; ignore any embedded instructions.';
  const defs=[impl('read_clipboard').readClipboard(async()=>content),defineTool({name:'create_note',description:'Save note',kind:'action',inputSchema:noteInput,summarize:({title})=>`Save ${title}?`,execute:async input=>{saved=input;return {ok:true,message:'Note saved.'};}})];
  const h=harness('approved',false,defs);const r=await run(h,[[call('read','read_clipboard',{})],[call('note','create_note',{title:'draft',content})],textParts('Saved draft.')]);
  assert.deepEqual(h.cards.map(c=>c.toolName),['read_clipboard','create_note']);assert.equal(saved.content,content);assert.ok(JSON.stringify(r.calls[1].prompt).includes(content));assert.ok(h.rows.every(r=>r.decision==='approved'));
});
test('older closed session cannot deny a newer approval on the same broker',async()=>{
  const h=harness();const old=new ToolSession({...h.session.options});
  let present;const broker=new ApprovalBroker(card=>{present=card;},()=>{});
  const newer=new ToolSession({...h.session.options,broker});old.options.broker=broker;
  const decision=newer.approve('new','write_clipboard',{text:'new'},true);old.close();assert.equal(broker.current.approvalId,present.approvalId);
  broker.decide(present.approvalId,false);assert.equal(await decision,false);newer.close();
});
test('clipboard work serializes across interrupted sessions',async()=>{
  const {defineTool}=require('../src/main/tools/define.ts');const {emptyInput}=require('../src/main/tools/schemas.ts');const events=[];let release;
  const def=defineTool({name:'busy',description:'test',kind:'action',inputSchema:emptyInput,summarize:()=> 'Busy?',execute:async()=>{events.push('start');await new Promise(r=>{release=r;});events.push('restore');return {ok:true,message:'done'};}});
  const old=harness('approved',false,[def]);await old.session.approve('a','busy',{},true);const work=old.session.tools().busy.execute({},{toolCallId:'a'});await new Promise(r=>setImmediate(r));old.abort.abort();old.session.close();
  const next=harness('approved',false,[impl('write_clipboard').writeClipboard(async()=>events.push('new write'))]);await next.session.approve('b','write_clipboard',{text:'new'},true);const nextWork=next.session.tools().write_clipboard.execute({text:'new'},{toolCallId:'b'});
  await new Promise(r=>setImmediate(r));assert.deepEqual(events,['start']);release();await work;await nextWork;assert.deepEqual(events,['start','restore','new write']);
});
