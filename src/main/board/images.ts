import { randomUUID } from 'node:crypto';
/** Snapshot replies are bound to a request, board id and revision. A replaced/edited board cannot answer an old request. */
export class BoardImages {
  private pending = new Map<string, { id: number; revision: string; resolve(image?: Uint8Array): void }>();
  constructor(private send: (request: { request: string; id: number; revision: string }) => void) {}
  request(id: number, revision: string, signal: AbortSignal): Promise<Uint8Array | undefined> {
    signal.throwIfAborted(); const request = randomUUID();
    return new Promise(resolve => { const finish = (image?: Uint8Array) => { clearTimeout(timer); signal.removeEventListener('abort', abort); this.pending.delete(request); resolve(image); };
      const abort = () => finish(), timer = setTimeout(finish,5000); this.pending.set(request,{id,revision,resolve:finish}); signal.addEventListener('abort',abort,{once:true});
      try { this.send({request,id,revision}); } catch { finish(); } });
  }
  reply(request: string, id: number, revision: string, image: Uint8Array) { const pending = this.pending.get(request); if (pending?.id === id && pending.revision === revision) pending.resolve(image); }
  close() { for (const p of [...this.pending.values()]) p.resolve(); }
}
