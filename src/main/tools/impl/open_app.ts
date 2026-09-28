import { defineTool } from '../define';
import { nameInput } from '../schemas';
import { findApps, AppEntry } from '../appIndex';
export function openApp(entries: AppEntry[], openPath: (path: string) => Promise<string>) {
  return defineTool({ name: 'open_app', description: 'Open an indexed Windows Start Menu application. Ambiguous names return candidates without opening anything. Ask the user to choose.', kind: 'action', inputSchema: nameInput,
    summarize: ({ name }) => { const r = findApps(entries, name); return r.match ? `Open "${r.match.displayName}"?` : `Find matching apps for "${name}"? No app will open until a match is clear.`; },
    execute: async ({ name }, ctx) => {
      const r = findApps(entries, name);
      if (!r.match) return { ok: true, message: r.candidates.length ? 'No app opened. Ask which candidate the user meant.' : 'No matching Start Menu shortcut was found. Ask for another app name.', data: r.candidates.map(a => a.displayName) };
      ctx.signal.throwIfAborted(); const error = await openPath(r.match.lnkPath);
      return error ? { ok: false, message: 'Windows could not open the app.' } : { ok: true, message: `${r.match.displayName} is opening.` };
    } });
}
