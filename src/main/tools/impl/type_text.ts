import { defineTool } from '../define';
import { textInput } from '../schemas';
import { preview } from '../types';
import { pasteText, ClipboardPort } from '../clipboard';
export function typeText<T>(clipboard: ClipboardPort<T>, paste: () => void) { return defineTool({ name: 'type_text', description: 'Paste up to 5000 characters into the app that currently has focus. The overlay does not take focus; voice approval is recommended. Clipboard is restored after 300ms.', kind: 'action', inputSchema: textInput,
  summarize: ({ text }) => `Paste "${preview(text)}" into the currently focused app?`, execute: async ({ text }, ctx) => {
    await pasteText(clipboard, text, ctx.signal, paste); return { ok: true, message: 'Sent paste to the focused app and restored the clipboard. The target app’s contents were not inspected.' };
  } }); }
