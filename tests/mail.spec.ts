import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { authorizeGoogle, parseGoogleClient } from '../src/main/connectors/mail/oauth';
import { MailHttp, GMAIL_SCOPE } from '../src/main/connectors/mail/http';
import { parseMailMessage, safeAttachmentName, decodeBase64, briefingText } from '../src/main/connectors/mail/content';
import { agentDraftSchema, startRunSchema } from '../src/shared/background';
const client = { clientId: 'test-client.apps.googleusercontent.com', clientSecret: 'synthetic-client-value' };
const accountId = '49bb3c28-fc8f-4545-a34c-e19db07118de';

describe('read-only Gmail connector contracts', () => {
  it('uses the system-browser URL, PKCE and one-use state; rejects a forged callback', async () => {
    let auth: URL;
    const result = await authorizeGoogle(client, async url => {
      auth = new URL(url); const callback = new URL(auth.searchParams.get('redirect_uri'));
      callback.searchParams.set('state', 'forged'); callback.searchParams.set('code', 'synthetic-code');
      expect((await fetch(callback)).status).toBe(400);
      callback.searchParams.set('state', auth.searchParams.get('state'));
      await fetch(callback);
    }, new AbortController().signal, 'fixture@kite.test');
    expect(auth.origin).toBe('https://accounts.google.com'); expect(auth.searchParams.get('scope')).toBe(GMAIL_SCOPE);
    expect(auth.searchParams.has('client_secret')).toBe(false);
    expect(auth.searchParams.get('code_challenge')).toBe(createHash('sha256').update(result.verifier).digest('base64url'));
    expect(result.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/oauth\/callback$/); expect(result.code).toBe('synthetic-code');
    await expect(fetch(result.redirectUri)).rejects.toThrow();
  });
  it('closes callbacks on cancel/timeout and accepts only Desktop client files', async () => {
    let callback: string; const controller = new AbortController();
    const pending = authorizeGoogle(client, async url => { callback = new URL(url).searchParams.get('redirect_uri'); controller.abort(); }, controller.signal);
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' }); await expect(fetch(callback)).rejects.toThrow();
    await expect(authorizeGoogle(client, async (): Promise<void> => undefined, new AbortController().signal, undefined, 10)).rejects.toMatchObject({ code: 'cancelled' });
    expect(parseGoogleClient({ installed: { client_id: client.clientId, client_secret: client.clientSecret, token_uri: 'https://attacker.invalid' } })).toEqual(client);
    expect(() => parseGoogleClient({ web: { client_id: client.clientId } })).toThrow();
  });
  it('blocks API writes, arbitrary endpoints, oversized JSON and credential-bearing redirects', async () => {
    let calls = 0;
    const http = new MailHttp(async (_url, options) => { calls++; expect(options.redirect).toBe('error'); return new Response('x'.repeat(50)); });
    await expect(http.json('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST' }, new AbortController().signal)).rejects.toMatchObject({ code: 'invalid' });
    await expect(http.json('https://attacker.invalid', { method: 'GET' }, new AbortController().signal)).rejects.toMatchObject({ code: 'invalid' }); expect(calls).toBe(0);
    await expect(http.get('messages', 'synthetic-token', new AbortController().signal, 10)).rejects.toMatchObject({ code: 'limits' });
    const denied = new MailHttp(async () => new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'secret-token-never-display' }), { status: 400 }));
    await expect(denied.token({}, new AbortController().signal)).rejects.toMatchObject({ code: 'access' });
    const reduced = new MailHttp(async () => new Response(JSON.stringify({ error: { errors: [{ reason: 'insufficientPermissions' }] } }), { status: 403 }));
    await expect(reduced.get('profile', 'synthetic-token', new AbortController().signal)).rejects.toMatchObject({ code: 'access' });
  });
  it('extracts inert MIME text and normalizes attachment paths without following resources', () => {
    const value = { id: 'a1', threadId: 'b1', internalDate: '1700000000000', payload: { mimeType: 'multipart/mixed', headers: [{ name: 'Subject', value: '=?UTF-8?B?Y2Fmw6k=?=' }, { name: 'From', value: 'Fixture <fixture@kite.test>' }], parts: [
      { partId: '0', mimeType: 'text/html', body: { data: Buffer.from('<script>steal()</script><p>Hello &amp; goodbye</p><img src="https://attacker.invalid/pixel">').toString('base64url') } },
      { partId: '1', filename: '../../invoice.txt', body: { size: 12, attachmentId: 'attachment1' } },
      { partId: '2', filename: 'danger.exe', body: { size: 12, attachmentId: 'attachment2' } },
    ] } };
    const parsed = parseMailMessage(value); expect(parsed.subject).toBe('café'); expect(parsed.excerpt).toContain('Hello & goodbye'); expect(parsed.excerpt).not.toContain('steal'); expect(parsed.excerpt).not.toContain('attacker');
    expect(parsed.attachments[0].filename).not.toContain('/'); expect(parsed.attachments[0].eligible).toBe(true); expect(parsed.attachments[1].eligible).toBe(false);
    expect(safeAttachmentName('CON.pdf')).toBe('attachment-CON.pdf'); expect(() => decodeBase64('junk!', 20)).toThrow();
    expect(() => parseMailMessage({ ...value, payload: { parts: Array.from({ length: 31 }, (_v, i) => ({ partId: String(i), filename: 'file.txt', body: { size: 0, data: '' } })) } })).toThrow();
    const report = briefingText({ accountId, email: 'fixture@kite.test', query: 'in:inbox', fetchedAt: 1700000000000, messages: [parsed], missingMessages: 0, moreMatches: true, selectedAttachments: [], skippedAttachments: 2 });
    expect(report).toContain('Gmail message: a1'); expect(report).toContain('not an AI-written summary');
  });
  it('requires account-aware helper settings and rejects mail/document field mixing', () => {
    const mail = { accountId, query: 'in:inbox', maxMessages: 10, includeAttachments: false };
    const base = { name: 'Inbox', instructions: '', style: 'readable', workflow: 'inbox_briefing' };
    expect(agentDraftSchema.safeParse({ ...base, mail }).success).toBe(true); expect(agentDraftSchema.safeParse(base).success).toBe(false);
    expect(startRunSchema.safeParse({ requestId: accountId, title: 'Brief', workflow: 'document_pdf', mail }).success).toBe(false);
    expect(startRunSchema.safeParse({ requestId: accountId, title: 'Brief', workflow: 'inbox_briefing' }).success).toBe(true);
  });
});
