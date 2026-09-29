import { tool, type ToolSet } from 'ai';
import type { ToolDefinition, ToolContext, ToolResult, AuditStore } from './types';
import { needsApproval, ApprovalBroker } from './approval';
import type { ToolDecision } from '../../shared/types';
export type { ToolDefinition, ToolResult, ToolContext } from './types';
// An interrupted paste must finish restoring the clipboard before a new session uses it.
let executionQueue: Promise<unknown> = Promise.resolve();
export async function waitForTools() { await executionQueue; }
interface Call { row: number; tool: string; input: unknown; summary: string; decision: ToolDecision; granted: boolean; finished: boolean; executing?: boolean; started: number }
export interface ToolSessionOptions {
  imageToolResults?: boolean;
  definitions: ToolDefinition[]; broker: ApprovalBroker; audit: AuditStore; messageId: number | null; context: ToolContext;
  activity(): void; changed(): void; event(type: 'tool:executing' | 'tool:result', toolName: string, result?: ToolResult): void;
}
export class ToolSession {
  private images: Uint8Array[] = [];
  get hasImages() { return this.images.length > 0; }
  takeImages() { const images = this.images; this.images = []; return images; }
  private calls = new Map<string, Call>();
  private queue: Promise<unknown> = Promise.resolve();
  private pendingApproval?: string;
  approvedActions = 0;
  modelCalls = 0;
  budgetExceeded = false;
  constructor(readonly options: ToolSessionOptions) {}
  observe(id: string, name: string, input: unknown) {
    this.options.activity();
    if (this.calls.has(id)) return this.calls.get(id);
    const def = this.options.definitions.find(d => d.name === name);
    const parsed = def?.inputSchema.safeParse(input);
    const summary = parsed?.success ? def.summarize(parsed.data) : `Invalid input for ${name}. Nothing will run.`;
    const call: Call = { row: this.options.audit.beginTool(this.options.messageId, name, input, summary, this.options.context.dryRun), tool: name,
      input: parsed?.success ? parsed.data : input, summary, decision: 'denied', granted: false, finished: false, started: performance.now() };
    this.calls.set(id, call); this.options.changed(); return call;
  }
  private finish(call: Call, result: ToolResult | null, error: string | null) {
    call.finished = true;
    this.options.audit.finishTool(call.row, call.decision, result ? { ...result, image: undefined } : null, error, performance.now() - call.started); this.options.changed();
  }
  invalid(id: string, name: string, input: unknown) { const call = this.observe(id, name, input); if (!call.finished) this.finish(call, null, 'Invalid tool name or arguments; nothing ran.'); }
  async approve(id: string, name: string, input: unknown, budgetAvailable: boolean) {
    const call = this.observe(id, name, input); const def = this.options.definitions.find(d => d.name === name);
    const valid = def?.inputSchema.safeParse(input);
    if (!valid?.success || call.finished || this.options.context.signal.aborted || !budgetAvailable || this.approvedActions >= 3) {
      if (!budgetAvailable || this.approvedActions >= 3) this.budgetExceeded = true;
      if (!call.finished) this.finish(call, null, budgetAvailable ? 'Action denied.' : 'Model-call budget exhausted.'); return false;
    }
    const pending = this.options.broker.request(name, call.summary, valid.data, this.options.context.dryRun, this.options.context.signal);
    this.pendingApproval = this.options.broker.current?.approvalId;
    const decision = await pending;
    this.pendingApproval = undefined;
    call.decision = decision;
    if (decision === 'approved' && !this.options.context.signal.aborted) {
      call.granted = true; this.approvedActions++;
      this.options.audit.finishTool(call.row, decision, null, 'Approved; awaiting execution', performance.now() - call.started); this.options.changed(); return true;
    }
    this.finish(call, { ok: false, message: decision === 'timeout' ? 'Approval timed out. Nothing ran.' : 'User declined. Nothing ran.' }, null); return false;
  }
  tools(): ToolSet {
    return Object.fromEntries(this.options.definitions.map(def => [def.name, tool({ description: def.description, inputSchema: def.inputSchema,
      toModelOutput: ({ output }) => {
        const result = output as ToolResult;
        if (result.image && this.options.imageToolResults) return { type: 'content' as const, value: [
          { type: 'text' as const, text: result.message }, { type: 'file' as const, data: { type: 'data' as const, data: result.image }, mediaType: 'image/jpeg' },
        ] };
        return { type: 'text' as const, value: JSON.stringify({ ...result, image: undefined }) };
      },
      needsApproval: () => needsApproval(def),
      execute: async (input, { toolCallId }) => {
        const run = async (): Promise<ToolResult> => {
          const call = this.observe(toolCallId, def.name, input);
          const parsed = def.inputSchema.safeParse(input);
          if (call.finished || !parsed.success || JSON.stringify(parsed.data) !== JSON.stringify(call.input) || this.options.context.signal.aborted
            || (needsApproval(def) && !call.granted)) {
            if (!call.finished) this.finish(call, null, 'No valid, matching approval or interaction was cancelled.');
            return { ok: false, message: 'Action not executed.' };
          }
          if (!needsApproval(def)) call.decision = 'auto';
          call.executing = true;
          this.options.audit.finishTool(call.row, call.decision, null, 'Executing; result pending', performance.now() - call.started); this.options.changed();
          call.granted = false; // Single-use permission, never reusable by another call.
          this.options.event('tool:executing', def.name);
          try {
            const result = await def.execute(parsed.data, this.options.context);
            if (result.image && !this.options.imageToolResults) this.images.push(result.image);
            this.finish(call, result, result.ok ? null : result.message); this.options.event('tool:result', def.name, result); return result;
          } catch (error) {
            const result = { ok: false, message: this.options.context.signal.aborted ? 'Action interrupted. Any completed side effects cannot be undone.' : 'The action failed. No success is confirmed.' };
            this.finish(call, result, error instanceof Error && error.name === 'ZodError' ? 'Validation failed' : result.message);
            this.options.event('tool:result', def.name, result); return result;
          }
        };
        // Clipboard and foreground-app actions must not race each other.
        const result = executionQueue.then(run); this.queue = executionQueue = result.catch((): void => undefined); return result;
      },
    })]));
  }
  async settled() { await this.queue; }
  close() {
    this.images = [];
    if (this.pendingApproval && this.options.broker.current?.approvalId === this.pendingApproval) this.options.broker.deny();
    for (const call of this.calls.values()) if (!call.finished && !call.executing) { call.granted = false; call.decision = 'denied'; this.finish(call, null, 'Interaction ended before execution.'); }
  }
}
