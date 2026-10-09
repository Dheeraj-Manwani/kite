import { z } from 'zod';

export const mailLimits = { messages: 20, excerptChars: 4000, bodyChars: 6000, responseBytes: 2 * 1024 * 1024, attachments: 8, attachmentBytes: 5 * 1024 * 1024, attachmentTotalBytes: 16 * 1024 * 1024, requestMs: 20_000 } as const;
export const mailOptionsSchema = z.object({ accountId: z.string().uuid(), query: z.string().trim().min(1).max(500).default('in:inbox newer_than:7d'), maxMessages: z.number().int().min(1).max(mailLimits.messages).default(10), includeAttachments: z.boolean().default(false) }).strict();
export type MailOptions = z.infer<typeof mailOptionsSchema>;
export interface MailAccount { id: string; provider: 'gmail'; email: string; revision: number; status: 'connected' | 'reconnect' | 'disconnected' }
export interface MailConnectionState { configured: boolean; connecting: boolean; accounts: MailAccount[] }
export interface BoundMailOptions extends MailOptions { accountRevision: number; email: string }
export interface MailAttachment { messageId: string; partId: string; attachmentId?: string; filename: string; bytes: number; eligible: boolean; reason?: string }
export interface MailMessage { id: string; threadId: string; subject: string; sender: string; receivedAt: number; excerpt: string; attachments: MailAttachment[] }
export interface InboxBriefing { accountId: string; email: string; query: string; fetchedAt: number; messages: MailMessage[]; moreMatches: boolean; missingMessages: number; selectedAttachments: MailAttachment[]; skippedAttachments: number }
