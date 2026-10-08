import { Worker } from 'node:worker_threads';
import type { FormulaPaths } from '../../shared/boardTeaching';
let worker: Worker | undefined, sequence = 0, idle: ReturnType<typeof setTimeout> | undefined;
const jobs = new Map<number, { resolve(v: FormulaPaths): void; reject(e: Error): void; timer: ReturnType<typeof setTimeout> }>();
function armIdle() { if (!jobs.size) { worker?.unref(); clearTimeout(idle); idle = setTimeout(closeMathWorker, 30_000); idle.unref(); } }
/** MathJax and its font data load only for a formula, off the UI and main event loops. */
export function formulaPaths(tex: string, signal?: AbortSignal): Promise<FormulaPaths> {
  signal?.throwIfAborted(); clearTimeout(idle);
  if (!worker) {
    worker = new Worker(`const {parentPort}=require('node:worker_threads');
      const M=require(${JSON.stringify(require.resolve('@mathjax/src'))});
      const ready=M.init({loader:{load:['input/tex','output/svg'],require:file=>import(require('node:url').pathToFileURL(require.resolve(file)).href)},tex:{packages:['base','ams'],maxBuffer:2048,maxMacros:1000},svg:{fontCache:'none'}});
      let queue=Promise.resolve();parentPort.on('message',job=>{queue=queue.then(async()=>{try{
        await ready; const root=await M.tex2svgPromise(job.tex,{display:true}),a=M.startup.adaptor,paths=[];
        let box;const walk=(node,transforms=[])=>{const kind=a.kind(node);if(kind==='#text')return;
          const t=a.getAttribute(node,'transform');if(t)transforms=[...transforms,t];
          if(a.getAttribute(node,'data-mml-node')==='merror')throw new Error('Invalid formula');
          if(kind==='svg'){const v=a.getAttribute(node,'viewBox').split(/\\s+/).map(Number);box={x:v[0],y:v[1],width:v[2],height:v[3]};}
          if(kind==='path')paths.push({d:a.getAttribute(node,'d'),transform:transforms.join(' ')});
          if(kind==='rect'){const x=Number(a.getAttribute(node,'x')||0),y=Number(a.getAttribute(node,'y')||0),w=Number(a.getAttribute(node,'width')),h=Number(a.getAttribute(node,'height'));paths.push({d:'M'+x+' '+y+'h'+w+'v'+h+'h'+(-w)+'Z',transform:transforms.join(' ')});}
          if(paths.length>2048)throw new Error('Formula is too complex');for(const child of a.childNodes(node))walk(child,transforms);
        };walk(root);if(!box||!paths.length)throw new Error('Formula has no paths');parentPort.postMessage({id:job.id,result:{paths,box}});
      }catch(e){parentPort.postMessage({id:job.id,error:e.message});}});});`, { eval: true });
    worker.on('message', ({ id, result, error }) => { const job = jobs.get(id); if (!job) { armIdle(); return; } jobs.delete(id); clearTimeout(job.timer);
      if (error) job.reject(new Error(error)); else job.resolve(result);
      armIdle();
    });
    const created = worker;
    worker.on('error', () => { if (worker === created) closeMathWorker(); }); worker.on('exit', () => { if (worker === created && jobs.size) closeMathWorker(); });
  }
  worker.ref(); const id = ++sequence;
  return new Promise((resolve, reject) => {
    const abort = () => { const job = jobs.get(id); if (!job) return; jobs.delete(id); clearTimeout(job.timer); signal?.removeEventListener('abort', abort); reject(new Error('Formula cancelled')); armIdle(); };
    const timer = setTimeout(() => closeMathWorker(), 10_000);
    jobs.set(id, { resolve: value => { signal?.removeEventListener('abort', abort); resolve(value); }, reject: error => { signal?.removeEventListener('abort', abort); reject(error); }, timer });
    signal?.addEventListener('abort', abort, { once: true }); worker.postMessage({ id, tex: tex.slice(0, 500) });
  });
}
export function closeMathWorker() { clearTimeout(idle); const old = worker; worker = undefined; void old?.terminate(); for (const job of jobs.values()) { clearTimeout(job.timer); job.reject(new Error('Formula worker stopped')); } jobs.clear(); }
