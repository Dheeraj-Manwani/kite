import { app, utilityProcess, type UtilityProcess } from 'electron';
import path from 'node:path';
import { DocumentFailure, documentErrors, type DocumentErrorCode, type DocumentJob, type DocumentMetadata, type DocumentOutput } from './documentTypes';

/** A new killable utility process for each job; binary parsing never blocks the main or UI event loops. */
export class DocumentExecutor {
  private tail: Promise<void> = Promise.resolve();
  private active = new Set<UtilityProcess>();
  private closed = false;
  constructor(private workerPath = path.join(__dirname, 'documentWorker.js')) {}
  inspect(job: Omit<DocumentJob, 'action'>, signal = new AbortController().signal) { return this.run({ ...job, action: 'inspect' }, signal) as Promise<DocumentMetadata>; }
  convert(job: DocumentJob, signal: AbortSignal) { return this.run(job, signal) as Promise<DocumentOutput>; }
  private async run(job: DocumentJob, signal: AbortSignal) {
    const previous = this.tail; let release: () => void; this.tail = new Promise<void>(resolve => { release = resolve; });
    try {
      await previous; signal.throwIfAborted(); if (this.closed) throw new DocumentFailure('worker');
      return await new Promise<DocumentMetadata | DocumentOutput>((resolve, reject) => {
        let done = false;
        const child = utilityProcess.fork(this.workerPath, [], { stdio: 'ignore', serviceName: 'Kite document worker', execArgv: ['--max-old-space-size=256'], env: { SystemRoot: process.env.SystemRoot ?? '', TEMP: process.env.TEMP ?? '', TMP: process.env.TMP ?? '' } });
        this.active.add(child);
        const finish = (error?: Error, result?: DocumentMetadata | DocumentOutput) => {
          if (done) return; done = true; clearTimeout(timer); clearInterval(memory); signal.removeEventListener('abort', abort); this.active.delete(child); child.kill();
          if (error) reject(error); else resolve(result);
        };
        const abort = () => finish(new DOMException('Aborted', 'AbortError'));
        const timer = setTimeout(() => finish(new DocumentFailure('worker')), 30_000);
        const memory = setInterval(() => { const metrics = app.getAppMetrics().find(m => m.pid === child.pid); if (metrics && metrics.memory.workingSetSize > 512 * 1024) finish(new DocumentFailure('limits')); }, 1000);
        signal.addEventListener('abort', abort, { once: true });
        child.on('spawn', () => { if (done) { child.kill(); return; } if (this.closed) { finish(new DocumentFailure('worker')); return; } child.postMessage(job); });
        child.on('message', (reply: { ok: boolean; result?: DocumentMetadata | DocumentOutput; code?: DocumentErrorCode }) => {
          if (!reply.ok) finish(new DocumentFailure(reply.code in documentErrors ? reply.code : 'worker'));
          else finish(undefined, reply.result);
        });
        child.on('error', () => finish(new DocumentFailure('worker')));
        child.on('exit', () => finish(new DocumentFailure('worker')));
      });
    } finally { release(); }
  }
  close() { this.closed = true; for (const child of this.active) child.kill(); }
}
