import { mkdir, open } from 'node:fs/promises';
import path from 'node:path';
import { defineTool } from '../define';
import { noteInput } from '../schemas';
export function safeFilename(title: string) {
  // Windows forbids these control characters in filenames.
  // eslint-disable-next-line no-control-regex
  let s = title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 100);
  if (!s || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(s)) s = 'Note_' + s;
  return s;
}
export function createNote(documents: string, openPath: (path: string) => Promise<string>) { return defineTool({ name: 'create_note', description: 'Create a Markdown note in Documents/Kite Notes and open it. Never overwrites a file.', kind: 'action', inputSchema: noteInput,
  summarize: ({ title }) => `Create and open "${safeFilename(title)}.md" in Documents/Kite Notes?`, execute: async ({ title, content }, ctx) => {
    ctx.signal.throwIfAborted(); const folder = path.join(documents, 'Kite Notes'); await mkdir(folder, { recursive: true });
    for (let i = 1; i <= 10000; i++) {
      ctx.signal.throwIfAborted(); const filename = path.join(folder, `${safeFilename(title)}${i === 1 ? '' : ` (${i})`}.md`);
      let file; try { file = await open(filename, 'wx'); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue; throw error; }
      try { await file.writeFile(`# ${title.replace(/[\r\n]/g, ' ')}\n\n${content}\n`, 'utf8'); } finally { await file.close(); }
      if (ctx.signal.aborted) return { ok: true, message: 'Note saved; opening was cancelled.', data: { path: filename } };
      const error = await openPath(filename); return { ok: !error, message: error ? 'Note saved, but Windows could not open it.' : 'Note saved and opening.', data: { path: filename } };
    }
    return { ok: false, message: 'Too many notes with that name.' };
  } }); }
