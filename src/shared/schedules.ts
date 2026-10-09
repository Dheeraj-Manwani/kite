import { z } from 'zod';
import type { BackgroundRun } from './background';
import type { BoundMailOptions } from './mail';
import type { CareerOptions } from './career';

const zone = z.string().min(1).max(80).refine(value => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return true; } catch { return false; }
}, 'Choose a valid time zone.');
export const recurrenceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('interval'), minutes: z.number().int().min(15).max(10080) }).strict(),
  z.object({ kind: z.literal('daily'), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), timeZone: zone }).strict(),
]);
export type Recurrence = z.infer<typeof recurrenceSchema>;
export const scheduleDraftSchema = z.object({ requestId: z.string().uuid(), agentId: z.string().uuid(), agentRevision: z.number().int().positive(), recurrence: recurrenceSchema, consent: z.literal(true) }).strict();
export type ScheduleDraft = z.infer<typeof scheduleDraftSchema>;
export const scheduleControlSchema = z.object({ id: z.string().uuid(), revision: z.number().int().positive(), action: z.enum(['pause', 'renew']) }).strict();
export type ScheduleControl = z.infer<typeof scheduleControlSchema>;
export const scheduleHistorySchema = z.object({ id: z.string().uuid(), before: z.number().int().positive().optional() }).strict();
export interface AgentSchedule {
  id: string; revision: number; agentId: string; agentName: string; agentRevision: number;
  recurrence: Recurrence; state: 'active' | 'paused' | 'blocked'; nextAt: number;
  createdAt: number; lastRunId: string | null; message: string;
  mail?: BoundMailOptions; career?: CareerOptions;
}
export interface ScheduledOccurrence { id: string; consentId: string; at: number }
export interface ScheduleHistory { runs: BackgroundRun[]; nextCursor: number | null }
export interface ChildTask { id: string; name: string; status: 'running' | 'succeeded' | 'failed'; bytes: number }
export interface DelegationBudget { maxChildren: number; concurrency: number; maxBytes: number; bytes: number; deadline: number; modelCalls: 0; children: ChildTask[] }
