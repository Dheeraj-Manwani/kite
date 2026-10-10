import type { z } from 'zod';
import type { Reminder, ToolAudit, ToolDecision } from '../../shared/types';
/** `transcript`: for a tool that ends the turn, what history records as Kite's reply (it is not spoken). */
export interface ToolResult { ok: boolean; message: string; data?: unknown; dryRun?: boolean; image?: Uint8Array; transcript?: string }
/** `scope`: how far the user's approval reaches, for tools that start a multi-step task. `callId`: the model's tool call. */
export interface ToolContext { dryRun: boolean; signal: AbortSignal; scope?: import('../../shared/agent').TaskScope; callId?: string }
/** How a streamed tool input ended without being executed: cut off, rejected as invalid, or the turn was interrupted. */
export type StreamEnd = 'truncated' | 'rejected' | 'aborted';
export interface ToolDefinition<T = unknown> {
  name: string; description: string; inputSchema: z.ZodType<T>; kind: 'info' | 'action' | 'sensitive-read'; approvalRequired?: boolean;
  /** A successful real (not dry-run) call ends the voice turn: what the tool starts speaks for itself, so no reply follows. */
  endsTurn?: boolean;
  /** Read-only review before approval, e.g. bind a paste to a particular window. */
  review?(input: T, ctx: ToolContext): Promise<string>;
  /**
   * Tools that can start before their input is complete (a whiteboard lesson): `stream` receives the input parsed so far
   * as the model writes it; `streamEnd` hears when it will never be executed. A streamEnd result with ok means what was
   * streamed is playing, and the turn ends on it.
   */
  stream?(callId: string, partial: unknown): void;
  streamEnd?(callId: string, end: StreamEnd): ToolResult | undefined;
  summarize(input: T): string; execute(input: T, ctx: ToolContext): Promise<ToolResult>;
}
export interface AuditStore {
  beginTool(messageId: number | null, tool: string, input: unknown, summary: string, dryRun: boolean): number;
  finishTool(id: number, decision: ToolDecision, result: ToolResult | null, error: string | null, durationMs: number): void;
  updateToolSummary?(id: number, summary: string): void;
  recentTools(): ToolAudit[];
}
export interface ReminderStore { addReminder(at: number, label: string): number; listReminders(): Reminder[]; cancelReminder(id: number): boolean; claimReminder(id: number): boolean }
export function checkAbort(ctx: ToolContext) { ctx.signal.throwIfAborted(); }
export const preview = (s: string, n = 80) => s.length > n ? s.slice(0, n) + '…' : s;
