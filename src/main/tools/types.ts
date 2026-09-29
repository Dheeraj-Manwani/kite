import type { z } from 'zod';
import type { Reminder, ToolAudit, ToolDecision } from '../../shared/types';
export interface ToolResult { ok: boolean; message: string; data?: unknown; dryRun?: boolean; image?: Uint8Array }
export interface ToolContext { dryRun: boolean; signal: AbortSignal }
export interface ToolDefinition<T = unknown> {
  name: string; description: string; inputSchema: z.ZodType<T>; kind: 'info' | 'action' | 'sensitive-read'; approvalRequired?: boolean;
  summarize(input: T): string; execute(input: T, ctx: ToolContext): Promise<ToolResult>;
}
export interface AuditStore {
  beginTool(messageId: number | null, tool: string, input: unknown, summary: string, dryRun: boolean): number;
  finishTool(id: number, decision: ToolDecision, result: ToolResult | null, error: string | null, durationMs: number): void;
  recentTools(): ToolAudit[];
}
export interface ReminderStore { addReminder(at: number, label: string): number; listReminders(): Reminder[]; cancelReminder(id: number): boolean; claimReminder(id: number): boolean }
export function checkAbort(ctx: ToolContext) { ctx.signal.throwIfAborted(); }
export const preview = (s: string, n = 80) => s.length > n ? s.slice(0, n) + '…' : s;
