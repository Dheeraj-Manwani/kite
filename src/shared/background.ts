import { z } from 'zod';

export const runStatuses = ['queued', 'running', 'waiting_user', 'paused', 'verifying', 'succeeded', 'failed', 'cancelled'] as const;
export type RunStatus = typeof runStatuses[number];
export const finishedRun = (status: RunStatus) => ['succeeded', 'failed', 'cancelled'].includes(status);
export const statusLabels: Record<RunStatus, string> = { queued: 'Queued', running: 'Working', waiting_user: 'Needs you', paused: 'Paused', verifying: 'Checking output', succeeded: 'Done', failed: 'Could not finish', cancelled: 'Cancelled' };
export const backgroundLimits = { inputBytes: 2 * 1024 * 1024, binaryBytes: 5 * 1024 * 1024, batchBytes: 16 * 1024 * 1024, grantBytes: 32 * 1024 * 1024, textChars: 100_000, files: 8, pdfPages: 200, imagePixels: 12_000_000, outputBytes: 20 * 1024 * 1024, activeRuns: 2, wallMs: 120_000, attempts: 3 } as const;
export const documentWorkflows = ['text_pdf', 'document_pdf', 'pdf_optimize'] as const;
export type DocumentWorkflow = typeof documentWorkflows[number];
export type DocumentKind = 'text' | 'pdf' | 'png' | 'jpeg';
export const workflowLabels: Record<DocumentWorkflow, string> = { text_pdf: 'Text to PDF', document_pdf: 'Text or image to PDF', pdf_optimize: 'Optimize PDF' };
export const targetBytesSchema = z.number().int().min(1024).max(backgroundLimits.outputBytes);
export const pdfStyles = ['readable', 'compact'] as const;
export type PdfStyle = typeof pdfStyles[number];
const id = z.string().uuid();
export const agentDraftSchema = z.object({ id: id.optional(), expectedRevision: z.number().int().positive().optional(), name: z.string().trim().min(1).max(80), instructions: z.string().trim().max(2000), workflow: z.enum(documentWorkflows), style: z.enum(pdfStyles), targetBytes: targetBytesSchema.optional() }).strict().refine(v => !v.targetBytes || v.workflow === 'pdf_optimize', 'A size target applies only to PDF optimization.');
export type AgentDraft = z.infer<typeof agentDraftSchema>;
export interface BackgroundAgent { id: string; revision: number; name: string; instructions: string; workflow: DocumentWorkflow; style: PdfStyle; targetBytes?: number; archived: boolean; createdAt: number; updatedAt: number }
export const startRunSchema = z.object({ requestId: id, agentId: id.optional(), title: z.string().trim().min(1).max(120), text: z.string().max(backgroundLimits.textChars).optional(), fileIds: z.array(id).max(backgroundLimits.files).optional(), workflow: z.enum(documentWorkflows).optional(), targetBytes: targetBytesSchema.optional() }).strict().refine(v => !v.targetBytes || v.workflow === 'pdf_optimize', 'Choose PDF optimization for a size target.');
export type StartRunInput = z.infer<typeof startRunSchema>;
export const runControlSchema = z.object({ runId: id, expectedRevision: z.number().int().positive(), action: z.enum(['pause', 'resume', 'cancel', 'retry']) }).strict();
export type RunControl = z.infer<typeof runControlSchema>;
export const answerRunSchema = z.object({ runId: id, requestId: id, expectedRevision: z.number().int().positive(), approved: z.boolean().optional(), text: z.string().trim().min(1).max(backgroundLimits.textChars).optional(), fileIds: z.array(id).max(backgroundLimits.files).optional() }).strict();
export type RunAnswer = z.infer<typeof answerRunSchema>;
export interface BackgroundRequest { id: string; kind: 'input' | 'approval'; message: string; expiresAt: number | null; binding: string }
export interface OptimizationReport { inputBytes: number; candidateBytes: number; outputBytes: number; savedBytes: number; changed: boolean; targetBytes?: number; targetMet?: boolean }
export interface BackgroundArtifact { id: string; name: string; mediaType: 'application/pdf'; bytes: number; hash: string; pages: number; optimization?: OptimizationReport }
export interface BackgroundRun { id: string; agentId: string | null; agentName: string; agentRevision: number; workflow?: DocumentWorkflow; targetBytes?: number; title: string; status: RunStatus; revision: number; generation: number; createdAt: number; updatedAt: number; message: string; inputs: string[]; completed: number; total: number; attempts: number; request: BackgroundRequest | null; artifacts: BackgroundArtifact[]; modelCalls: number; parentId: string | null }
export interface BackgroundEvent { sequence: number; at: number; type: string; message: string }
export interface BackgroundSnapshot { agents: BackgroundAgent[]; runs: BackgroundRun[]; paused: boolean }
export interface BackgroundDetail { run: BackgroundRun; events: BackgroundEvent[] }
export interface BackgroundFile { id: string; name: string; bytes: number; kind?: DocumentKind }
export interface BackgroundHealth { pdf: { available: boolean; engine: string; version: string; formats: string[] }; documents?: { available: boolean; engine: string; version: string; formats: string[]; message: string }; office: { available: boolean; engine: string; message: string }; browser: { engine: string; version: string; automation: false } }
export interface BackgroundResult { ok: boolean; error?: string; runId?: string; agentId?: string }
export const backgroundIdSchema = id;
