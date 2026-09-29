import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { VisionTurn } from '../../shared/vision';
export async function persistVision(options: {
  userData: string; keep: boolean; row: number; turn: VisionTurn; signal: AbortSignal;
  history: { annotate(id: number, metadata: unknown, captureMs: number): void; attach(id: number, filename: string): void };
}) {
  const { row, turn, signal, history } = options;
  signal.throwIfAborted(); history.annotate(row, turn.analysis, turn.captureMs);
  if (!options.keep) return;
  const folder = path.join(options.userData, 'screens'); await mkdir(folder, { recursive: true });
  for (const image of [turn.images.overview, turn.images.zoom].filter(Boolean)) {
    signal.throwIfAborted(); const filename = path.join(folder, `${randomUUID()}.jpg`);
    try { await writeFile(filename, image); signal.throwIfAborted(); history.attach(row, filename); }
    catch (error) { await unlink(filename).catch((): void => undefined); throw error; }
  }
}
