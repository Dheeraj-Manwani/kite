import { defineTool } from '../define';
import { urlInput } from '../schemas';
export function openUrl(openExternal: (url: string) => Promise<void>) { return defineTool({ name: 'open_url', description: 'Open an http or https URL in the default browser. For a YouTube search, use a youtube.com/results?search_query= URL.', kind: 'action', inputSchema: urlInput,
  summarize: ({ url }) => `Open ${new URL(url).hostname}?`, execute: async ({ url }, ctx) => { ctx.signal.throwIfAborted(); await openExternal(new URL(url).href); return { ok: true, message: 'The browser accepted the URL.' }; } }); }
