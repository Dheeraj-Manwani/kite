const { test } = require('node:test');
const assert = require('node:assert/strict');
const { initialPtt, stepPtt } = require('../src/main/input/pttMachine.ts');
const { Conversation } = require('../src/main/ai/conversation.ts');
const { createSecrets } = require('../src/main/settings/secretsCore.ts');
const { VoiceController } = require('../src/main/voice/controller.ts');

function gesture(events) {
  let state = initialPtt(); const actions = [];
  for (const [key, down, now] of events) {
    const result = stepPtt(state, { key, down, now }, ['Control', 'Meta']);
    state = result.state; if (result.action) actions.push(result.action);
  }
  return { state, actions };
}
for (const release of ['Control', 'Meta']) {
  test('PTT stops on either modifier release: ' + release, () => {
    assert.deepEqual(gesture([['Control',true,0],['Meta',true,100],[release,false,400]]).actions, ['start','stop']);
  });
}
test('PTT too-short, key repeats, extra-key cancellation, and re-arm', () => {
  assert.deepEqual(gesture([['Meta',true,0],['Control',true,1],['Control',true,50],['Meta',false,100]]).actions, ['start','tooShort']);
  const result = gesture([['Control',true,0],['Meta',true,1],['D',true,200],['D',false,210],
    ['Control',false,300],['Control',true,310],['Control',false,320],['Meta',false,330],
    ['Meta',true,400],['Control',true,410],['Meta',false,800]]);
  assert.deepEqual(result.actions, ['start','cancel','start','stop']);
});
test('PTT does not arm when an unrelated key was already held', () => {
  assert.deepEqual(gesture([['A',true,0],['Control',true,10],['Meta',true,20]]).actions, []);
});
test('conversation trims, copies context, and resets at five minutes', () => {
  let count = 0; const session = new Conversation(() => String(++count));
  assert.deepEqual(session.begin(100), { id:'1',fresh:true });
  for (let i = 0; i < 15; i++) session.add({ role:i%2?'assistant':'user',content:String(i) }, 100+i);
  assert.deepEqual(session.context().map(x=>x.content), Array.from({length:10},(_,i)=>String(i+5)));
  const copy = session.context(); copy[0].content = 'mutated';
  assert.equal(session.context()[0].content, '5');
  assert.equal(session.begin(200).fresh, false);
  assert.deepEqual(session.begin(300200), { id:'2',fresh:true });
  assert.equal(session.context().length, 0);
});
test('secrets encrypted round-trip, hasKey, delete and no plaintext fallback', () => {
  const saved = new Map();
  let available = true;
  const cipher = {
    isEncryptionAvailable: () => available,
    encryptString: text => Buffer.from([...Buffer.from(text)].map(x=>x^0xa7)),
    decryptString: bytes => Buffer.from([...bytes].map(x=>x^0xa7)).toString(),
  };
  const secrets = createSecrets(cipher, { read:key=>saved.get(key), write:(key,value)=>saved.set(key,value), remove:key=>saved.delete(key) });
  assert.equal(secrets.hasKey('groq'),false);
  assert.equal(secrets.getKey('groq'),undefined);
  secrets.setKey('groq','test-secret-value');
  assert.equal(secrets.getKey('groq'),'test-secret-value');
  assert.ok(!saved.get('groq').includes('test-secret-value'));
  assert.equal(secrets.hasKey('groq'),true);
  available = false;
  assert.throws(()=>secrets.setKey('moonshot','secret'), /encryption/);
  assert.equal(saved.has('moonshot'),false);
  assert.throws(()=>secrets.getKey('groq'), /encryption/);
  secrets.deleteKey('groq'); assert.equal(secrets.hasKey('groq'),false);
});
function fixture(overrides={}) {
  const events=[], messages=[], escape=[];
  const deps = {
    emit:event=>events.push(event),
    getKey:()=> 'mock-key',
    transcribe:async()=> 'Hello',
    ask:async(_messages,_key,_signal,onDelta)=> { onDelta('Hi'); return 'Hi'; },
    history:{ createConversation:()=>{},addMessage:(...args)=>messages.push(args) },
    conversation:new Conversation(()=> 'conversation'),
    setEscape:active=>escape.push(active),
    ...overrides,
  };
  return { controller:new VoiceController(deps),events,messages,escape };
}

for (const [utterance,expected] of [['yes','approved'],['no','denied'],['no, open Firefox instead','new-request']]) {
  test('voice approval resumes or replaces pending interaction: '+utterance,async()=>{
    const {ApprovalBroker}=require('../src/main/tools/approval.ts');
    let controller,asks=0,parentSignal,decision;const transcripts=['Open Spotify',utterance];
    const broker=new ApprovalBroker(card=>controller.presentApproval(card),(card,d)=>controller.approvalDecision(card,d));
    const f=fixture({approvals:broker,transcribe:async()=>transcripts.shift(),ask:async(_m,_k,signal,delta)=>{
      asks++;if(asks===1){parentSignal=signal;delta('I can open it.');decision=await broker.request('open_app','Open "Spotify"?',{name:'Spotify'},false,signal);signal.throwIfAborted();delta(' Finished.');return 'I can open it. Finished.';}
      delta('New request.');return 'New request.';
    }});controller=f.controller;
    const first=controller.start();controller.stop();const pending=controller.submit(first,new ArrayBuffer(8));await new Promise(r=>setImmediate(r));
    assert.ok(broker.current);const second=controller.start();assert.equal(parentSignal.aborted,false,'PTT preserves pending approval for voice classification');controller.stop();
    await controller.submit(second,new ArrayBuffer(8));await pending;
    assert.equal(decision,expected==='approved'?'approved':'denied');assert.equal(asks,expected==='new-request'?2:1);
    assert.equal(broker.current,undefined);assert.equal(f.escape.at(-1),false);
    if(expected==='new-request'){assert.equal(parentSignal.aborted,true);assert.ok(f.messages.some(m=>m[1]==='assistant'&&m[5]===true));}
    else assert.ok(f.events.some(e=>e.type==='approval:resume'&&e.id===first));
    await controller.shutdown();
  });
}
test('Escape during voice confirmation denies parent and cancels recording',async()=>{
  const {ApprovalBroker}=require('../src/main/tools/approval.ts');let controller,decision;
  const broker=new ApprovalBroker(card=>controller.presentApproval(card),(card,d)=>controller.approvalDecision(card,d));
  const f=fixture({approvals:broker,ask:async(_m,_k,signal)=>{decision=await broker.request('read_clipboard','Let me read your clipboard?',{},false,signal);signal.throwIfAborted();return '';}});controller=f.controller;
  const id=controller.start();controller.stop();const pending=controller.submit(id,new ArrayBuffer(8));await new Promise(r=>setImmediate(r));
  controller.start();controller.cancel('voice:aborted');await pending;assert.equal(decision,'denied');assert.equal(broker.current,undefined);assert.equal(f.escape.at(-1),false);await controller.shutdown();
});
test('interaction persists transcript before reply and releases Escape on completion', async () => {
  const f=fixture(), id=f.controller.start(); f.controller.stop();
  await f.controller.submit(id,new ArrayBuffer(8));
  assert.deepEqual(f.messages.map(x=>x[1]),['user','assistant']);
  assert.deepEqual(f.events.map(x=>x.type),['ptt:start','ptt:stop','voice:thinking','voice:transcript','llm:delta','llm:done']);
  assert.deepEqual(f.escape,[true,false]);
  assert.ok(f.events.at(-1).timing.totalMs>=0);
});
test('tap/silence and empty transcript never invoke the LLM', async () => {
  let calls=0;
  const f=fixture({transcribe:async()=>{calls++;return '   ';},ask:async()=>{throw Error('must not call');}});
  f.controller.start(); f.controller.cancel('ptt:tooShort'); assert.equal(calls,0);
  const silent=f.controller.start(); f.controller.stop(); f.controller.audioResult(silent,'empty'); assert.equal(calls,0);
  const id=f.controller.start(); f.controller.stop(); await f.controller.submit(id,new ArrayBuffer(8));
  assert.equal(calls,1); assert.equal(f.events.at(-1).type,'voice:empty'); assert.equal(f.messages.length,0);
});
test('new hold aborts old stream; late deltas and completion cannot affect new interaction', async () => {
  let resolveOld, delta, signal;
  const f=fixture({ask:(_messages,_key,s,onDelta)=>{signal=s;delta=onDelta;return new Promise(resolve=>{resolveOld=resolve;});}});
  const old=f.controller.start();f.controller.stop();
  const pending=f.controller.submit(old,new ArrayBuffer(8));
  await new Promise(resolve=>setImmediate(resolve));
  const newer=f.controller.start();
  assert.equal(signal.aborted,true);
  delta('stale'); resolveOld('stale'); await pending;
  assert.equal(f.events.filter(e=>e.type==='llm:delta').length,0);
  assert.equal(f.events.at(-1).id,newer);
  assert.equal(f.escape.at(-1),true,'old finally must not release new Escape');
  await f.controller.submit(old,new ArrayBuffer(8));
  f.controller.cancel('voice:aborted');
  assert.equal(f.escape.at(-1),false);
});
test('missing key and provider 429 are friendly, sanitized failures', async () => {
  const missing=fixture({getKey:()=>undefined});
  const id=missing.controller.start();missing.controller.stop(); await missing.controller.submit(id,new ArrayBuffer(8));
  assert.match(missing.events.at(-1).text,/Groq key/);
  assert.equal(missing.events.at(-1).settings,true);
  const failed=fixture({transcribe:async()=>{throw {statusCode:429,headers:{authorization:'SECRET'}};}});
  const next=failed.controller.start();failed.controller.stop(); await failed.controller.submit(next,new ArrayBuffer(8));
  assert.match(failed.events.at(-1).text,/rate-limited/);
  assert.ok(!JSON.stringify(failed.events).includes('SECRET'));
  assert.equal(failed.escape.at(-1),false);
});

test('installed AI SDK sends WebM to Groq and streams Kimi instant-mode text', async () => {
  const { transcribeAudio } = require('../src/main/ai/transcribe.ts');
  const { ask } = require('../src/main/ai/ask.ts');
  const original = global.fetch;
  const requests = [];
  let emptyTranscript = false;
  global.fetch = async (url, options) => {
    requests.push({ url:String(url), options });
    if (String(url).includes('groq.com')) return new Response(JSON.stringify({ text:emptyTranscript?'':'Hello',language:'english',duration:1,x_groq:{id:'test'} }), { headers:{'content-type':'application/json'} });
    const chunks = [
      {id:'test',created:1,model:'kimi-k2.6',choices:[{index:0,delta:{role:'assistant',content:'Hi there.'},finish_reason:null}]},
      {id:'test',created:1,model:'kimi-k2.6',choices:[{index:0,delta:{},finish_reason:'stop'}]},
    ];
    return new Response(chunks.map(chunk=>'data: '+JSON.stringify(chunk)+'\n\n').join('')+'data: [DONE]\n\n', {headers:{'content-type':'text/event-stream'}});
  };
  try {
    const bytes = new Uint8Array([0x1a,0x45,0xdf,0xa3,0,0,0,0]);
    assert.equal(await transcribeAudio(bytes,'mock-groq',new AbortController().signal),'Hello');
    assert.equal(requests[0].options.body.get('model'),'whisper-large-v3-turbo');
    assert.match(requests[0].options.body.get('file').name,/\.webm$/);
    const deltas=[];
    assert.equal(await ask([{role:'user',content:'Hello'}],'mock-moonshot',new AbortController().signal,delta=>deltas.push(delta)),'Hi there.');
    const body=JSON.parse(requests[1].options.body);
    assert.equal(body.model,'kimi-k2.6');
    assert.equal(body.temperature,undefined);
    assert.equal(body.thinking.type,'disabled');
    assert.equal(body.stream,true);
    assert.deepEqual(deltas,['Hi there.']);
    emptyTranscript=true;
    assert.equal(await transcribeAudio(bytes,'mock-groq',new AbortController().signal),'');
  } finally { global.fetch=original; }
});

const { approvalAction } = require('../src/renderer/voice/approvalAction.ts');
test('approval buttons name the action they approve', () => {
  assert.equal(approvalAction({ toolName: 'open_app', summary: 'Open "Spotify"?' }), 'Open Spotify');
  assert.equal(approvalAction({ toolName: 'open_app', summary: 'Open "Microsoft Visual Studio Code Insiders"?' }), 'Open app', 'long names fall back');
  assert.equal(approvalAction({ toolName: 'open_app', summary: 'Find matching apps for "note"? No app will open until a match is chosen.' }), 'Find apps');
  assert.equal(approvalAction({ toolName: 'open_url', summary: 'Open github.com?' }), 'Open github.com');
  assert.equal(approvalAction({ toolName: 'type_text', summary: 'Paste "hi" into the currently focused app?' }), 'Paste text');
  assert.equal(approvalAction({ toolName: 'show_me_how', summary: 'Guide you through "x" in Word?' }), 'Start guide');
  assert.equal(approvalAction({ toolName: 'something_new', summary: 'Do a new thing?' }), 'Allow');
});
