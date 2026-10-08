import { Worker } from 'node:worker_threads';
import type { ElkNode } from 'elkjs/lib/elk-api';
/** Lazy Node worker: no ELK code/thread at startup, no layout on the UI thread, released after 30 idle seconds. */
const source = `const { parentPort, workerData } = require('node:worker_threads');
const ELK = require(workerData.module); const elk = new ELK();
parentPort.on('message', async ({id,graph}) => { try { const at=performance.now(); const result=await elk.layout(graph);
parentPort.postMessage({id,graph:result,layoutMs:performance.now()-at}); }
catch (error) { parentPort.postMessage({id,error:String(error.message || error)}); } });`;
let worker: Worker | undefined, sequence = 0, idle: ReturnType<typeof setTimeout> | undefined;
let lastTiming = { layoutMs: 0, roundTripMs: 0 };
const pending = new Map<number, { finish(error?: Error, result?: ElkNode): void; started: number }>();
export const elkTiming = () => ({ ...lastTiming });
export function closeElkWorker() {
  clearTimeout(idle); const old = worker; worker = undefined;
  for (const entry of [...pending.values()]) entry.finish(new Error('Whiteboard layout worker stopped.'));
  void old?.terminate();
}
function getWorker() {
  if (worker) return worker;
  const next = new Worker(source, { eval: true, workerData: { module: require.resolve('elkjs/lib/elk.bundled.js') } });
  next.on('message', ({ id, graph, error, layoutMs }) => { const entry = pending.get(id); if (!entry) return;
    lastTiming = { layoutMs: layoutMs ?? 0, roundTripMs: performance.now() - entry.started };
    entry.finish(error ? new Error(error) : undefined, graph); });
  next.on('error', () => { if (worker === next) closeElkWorker(); });
  next.on('exit', () => { if (worker === next) closeElkWorker(); });
  worker = next; return next;
}
export async function elkLayout(graph: ElkNode, signal?: AbortSignal): Promise<ElkNode> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const current = getWorker(), id = ++sequence; clearTimeout(idle); current.ref();
    const finish = (error?: Error, result?: ElkNode) => {
      if (!pending.delete(id)) return;
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (!pending.size && worker) { worker.unref(); idle = setTimeout(closeElkWorker, 30_000); idle.unref(); }
      error ? reject(error) : resolve(result);
    };
    const abort = () => { finish(new Error('Whiteboard layout cancelled.')); if (!pending.size) closeElkWorker(); };
    const timer = setTimeout(() => { finish(new Error('Whiteboard layout timed out.')); closeElkWorker(); }, 10_000);
    pending.set(id, { finish, started: performance.now() });
    signal?.addEventListener('abort', abort, { once: true });
    current.postMessage({ id, graph });
  });
}
