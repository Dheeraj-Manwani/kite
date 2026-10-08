import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { defineTool } from '../define';
import { backgroundLimits } from '../../../shared/background';
import type { BackgroundRunService } from '../../background/service';
import { preview } from '../types';

export function startBackground(service: BackgroundRunService) {
  return defineTool({ name: 'start_background', kind: 'action', approvalRequired: true,
    inputSchema: z.object({ title: z.string().trim().min(1).max(120), text: z.string().max(backgroundLimits.textChars).optional(), agentId: z.string().uuid().optional() }).strict(),
    description: 'Start a background text-to-PDF run and let the user keep working. Supply the exact user-provided text to convert, or omit text when the user refers to a file so the Agents panel asks for input. This release supports plain text and Markdown source; it preserves Markdown notation, rather than rendering it. Do not use for Office documents, compression, mail, browser actions, or desktop actions yet. Do not invent file contents. A successful start means queued, not completed. Use do_task for immediate in-app work. User files are selected in the Agents panel; never supply filesystem paths. Saved PDF agents may be selected by their exact ID.',
    summarize: input => `Start a background PDF run: “${preview(input.title, 100)}”? It saves a new PDF in Kite and leaves your originals alone.`,
    execute: async (input, ctx) => {
      ctx.signal.throwIfAborted();
      if (ctx.dryRun) return { ok: true, dryRun: true, message: 'Preview only; no background run was started.' };
      const result = service.enqueue({ ...input, requestId: randomUUID() });
      const status = result.ok ? service.detail(result.runId)?.run.status : undefined;
      return { ok: result.ok, message: result.ok ? status === 'waiting_user' ? 'The PDF run is saved in Agents and is waiting for input. Ask the user to add text or files in the Agents panel; conversion has not started.' : 'The PDF run is saved and queued in Agents. Say it is queued; do not claim the PDF is ready.' : result.error, data: result.ok ? { runId: result.runId, status } : undefined };
    },
  });
}
