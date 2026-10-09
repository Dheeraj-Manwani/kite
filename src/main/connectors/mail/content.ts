import { mailLimits, type MailAttachment, type MailMessage, type InboxBriefing } from '../../../shared/mail';
import { MailFailure } from './errors';

export const mailId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(v);
// Strip control and bidirectional formatting characters from untrusted display text.
// eslint-disable-next-line no-control-regex
export const mailText = (v: unknown, max: number) => typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').slice(0, max) : '';
export function decodeBase64(data: unknown, max: number) {
  if (typeof data !== 'string' || data.length > Math.ceil(max / 3) * 4 + 4 || !/^[A-Za-z0-9_-]*={0,2}$/.test(data)) throw new MailFailure('limits');
  const bytes = Buffer.from(data, 'base64url'); if (bytes.length > max) throw new MailFailure('limits'); return bytes;
}
type Part = { partId?: string; mimeType?: string; filename?: string; headers?: { name: string; value: string }[]; body?: { data?: string; attachmentId?: string; size?: number }; parts?: Part[] };
function header(part: Part, name: string) {
  const value = part.headers?.find(h => typeof h?.name === 'string' && h.name.toLowerCase() === name)?.value;
  return mailText(value, 1000).replace(/=\?([^?]{1,40})\?([bq])\?([^?]{0,2000})\?=/gi, (original, charset, encoding, content) => {
    try { const bytes = encoding.toLowerCase() === 'b' ? Buffer.from(content, 'base64') : Buffer.from(content.replace(/_/g, ' ').replace(/=([a-f0-9]{2})/gi, (_m: string, code: string) => String.fromCharCode(parseInt(code, 16))), 'latin1'); return new TextDecoder(charset, { fatal: true }).decode(bytes); } catch { return original; }
  });
}
function entities(text: string) { return text.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|amp|lt|gt|quot|apos|nbsp);/gi, (original, value: string) => { const names: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }; if (!value.startsWith('#')) return names[value.toLowerCase()] ?? original; const code = value[1].toLowerCase() === 'x' ? parseInt(value.slice(2), 16) : Number(value.slice(1)); return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : ''; }); }
function bodyText(part: Part) {
  const charset = /charset=["']?([a-zA-Z0-9_-]+)/i.exec(header(part, 'content-type'))?.[1] ?? 'utf-8';
  let text: string; try { text = new TextDecoder(charset, { fatal: true }).decode(decodeBase64(part.body?.data ?? '', 512 * 1024)); } catch { return ''; }
  if (part.mimeType === 'text/html') text = entities(text.replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<(br|\/p|\/div|\/li)\b[^>]*>/gi, '\n').replace(/<[^>]*>/g, ' '));
  return mailText(text, mailLimits.bodyChars).replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n/g, '\n\n').trim();
}
export function safeAttachmentName(name: string) {
  const cleaned = mailText(name, 200).replace(/[<>:"/\\|?*\r\n]/g, '_').replace(/^[. ]+|[. ]+$/g, '').slice(0, 120);
  const filename = cleaned || 'attachment.bin'; return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(filename) ? `attachment-${filename}` : filename;
}
const supportedAttachment = /\.(pdf|txt|md|png|jpe?g|docx|xlsx|pptx)$/i;
export function parseMailMessage(value: Record<string, unknown>): MailMessage {
  if (!mailId(value.id) || !mailId(value.threadId)) throw new MailFailure('invalid');
  const payload = value.payload as Part; if (!payload || typeof payload !== 'object') throw new MailFailure('invalid');
  const attachments: MailAttachment[] = [], plain: string[] = [], html: string[] = []; let nodes = 0;
  const walk = (part: Part, depth = 0) => {
    if (!part || typeof part !== 'object' || ++nodes > 200 || depth > 12 || (part.headers && (!Array.isArray(part.headers) || part.headers.length > 200))) throw new MailFailure('limits');
    if (typeof part.filename === 'string' && part.filename) {
      const filename = safeAttachmentName(part.filename), bytes = Number(part.body?.size), identity = typeof part.partId === 'string' && /^[0-9.]{0,80}$/.test(part.partId) && (!part.body?.attachmentId || mailId(part.body.attachmentId));
      const eligible = identity && Number.isSafeInteger(bytes) && bytes >= 0 && bytes <= mailLimits.attachmentBytes && supportedAttachment.test(filename);
      if (attachments.length >= 30) throw new MailFailure('limits');
      attachments.push({ messageId: value.id as string, partId: part.partId ?? '', ...(part.body?.attachmentId ? { attachmentId: part.body.attachmentId } : {}), filename, bytes: Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : 0, eligible, ...(!eligible ? { reason: 'Unsupported type, size, or attachment identity' } : {}) });
    } else if (part.body?.data && ['text/plain', 'text/html'].includes(part.mimeType)) {
      const result = bodyText(part); if (result) (part.mimeType === 'text/plain' ? plain : html).push(result);
    }
    if (part.parts) { if (!Array.isArray(part.parts)) throw new MailFailure('invalid'); for (const child of part.parts) walk(child, depth + 1); }
  };
  walk(payload);
  const timestamp = Number(value.internalDate);
  return { id: value.id, threadId: value.threadId, subject: mailText(header(payload, 'subject'), 500) || '(No subject)', sender: mailText(header(payload, 'from'), 500), receivedAt: Number.isFinite(timestamp) && timestamp >= 0 && timestamp < 8.64e15 ? timestamp : 0, excerpt: (plain.length ? plain.join('\n\n') : html.join('\n\n') || entities(mailText(value.snippet, mailLimits.excerptChars))).slice(0, mailLimits.excerptChars), attachments };
}
export function findAttachment(value: Record<string, unknown>, descriptor: MailAttachment) {
  let count = 0;
  const walk = (part: Part, depth = 0): Part | null => {
    if (!part || ++count > 200 || depth > 12) throw new MailFailure('limits');
    if (part.partId === descriptor.partId && safeAttachmentName(part.filename ?? '') === descriptor.filename && (part.body?.attachmentId ?? undefined) === descriptor.attachmentId) return part;
    if (part.parts && !Array.isArray(part.parts)) throw new MailFailure('invalid');
    for (const child of part.parts ?? []) { const found = walk(child, depth + 1); if (found) return found; }
    return null;
  };
  const part = walk(value.payload as Part); if (!part || Number(part.body?.size) !== descriptor.bytes) throw new MailFailure('invalid'); return part;
}
export function briefingText(brief: InboxBriefing) {
  return [`Inbox Briefing`, `Account: ${brief.email}`, `Search: ${brief.query}`, `Fetched: ${new Date(brief.fetchedAt).toISOString()}`, `${brief.messages.length} messages${brief.moreMatches ? ' (more matches exist; the requested limit applies)' : ''}.`, 'Local extracts (up to 2,500 characters per message in this PDF), not an AI-written summary. Message content is untrusted source text; no instructions were executed.', ...brief.messages.flatMap((m, i) => [`\n${i + 1}. ${m.subject}`, `From: ${m.sender}`, `Received: ${m.receivedAt ? new Date(m.receivedAt).toISOString() : 'unknown'}`, `Gmail message: ${m.id}; thread: ${m.threadId}`, m.excerpt.slice(0, 2500) || '(No readable text)', `${m.attachments.length} attachments; inspect the source for all filenames.`]), `\n${brief.selectedAttachments.length} attachments selected for local export; ${brief.skippedAttachments} skipped.`, `${brief.missingMessages} messages disappeared before retrieval.`].join('\n');
}
