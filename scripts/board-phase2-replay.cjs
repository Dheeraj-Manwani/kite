// Recompile saved specialist generations through today's layout, retaining their original model measurements.
require('../tests/register.cjs');
const fs=require('node:fs'),path=require('node:path');
const {compileScript}=require('../src/shared/board/compile.ts');
const {elkLayout,closeElkWorker}=require('../src/main/board/elk.ts');
const {applyBeat,lintScene,panelSize}=require('../src/shared/board.ts');
const {lessonMetrics,referenceDisplay}=require('../src/shared/boardMetrics.ts');
const root=path.join(__dirname,'../docs/performance/whiteboard'),argv=process.argv.slice(2);
const sources=argv.length?argv:['phase2-deepseek-golden.json','phase2-moonshot-golden.json','phase2-groq-golden.json'];
const median=v=>{const a=v.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2:null;};
const clean=m=>m.overlaps===0&&m.overflow===0&&m.through===0&&m.textOnLines===0;
(async()=>{
 const reports=sources.map(file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'))),models=[];let beatCount=0;
 for(const report of reports)for(const model of report.models)for(const format of report.formats){
   const runs=[];for(const entry of model.runs.filter(r=>r.format===format)){
    let turn={kind:'first',text:entry.text,outputTokens:entry.outputTokens,firstBeatMs:entry.firstBeatMs,firstStrokeMs:null,fixes:entry.fixes};
    if(entry.script){const lesson=await compileScript(entry.script,{layout:elkLayout});let scene=[],lintClean=true;
      for(const beat of lesson.beats){scene=applyBeat(scene,beat);beatCount++;if(!clean(lintScene(scene)))lintClean=false;}
      turn={...turn,script:entry.script,lesson,metrics:lessonMetrics(lesson.beats),lintClean};
    }else turn.error=entry.error;
    runs.push({id:entry.prompt,family:entry.family,turns:[turn]});
   }
   const lessons=runs.flatMap(r=>r.turns).filter(t=>t.metrics),ms=lessons.map(t=>t.metrics),count=lessons.length;
   const mean=field=>count?ms.reduce((n,m)=>n+(m[field]??0),0)/count:null;
   models.push({model:model.model+(report.formats.length>1?':'+format:''),label:model.model+' ('+format+')',ranAt:report.checkedAt,runs,prompts:runs.length,
     summary:{prompts:runs.length,drew:count,validFirstTry:count/runs.length,repairs:lessons.filter(t=>t.fixes?.length).length,lintClean:runs.filter(r=>r.turns[0].lintClean).length/runs.length,
       medianMs:{firstBeat:median(lessons.map(t=>t.firstBeatMs)),firstToken:null,firstStroke:null,total:null},medianOutputTokens:median(lessons.map(t=>t.outputTokens)),
       mean:{overlaps:mean('overlaps'),through:mean('through'),crossings:mean('crossings')},minTextPx:{median:median(ms.map(m=>m.minTextPx))},smallTextShare:mean('smallText')}
   });
 }
 const formatRun=sources.some(s=>s.includes('format')),file=formatRun?'phase2-format-gallery.json':'phase2-golden.json';
 const data={phase:2,about:'Fresh phase-2 specialist generations, recompiled through the current deterministic layout. Ready time is not renderer first stroke. Failed calls count against the full prompt denominator; crossings are recorded separately from the lint-clean gate.',
   updated:reports.map(r=>r.checkedAt).sort().at(-1),revalidatedAt:new Date().toISOString(),display:referenceDisplay,panel:panelSize(referenceDisplay),models,sourceReports:sources,beatCount,
   gate:{threeProviderGolden:models.length>=3&&models.every(m=>m.prompts===60&&m.summary.lintClean>=.9),halfPlannerTokens:models.every(m=>m.summary.medianOutputTokens<=reports[0].phase0MedianTokens*.5),
     rendererLatency:'See phase2-live.json; routing and planner tokens are both included there.'}};
 fs.writeFileSync(path.join(root,file),JSON.stringify(data,null,2)+'\n');console.log(JSON.stringify({models:models.map(m=>({model:m.model,...m.summary})),beatCount,gate:data.gate}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(closeElkWorker);
