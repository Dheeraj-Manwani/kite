import { defineTool } from '../define';
import { textInput } from '../schemas';
import { preview } from '../types';
import { pasteText, ClipboardPort } from '../clipboard';
export interface PasteTarget { hwnd: number; pid: number; title: string; process: string }
export interface PasteDestination { capture(signal: AbortSignal): Promise<PasteTarget | null>; paste(target: PasteTarget, signal: AbortSignal): Promise<boolean> }
export function typeText<T>(clipboard: ClipboardPort<T>, destination: PasteDestination) {
  const targets = new Map<string, PasteTarget>();
  return defineTool({ name: 'type_text', description: 'Paste up to 5000 characters into the named window reviewed in the permission card. Switching to another app or changing the window cancels the paste. Clipboard is restored afterwards.', kind: 'action', inputSchema: textInput,
    summarize: ({ text }) => `Paste "${preview(text)}" into the destination app?`,
    review: async ({ text }, ctx) => {
      const target = await destination.capture(ctx.signal);
      if (!target || !ctx.callId) throw new Error('No destination');
      targets.set(ctx.callId, target);
      return `Paste "${preview(text)}" into ${target.process} — “${preview(target.title, 100) || 'Untitled window'}”?`;
    },
    execute: async ({ text }, ctx) => {
      const target = ctx.callId ? targets.get(ctx.callId) : undefined;
      if (!target) return { ok: false, message: 'No reviewed destination. Nothing was pasted. Ask again with the destination app focused.' };
      try {
        await pasteText(clipboard, text, ctx.signal, async () => {
          if (!await destination.paste(target, ctx.signal)) throw new Error('Destination changed');
        });
        return { ok: true, message: 'Sent paste to the reviewed window and restored the clipboard. The app’s resulting contents were not inspected.', data: target && { destination: target.process, window: target.title } };
      } catch { ctx.signal.throwIfAborted(); return { ok: false, message: 'The destination changed or could not receive paste. Nothing is confirmed pasted. The clipboard was restored. Focus the intended app and ask again.' }; }
      finally { if (ctx.callId) targets.delete(ctx.callId); }
    },
  });
}
