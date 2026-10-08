// Specialist planner comparison and golden eval. Keys load through eval-common and are never logged.
// --formats lines,json --providers deepseek:deepseek-flash,groq:openai/gpt-oss-120b,moonshot:kimi-k2.6
// --limit 2 --family sequence,flow for format comparison; default: all 60 prompts.
require('../tests/register.cjs');
const fs=require('node:fs'),path=require('node:path');
const {keyFor,pool,providerSlot}=require('./eval-common.cjs');
const {planBoard,boardProviderOptions}=require('../src/main/board/planner.ts');
const {elkLayout}=require('../src/main/board/elk.ts');
const {formulaPaths}=require('../src/main/board/math.ts');
const {getModel}=require('../src/main/ai/providers.ts');
const {describeModel}=require('../src/main/ai/catalog.ts');
const {lessonMetrics}=require('../src/shared/boardMetrics.ts');
const {applyBeat,lintScene}=require('../src/shared/board.ts');
const argv=process.argv.slice(2),arg=(n,d)=>argv.includes(n)?argv[argv.indexOf(n)+1]:d;
let prompts=JSON.parse(fs.readFileSync(path.join(__dirname,'board-eval/prompts.json'),'utf8')).prompts;
const teaching=argv.includes('--phase3');
if(teaching)prompts=[{id:'teach-array',family:'data',text:'Teach me how to sort [7, 3, 5] using swaps. Show the array changing and ask me one question before giving its answer.'},
 {id:'solve-equation',family:'steps',text:'Show the worked maths for solving x + 2 = 5, with aligned equations.'},
 {id:'quadratic-plot',family:'plot',text:'Plot y = x^2 from x=-3 to 3, mark the minimum at (0,0) and shade the area under the curve.'}];
const families=arg('--family','').split(',').filter(Boolean);if(families.length)prompts=prompts.filter(p=>families.includes(p.family));
const limit=Number(arg('--limit',prompts.length));prompts=families.length?families.flatMap(f=>prompts.filter(p=>p.family===f).slice(0,Math.ceil(limit/families.length))).slice(0,limit):prompts.slice(0,limit);
const formats=arg('--formats','lines').split(','),specs=arg('--providers','deepseek:deepseek-flash,groq:openai/gpt-oss-120b,moonshot:kimi-k2.6').split(',');
const median=v=>{const a=v.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2:null;};
const clean=m=>m.overlaps===0&&m.overflow===0&&m.through===0&&m.textOnLines===0;
const root=path.join(__dirname,'../docs/performance/whiteboard'),out=path.join(root,arg('--out','phase2-planner.json'));
const frozen=JSON.parse(fs.readFileSync(path.join(root,'phase0-baseline.json'),'utf8'));
const original=frozen.models?.[0]?.runs?.flatMap(r=>r.turns.filter(t=>t.kind==='first'&&t.outputTokens).map(t=>t.outputTokens))??[];
const baseline=median(original);
async function run(spec){
 const at=spec.indexOf(':'),provider=spec.slice(0,at),id=spec.slice(at+1),key=keyFor(provider),model=describeModel({provider,id}),runs=[];
 if(!key)return{model:spec,error:'No configured key',runs};
 for(const prompt of prompts)for(const format of formats){
   await providerSlot(provider);
   let entry={prompt:prompt.id,family:prompt.family,text:prompt.text,format};
   try{
     const result=await planBoard({model:getModel(provider,id,{getKey:()=>key}),request:{topic:prompt.text,mode:'new'},format,
       layout:elkLayout,formula:formulaPaths,teaching,signal:AbortSignal.timeout(100000),providerOptions:boardProviderOptions(model)});
     let scene=[],beatsClean=true;for(const beat of result.lesson.beats){scene=applyBeat(scene,beat);if(!clean(lintScene(scene)))beatsClean=false;}
     entry={...entry,script:result.script,lesson:result.lesson,fixes:result.fixes,outputTokens:result.outputTokens,firstBeatMs:Math.round(result.firstBeatMs),layoutMs:Math.round(result.layoutMs),
       metrics:lessonMetrics(result.lesson.beats),lintClean:beatsClean,truncated:result.truncated};
     if(teaching)entry.teachingChecks={actualChanges:result.script.beats.some(b=>b.changes?.length),askPause:result.script.beats.some(b=>b.ask),recap:result.script.beats.some(b=>b.recap),
       formulaNodes:result.script.nodes.filter(n=>n.tex).length,plottedPoints:result.script.nodes.reduce((n,node)=>n+(node.plot?.points?.length??0),0),
       ...(prompt.id==='teach-array'?{finalArray:scene.filter(e=>result.script.nodes.some(n=>n.id===e.id)).sort((a,b)=>a.x-b.x).map(e=>e.label)}:{})};
   }catch(error){entry.error=String(error?.statusCode??error?.message??error).slice(0,160);}
   runs.push(entry);console.log(`${spec} ${prompt.id} ${format}: ${entry.error??`${entry.outputTokens} tokens, ready ${entry.firstBeatMs}ms, clean ${entry.lintClean}`}`);
 }
 return {model:spec,runs,summaries:formats.map(format=>{const all=runs.filter(r=>r.format===format),ok=all.filter(r=>r.metrics);return{
   format,prompts:all.length,parsed:ok.length,lintClean:all.length?all.filter(r=>r.lintClean).length/all.length:0,
   medianTokens:median(ok.map(r=>r.outputTokens)),tokenRatioToPhase0:baseline&&ok.length?median(ok.map(r=>r.outputTokens))/baseline:null,
   medianReadyMs:median(ok.map(r=>r.firstBeatMs)),medianLayoutMs:median(ok.map(r=>r.layoutMs)),fixedLessons:ok.filter(r=>r.fixes.length).length,
   clarity:'Review the gallery for teaching order, correct labels and family; no automatic semantic clarity score is claimed.'};})};
}
(async()=>{
 const models=await pool(specs,3,run),report={checkedAt:new Date().toISOString(),phase:teaching?3:2,conditions:'Fresh specialist calls; firstBeatMs is graph/beat readiness, not renderer first stroke or voice routing time. Every revealed beat is linted. No model-written coordinates.'+(teaching?' Three targeted teaching/maths probes per provider; not a full golden or clarity comparison.':''),
   phase0MedianTokens:baseline,fullGolden:prompts.length===60,formats,models,gate:{threeProviderGolden:prompts.length===60&&models.length>=3&&models.every(m=>m.summaries?.every(s=>s.lintClean>=.9)),
     halfTokens:models.every(m=>m.summaries?.every(s=>s.tokenRatioToPhase0!==null&&s.tokenRatioToPhase0<=.5)),firstStroke:'Measured separately with eval:board:live --phase2; readiness cannot substitute.'}};
 fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(`Saved ${out}`);
})().catch(e=>{console.error(e.message);process.exitCode=1;});
