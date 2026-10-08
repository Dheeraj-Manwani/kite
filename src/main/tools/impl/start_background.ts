import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { defineTool } from '../define';
import { backgroundLimits, documentWorkflows, targetBytesSchema } from '../../../shared/background';
import type { BackgroundRunService } from '../../background/service';
import { preview } from '../types';

export function startBackground(service: BackgroundRunService) {
  return defineTool({ name: 'start_background', kind: 'action', approvalRequired: true,
    inputSchema: z.object({ title: z.string().trim().min(1).max(120), text: z.string().max(backgroundLimits.textChars).optional(), agentId: z.string().uuid().optional(), workflow: z.enum(documentWorkflows).optional(), targetBytes: targetBytesSchema.optional() }).strict(),
    description: 'Start deterministic background document work. Use document_pdf for text/Markdown source or supported PNG/JPEG images to PDF, and pdf_optimize for lossless optimization of plain PDFs. Only provide exact user-supplied text; omit text for files so Agents asks the user to select them. Optimization preserves text/images, does not downsample, and may miss a size target; never promise a percentage or target. Encrypted, signed, interactive PDFs and Office files are unsupported. Do not use for mail, browser/desktop actions, or arbitrary compression. Never supply file paths or invented contents. A successful start means accepted, not completed. Saved helpers use their exact ID and saved settings; do not override them.',
    summarize: input => `Start a background ${input.workflow === 'pdf_optimize' ? 'lossless PDF optimization' : 'PDF conversion'} run: “${preview(input.title, 100)}”? It saves new copies in Kite and leaves your originals alone${input.targetBytes ? `, aiming for ${input.targetBytes} bytes per PDF` : ''}.`,
    execute: async (input, ctx) => {
      ctx.signal.throwIfAborted();
      if (ctx.dryRun) return { ok: true, dryRun: true, message: 'Preview only; no background run was started.' };
      const result = service.enqueue({ ...input, requestId: randomUUID() });
      const status = result.ok ? service.detail(result.runId)?.run.status : undefined;
      return { ok: result.ok, message: result.ok ? status === 'waiting_user' ? 'The document run is saved in Agents and is waiting for input. Ask the user to choose matching files or supply text there; processing has not started.' : 'The document run is saved and queued in Agents. Say it is queued; do not claim the PDF is ready or its size target has been met.' : result.error, data: result.ok ? { runId: result.runId, status } : undefined };
    },
  });
}
