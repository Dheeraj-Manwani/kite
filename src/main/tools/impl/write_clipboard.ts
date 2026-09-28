import { defineTool } from '../define';
import { textInput } from '../schemas';
import { preview } from '../types';
export function writeClipboard(write: (text: string) => Promise<void>) { return defineTool({ name: 'write_clipboard', description: 'Replace clipboard contents with the provided text (maximum 5000 characters).', kind: 'action', inputSchema: textInput,
  summarize: ({ text }) => `Copy "${preview(text)}" to your clipboard?`, execute: async ({ text }, ctx) => { ctx.signal.throwIfAborted(); await write(text); return { ok: true, message: 'Copied the text to your clipboard.' }; } }); }
