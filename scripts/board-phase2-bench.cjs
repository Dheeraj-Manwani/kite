require('../tests/register.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {compileScript}=require('../src/shared/board/compile.ts');
const {elkLayout,elkTiming,closeElkWorker}=require('../src/main/board/elk.ts');
const {lintScene,applyBeat}=require('../src/shared/board.ts');
const median=v=>{const a=[...v].sort((a,b)=>a-b);return(a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2;};
(async()=>{
 const nodes=Array.from({length:30},(_,i)=>({id:`n${i}`,label:`Component ${i}`})),edges=nodes.slice(1).map((n,i)=>({id:`e${i}`,from:`n${i}`,to:n.id,label:'next'}));
 const script={version:2,title:'Benchmark',family:'flow',mode:'new',nodes,edges,beats:[{say:'A measured graph.',reveal:[...nodes.map(n=>n.id),...edges.map(e=>e.id)]}]};
 const sample=async()=>{const at=performance.now(),lesson=await compileScript(script,{layout:elkLayout});const m=lintScene(lesson.beats.reduce(applyBeat,[]));assert.equal(m.overlaps,0);assert.equal(m.overflow,0);assert.equal(m.through,0);return{totalMs:performance.now()-at,...elkTiming()};};
 const cold=await sample();for(let i=0;i<3;i++)await sample();const warm=[];for(let i=0;i<10;i++)warm.push(await sample());
 const report={checkedAt:new Date().toISOString(),conditions:'60 rendered elements (30 measured nodes, 29 labelled edges, title), layout in Node worker plus deterministic routing/label lint in shared code. Cold startup reported separately; three fixed warmup runs before ten samples.',
   elements:60,cold,warm,medianMs:median(warm.map(s=>s.totalMs)),maxMs:Math.max(...warm.map(s=>s.totalMs)),targetMs:50};
 fs.writeFileSync(path.join(__dirname,'../docs/performance/whiteboard/phase2-layout.json'),JSON.stringify(report,null,2)+'\n');console.log(report);assert.ok(report.medianMs<50,'60-element median layout/lint target');
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(closeElkWorker);
