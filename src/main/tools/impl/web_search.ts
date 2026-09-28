import { defineTool } from '../define';
import { searchInput } from '../schemas';
import type { AppSettings } from '../../../shared/types';
export function webSearch(engine: AppSettings['searchEngine'], openExternal: (url: string) => Promise<void>) { return defineTool({ name: 'web_search', description: 'Open a search results page in the default browser. Does not read the results.', kind: 'action', inputSchema: searchInput,
  summarize: ({ query }) => `Search the web for "${query}" (${engine})?`, execute: async ({ query }, ctx) => {
    const base = { google: 'https://www.google.com/search?q=', bing: 'https://www.bing.com/search?q=', duckduckgo: 'https://duckduckgo.com/?q=' }[engine];
    ctx.signal.throwIfAborted(); await openExternal(base + encodeURIComponent(query)); return { ok: true, message: 'Search results are opening.' };
  } }); }
