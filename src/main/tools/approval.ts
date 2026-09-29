import { randomUUID } from 'node:crypto';
import type { ApprovalCard, ToolDecision } from '../../shared/types';
export type ApprovalPolicy = { defaults: { info: boolean; action: boolean; 'sensitive-read': boolean }; tools: Record<string, boolean> };
export const approvalPolicy: ApprovalPolicy = { defaults: { info: false, action: true, 'sensitive-read': true }, tools: { read_clipboard: true } };
export function needsApproval(tool: { name: string; kind: 'info' | 'action' | 'sensitive-read'; approvalRequired?: boolean }, config = approvalPolicy) { return tool.approvalRequired ?? config.tools[tool.name] ?? config.defaults[tool.kind]; }
export function classifyApproval(text: string): 'approve' | 'deny' | 'new-request' {
  const s = text.toLowerCase().trim().replace(/[.!?,]+$/g, '').replace(/’/g, "'").replace(/\s+/g, ' ');
  if (/^(yes|yeah|yep|sure|do it|go ahead|okay|ok)( please)?$/.test(s)) return 'approve';
  if (/^(no|nope|cancel|stop|don't|do not)( please)?$/.test(s)) return 'deny';
  return 'new-request';
}
interface Pending { card: ApprovalCard; settle: (decision: ToolDecision) => void }
export class ApprovalBroker {
  private pending?: Pending;
  constructor(private present: (card: ApprovalCard) => void, private decided: (card: ApprovalCard, decision: ToolDecision) => void, private timeoutMs = 30000) {}
  get current() { return this.pending?.card; }
  request(toolName: string, summary: string, input: unknown, dryRun: boolean, signal: AbortSignal): Promise<ToolDecision> {
    if (this.pending) throw new Error('An approval is already pending');
    if (signal.aborted) return Promise.resolve('denied');
    return new Promise(resolve => {
      const card: ApprovalCard = { approvalId: randomUUID(), toolName, summary, input: structuredClone(input), dryRun, expiresAt: Date.now() + this.timeoutMs };
      const abort = () => settle('denied');
      const settle = (decision: ToolDecision) => {
        if (this.pending?.card.approvalId !== card.approvalId) return;
        clearTimeout(timer); signal.removeEventListener('abort', abort); this.pending = undefined;
        this.decided(card, decision); resolve(decision);
      };
      const timer = setTimeout(() => settle('timeout'), this.timeoutMs);
      this.pending = { card, settle }; signal.addEventListener('abort', abort, { once: true }); this.present(card);
    });
  }
  decide(id: string, approved: boolean) {
    if (!this.pending || this.pending.card.approvalId !== id) return false;
    this.pending.settle(Date.now() >= this.pending.card.expiresAt ? 'timeout' : approved ? 'approved' : 'denied'); return true;
  }
  deny() { this.pending?.settle('denied'); }
}
