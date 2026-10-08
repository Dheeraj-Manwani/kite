import { createHash } from 'node:crypto';
import { lstat, readFile, realpath, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { backgroundLimits } from '../../shared/background';

export const hashOf = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
/** Verifier for PDFs produced by our Chromium engine, not a general untrusted-PDF parser. */
export function inspectPdf(bytes: Uint8Array) {
  if (bytes.length > backgroundLimits.outputBytes || bytes.length < 100) throw new Error('The PDF output size is invalid.');
  const buffer = Buffer.from(bytes);
  if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-')) || !buffer.subarray(-1024).includes(Buffer.from('%%EOF'))) throw new Error('The converter did not produce a complete PDF.');
  const pages = (buffer.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length;
  if (!pages || pages > 1000) throw new Error('The PDF has no readable page structure.');
  return { bytes: buffer.length, hash: hashOf(buffer), pages };
}
export async function safeArtifact(root: string, runId: string, index: number) {
  const filename = path.join(root, runId, `output-${index + 1}.pdf`);
  try {
    const stat = await lstat(filename); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > backgroundLimits.outputBytes) return null;
    const canonical = await realpath(filename), canonicalRoot = await realpath(root);
    const relative = path.relative(canonicalRoot, canonical); if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
    return { filename: canonical, ...inspectPdf(await readFile(canonical)) };
  } catch { return null; }
}
export async function publishPdf(root: string, runId: string, index: number, generation: number, bytes: Uint8Array, current: () => boolean) {
  const directory = path.join(root, runId); await mkdir(directory, { recursive: true });
  const canonical = await realpath(directory), canonicalRoot = await realpath(root);
  const relative = path.relative(canonicalRoot, canonical); if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('The output directory is outside Kite.');
  if (!current()) throw new DOMException('Aborted', 'AbortError');
  const staged = path.join(canonical, `staging-${index}-${generation}.pdf`), final = path.join(canonical, `output-${index + 1}.pdf`);
  await writeFile(staged, bytes, { flag: 'w' });
  if (!current()) throw new DOMException('Aborted', 'AbortError');
  // Only this run/generation owns this path. Recovery reconciles its journal before dispatching a new writer.
  await rename(staged, final);
  if (!current()) throw new DOMException('Aborted', 'AbortError');
  return final;
}
