/** read() must return materialized, writable snapshots (see electronClipboard). */
export interface ClipboardPort<T = unknown> { read(): Promise<T[]>; write(items: T[]): Promise<void>; readText(): Promise<string>; writeText(text: string): Promise<void>; clear(): void }
export async function pasteText<T>(clipboard: ClipboardPort<T>, text: string, signal: AbortSignal, paste: () => void | Promise<void>, delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))) {
  signal.throwIfAborted();
  const saved = await clipboard.read(); signal.throwIfAborted();
  let wrote = false;
  try { await clipboard.writeText(text); wrote = true; signal.throwIfAborted(); await paste(); await delay(300); }
  finally { if (wrote) { if (saved.length) await clipboard.write(saved); else clipboard.clear(); } }
}
