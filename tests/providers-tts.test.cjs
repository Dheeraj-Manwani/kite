const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { SpeechChunker, toSpeakable } = require('../src/main/voice/speechChunker.ts');
const { getModel, MissingKeyError } = require('../src/main/ai/providers.ts');
const { withFallback, retryableBeforeToken } = require('../src/main/ai/fallback.ts');
const { buildSystemPrompt } = require('../src/main/ai/systemPrompt.ts');
const { describeModel } = require('../src/main/ai/catalog.ts');
const { VoiceController } = require('../src/main/voice/controller.ts');
const { Conversation } = require('../src/main/ai/conversation.ts');
const { wordOffsets } = require('../src/renderer/voice/reveal.ts');
const { TTSService } = require('../src/main/voice/tts.ts');
const { VoicePlayback } = require('../src/renderer/voice/playback.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));
const settings = { model: { provider:'moonshot',id:'kimi-k2.6' }, fallbackEnabled:true, fallback:{provider:'groq',id:'openai/gpt-oss-20b'},ttsEnabled:true,voiceId:'voice',speed:1 };

test('chunker sentence, minimum clause length, force flush, final flush', () => {
  const chunks=[]; const c=new SpeechChunker(t=>chunks.push(t.trim()));
  c.push('Hello, '); assert.equal(chunks.length,0);
  c.push('this is a longer phrase that deserves a pause, '); assert.equal(chunks.length,1);
  c.push('Short sentence. '); assert.equal(chunks.at(-1),'Short sentence.');
  c.push('x'.repeat(120)); assert.equal(chunks.at(-1),'x'.repeat(120));
  c.push('last fragment'); c.finish(); assert.equal(chunks.at(-1),'last fragment');
  c.finish(); assert.equal(chunks.length,4);
});
test('toSpeakable removes markdown, code, details, URLs and expands symbols', () => {
  assert.equal(toSpeakable('## **Hello** & `friend`\n```js\nsecret()\n```\nSee https://example.com/a.'),'Hello and friend See a link');
  assert.equal(toSpeakable('Here. <details>1. first\n2. second</details> Done.'),'Here. Done.');
  assert.equal(toSpeakable('[docs](https://example.com) & 10%'), 'docs (a link) and 10 percent');
});
test('chunker never speaks fenced code or details split across arbitrary token boundaries', () => {
  const text="Here's the snippet. ```js\nconsole.log('secret');\n``` More. <details>long private list.</details> Bye.";
  for (const width of [1,2,3,7,17]) {
    const spoken=[];const c=new SpeechChunker(t=>spoken.push(t));
    for(let i=0;i<text.length;i+=width)c.push(text.slice(i,i+width));c.finish();
    assert.equal(spoken.join('').trim(),"Here's the snippet. More. Bye.");
  }
});
test('six provider adapters are fresh per call and missing keys are typed', () => {
  const expected={openai:'openai',anthropic:'anthropic',google:'google',groq:'groq',moonshot:'moonshot',deepseek:'deepseek'};
  for(const [provider,prefix] of Object.entries(expected)) {
    const secrets={getKey:p=>{assert.equal(p,provider);return 'test-key';}};
    const a=getModel(provider,'custom-id',secrets),b=getModel(provider,'custom-id',secrets);
    assert.equal(a.modelId,'custom-id');assert.ok(a.provider.startsWith(prefix));assert.notEqual(a,b);
    assert.throws(()=>getModel(provider,'x',{getKey:()=>undefined}),MissingKeyError);
  }
});
test('provider traits: every provider is described, and only Moonshot refuses a required tool choice', () => {
  const { providerTraits, providerIds } = require('../src/main/ai/catalog.ts');
  assert.deepEqual(Object.keys(providerTraits).sort(), [...providerIds].sort());
  assert.deepEqual(providerIds.filter(p => !providerTraits[p].requiredToolChoice), ['moonshot']);
  assert.deepEqual(providerIds.filter(p => providerTraits[p].imageToolResults).sort(), ['anthropic', 'google', 'openai']);
});
test('DeepSeek requests go to api.deepseek.com with thinking off, for any model id, and take images as user content', async () => {
  const { generateText } = require('ai');
  const original = global.fetch; const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url: String(url), body: JSON.parse(options.body), auth: new Headers(options.headers).get('authorization') });
    return new Response(JSON.stringify({ id: 't', created: 1, model: 'deepseek-flash', choices: [{ index: 0, message: { role: 'assistant', content: 'Red' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { headers: { 'content-type': 'application/json' } });
  };
  try {
    for (const id of ['deepseek-flash', 'deepseek-v4-pro', 'deepseek-someday']) {
      await generateText({ model: getModel('deepseek', id, { getKey: () => 'mock-secret' }), maxRetries: 0,
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Colour?' }, { type: 'image', image: new Uint8Array([137, 80, 78, 71]), mediaType: 'image/png' }] }] });
    }
    assert.deepEqual(requests.map(r => r.url), Array(3).fill('https://api.deepseek.com/chat/completions'));
    assert.deepEqual(requests.map(r => r.body.model), ['deepseek-flash', 'deepseek-v4-pro', 'deepseek-someday']);
    assert.ok(requests.every(r => r.body.thinking.type === 'disabled' && r.auth === 'Bearer mock-secret'));
    assert.match(requests[0].body.messages[0].content[1].image_url.url, /^data:image\/png;base64,/);
  } finally { global.fetch = original; }
});
test('fallback only for network, 5xx and 429 before a token; never abort or auth', async () => {
  for(const error of [{statusCode:429},{statusCode:503},new TypeError('fetch failed'),{cause:{code:'ECONNRESET'}}]) assert.equal(retryableBeforeToken(error),true);
  for(const error of [{statusCode:401},{statusCode:403},{statusCode:402},{statusCode:400},new Error('bug'),{name:'AbortError',cause:{code:'ECONNRESET'}}]) assert.equal(retryableBeforeToken(error),false);
  for (const hasToken of [false,true]) {
    let calls=0;const signal=new AbortController().signal;
    const promise=withFallback(async()=>{throw {statusCode:429};},async()=>{calls++;return 'ok';},()=>hasToken,true,signal,()=>{});
    if(hasToken) await assert.rejects(promise);else assert.equal(await promise,'ok');assert.equal(calls,hasToken?0:1);
  }
  let calls=0; await assert.rejects(withFallback(async()=>{throw {statusCode:500};},async()=>{calls++;throw {statusCode:500};},()=>false,true,new AbortController().signal,()=>{})); assert.equal(calls,1);
});
test('identity reflects active provider/model and separates spoken details',()=>{
  for(const model of [{provider:'moonshot',id:'kimi-k2.6'},{provider:'anthropic',id:'claude-sonnet-5'}]) {
    const described=describeModel(model),prompt=buildSystemPrompt(described);
    assert.ok(prompt.includes(`I'm Kite, running on ${described.label}.`));assert.match(prompt,/Never claim to be a different assistant/);assert.match(prompt,/<details>/);
  }
});
function fixture(overrides={}) {
  const events=[], rows=[], updates=[], escape=[], speech=[];
  const deps={emit:e=>events.push(e),getKey:()=> 'test',settings:()=>settings,
    transcribe:async()=> 'Which model are you?',ask:async(_m,_k,_s,delta)=>{delta('Hi. ');return 'Hi. ';},
    history:{createConversation:()=>{},addMessage:(...args)=>{rows.push(args);return rows.length;},updateMessage:(...args)=>updates.push(args),voiceAverage:()=>900},
    conversation:new Conversation(()=> 'session'),setEscape:x=>escape.push(x),
    tts:{start:id=>speech.push(['start',id]),push:(id,text)=>speech.push(['push',id,text]),finish:id=>speech.push(['finish',id]),cancel:()=>speech.push(['cancel'])},...overrides};
  return {c:new VoiceController(deps),events,rows,updates,escape,speech};
}
test('first LLM delta goes to TTS before stream completion; Escape lives until playback ends',async()=>{
  let finish;const f=fixture({ask:async(_m,_k,_s,delta)=>{delta('Hi. ');await new Promise(r=>finish=r);return 'Hi. ';}});
  const id=f.c.start();f.c.stop();const pending=f.c.submit(id,new ArrayBuffer(8));await tick();
  assert.ok(f.speech.some(x=>x[0]==='push'));assert.ok(!f.events.some(e=>e.type==='llm:done'));
  finish();await pending;assert.equal(f.escape.at(-1),true);
  f.c.ttsEvent({type:'tts:chunk',id,audio:new ArrayBuffer(8)});f.c.playback(id,'started');
  f.c.ttsEvent({type:'tts:done',id});assert.equal(f.escape.at(-1),true);
  f.c.playback(id,'ended');assert.equal(f.escape.at(-1),false);assert.ok(f.updates.at(-1)[1].voiceToVoiceMs>=0);
});
test('interruption saves partial response and actual model, cancels audio and ignores stale deltas',async()=>{
  let finish,late;const f=fixture({ask:async(_m,_k,_s,delta)=>{late=delta;delta('Partial');await new Promise(r=>finish=r);return 'Partial';}});
  const old=f.c.start();f.c.stop();const pending=f.c.submit(old,new ArrayBuffer(8));await tick();
  const next=f.c.start();late(' stale');finish();await pending;
  assert.equal(f.rows[1][2],'Partial');assert.equal(f.rows[1][5],true);assert.equal(f.rows[1][4].provider,'moonshot');
  assert.equal(f.events.at(-1).id,next);assert.equal(f.escape.at(-1),true);f.c.cancel();
});
test('fallback uses its own identity and persists its provider',async()=>{
  const seen=[];const f=fixture({settings:()=>({...settings,ttsEnabled:false}),ask:async(_m,_k,_s,delta,model)=>{
    seen.push(model);if(model.provider==='moonshot')throw {statusCode:503};delta('I am Kite.');return 'I am Kite.';
  }});
  const id=f.c.start();f.c.stop();await f.c.submit(id,new ArrayBuffer(8));
  assert.deepEqual(seen.map(x=>x.provider),['moonshot','groq']);assert.equal(f.rows[1][4].provider,'groq');assert.ok(f.events.some(x=>x.type==='model:fallback'));
});
test('mute during pending first token prevents later speech',async()=>{
  let current={...settings},release;const f=fixture({settings:()=>current,ask:async(_m,_k,_s,delta)=>{await new Promise(r=>release=r);delta('Hi.');return 'Hi.';}});
  const id=f.c.start();f.c.stop();const pending=f.c.submit(id,new ArrayBuffer(8));await tick();current={...current,ttsEnabled:false};f.c.mute();release();await pending;
  assert.ok(!f.speech.some(x=>x[0]==='start'));assert.equal(f.escape.at(-1),false);
});
test('spoken word mapping preserves markdown offsets and skips unspoken details',()=>{
  const raw='**Hello** <details>Hello secret</details> world.';
  const offsets=wordOffsets(raw,['Hello','world']);assert.equal(raw.slice(0,offsets[0]),'**Hello');assert.equal(raw.slice(0,offsets[1]),raw.slice(0,-1));
});
class Socket extends EventEmitter {
  readyState=0; messages=[];
  send(data,cb){this.messages.push(JSON.parse(data));cb?.();}
  terminate(){this.readyState=3;this.emit('close');}
  close(){this.terminate();}
}
test('Cartesia wire protocol streams same context, forwards PCM/timestamps, cancels and reuses one socket',async()=>{
  const sockets=[],events=[];const tts=new TTSService(()=> 'key',e=>events.push(e),()=>{const s=new Socket();sockets.push(s);setImmediate(()=>{s.readyState=1;s.emit('open');});return s;});
  try {
    tts.start(1,settings);tts.push(1,'Hello world. ');await tick();await tick();
    const socket=sockets[0],request=socket.messages[0];
    assert.equal(request.model_id,'sonic-3.5');assert.equal(request.continue,true);assert.equal(request.add_timestamps,true);assert.equal(request.output_format.encoding,'pcm_f32le');
    socket.emit('message',Buffer.from(JSON.stringify({type:'chunk',context_id:request.context_id,data:Buffer.from(new Float32Array([.2,-.2]).buffer).toString('base64')})));
    socket.emit('message',Buffer.from(JSON.stringify({type:'timestamps',context_id:request.context_id,word_timestamps:{words:['Hello'],start:[0],end:[.3]}})));
    assert.ok(events.find(e=>e.type==='tts:chunk').audio instanceof ArrayBuffer);assert.ok(events.some(e=>e.type==='tts:timestamps'));
    tts.finish(1);await tick();assert.equal(socket.messages.at(-1).continue,false);
    tts.cancel();assert.equal(socket.messages.at(-1).cancel,true);
    const count=events.length;socket.emit('message',Buffer.from(JSON.stringify({type:'done',context_id:request.context_id})));assert.equal(events.length,count);
    tts.start(2,settings);tts.push(2,'Next. ');await tick();assert.equal(sockets.length,1);assert.notEqual(socket.messages.at(-1).context_id,request.context_id);
  } finally {tts.close();}
});
test('cancel while websocket connects prevents queued speech from being sent',async()=>{
  let socket;const tts=new TTSService(()=> 'key',()=>{},()=>socket=new Socket());
  try {tts.start(1,settings);tts.push(1,'Hello. ');tts.cancel();socket.readyState=1;socket.emit('open');await tick();assert.equal(socket.messages.length,0);}finally{tts.close();}
});
test('PCM playback uses jitter buffer, contiguous scheduling, actual RMS and instant stop',async()=>{
  const original=global.AudioContext, reports=[], sources=[];let ctx;
  global.AudioContext=class {
    currentTime=0;state='running';outputLatency=0;destination={};
    constructor(options){assert.equal(options.sampleRate,44100);ctx=this;}
    createAnalyser(){return {connect(){},getFloatTimeDomainData(a){a.fill(.1);}};}
    createBuffer(_channels,length,rate){return {duration:length/rate,copyToChannel(){}};}
    createBufferSource(){const s={connect(){},disconnect(){},start(at){this.at=at;},stop(){this.stopped=true;}};sources.push(s);return s;}
    close(){return Promise.resolve();}
  };
  const player=new VoicePlayback(e=>reports.push(e));
  try {
    player.begin();player.chunk(new Float32Array(4410).buffer);player.chunk(new Float32Array(4410).buffer);await tick();
    assert.equal(sources[0].at,.1);assert.equal(sources[1].at,.2);ctx.currentTime=.11;
    assert.ok(player.sample(.1)>0);assert.equal(reports[0],'started');assert.ok(player.elapsed>=0);
    player.finish();assert.ok(!reports.includes('ended'));player.stop();assert.ok(sources.every(s=>s.stopped));assert.equal(player.level,0);
  }finally{player.dispose();global.AudioContext=original;}
});
const {listModels,listVoices,testKey,keyErrorStatus}=require('../src/main/ai/discovery.ts');

test('model discovery authenticates all six providers and follows model/voice pages',async()=>{
  const original=global.fetch,requests=[];
  global.fetch=async(url,options)=>{
    requests.push({url:String(url),headers:options.headers});
    const u=String(url);
    let data={data:[{id:'custom-chat'}]};
    if(u.includes('googleapis'))data=u.includes('pageToken')?{models:[{name:'models/second',supportedGenerationMethods:['generateContent']}]}:{models:[{name:'models/first',supportedGenerationMethods:['generateContent']},{name:'models/embedding',supportedGenerationMethods:['embedContent']}],nextPageToken:'next'};
    if(u.includes('anthropic'))data=u.includes('after_id')?{data:[{id:'second'}]}:{data:[{id:'first'}],has_more:true,last_id:'first'};
    if(u.includes('cartesia'))data=u.includes('starting_after')?{data:[{id:'v2',name:'Second'}]}:{data:[{id:'v1',name:'First'}],has_more:true,next_page:'v1'};
    return new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
  };
  try{
    for(const p of ['openai','anthropic','google','groq','moonshot','deepseek']){
      const models=await listModels(p,'mock-secret');assert.ok(models.length);assert.ok(models.every(m=>m.provider===p));
      if(p==='google')assert.deepEqual(models.map(m=>m.id),['first','second']);
    }
    assert.equal(requests.find(r=>r.url.includes('anthropic')).headers['x-api-key'],'mock-secret');
    assert.equal(requests.find(r=>r.url.includes('googleapis')).headers['x-goog-api-key'],'mock-secret');
    assert.equal(requests.find(r=>r.url.includes('openai.com')).headers.Authorization,'Bearer mock-secret');
    assert.deepEqual((await listVoices('mock-secret')).map(v=>v.id),['v1','v2']);
  }finally{global.fetch=original;}
});
test('invalid, credit/rate, model and network key errors are sanitized',async()=>{
  const original=global.fetch;
  try{
    for(const [code,status]of [[401,'invalid key'],[403,'invalid key'],[402,'no credit / rate-limited'],[429,'no credit / rate-limited'],[404,'model unavailable'],[500,'network error']]){
      global.fetch=async()=>new Response('secret in raw response',{status:code});
      const result=await testKey('cartesia','mock-secret','voice');assert.deepEqual(result,{status});
    }
    assert.equal(keyErrorStatus(new TypeError('fetch failed')),'network error');
  }finally{global.fetch=original;}
});
