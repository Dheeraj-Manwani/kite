import { mailLimits } from '../../../shared/mail';
import { MailFailure } from './errors';
export type MailFetch = (url: string, options: RequestInit) => Promise<Response>;
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
export const GOOGLE_REVOKE = 'https://oauth2.googleapis.com/revoke';
export const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me/';

/** No caller URLs, mail writes or redirects. Test transports are injected only through application constructors. */
export class MailHttp {
  constructor(private transport: MailFetch = (url, options) => fetch(url, options)) {}
  async json(url: string, options: RequestInit, signal: AbortSignal, maxBytes = mailLimits.responseBytes): Promise<Record<string, unknown>> {
    if (!(url.startsWith(GMAIL_BASE) && options.method === 'GET') && !([GOOGLE_TOKEN, GOOGLE_REVOKE].includes(url) && options.method === 'POST')) throw new MailFailure('invalid');
    const stop = AbortSignal.any([signal, AbortSignal.timeout(mailLimits.requestMs)]);
    try {
      const response = await this.transport(url, { ...options, redirect: 'error', signal: stop });
      if (response.status === 401) throw new MailFailure('access');
      if (response.status === 429) throw new MailFailure('rate');
      if (response.status === 404) throw new MissingMailMessage();
      if (Number(response.headers.get('content-length')) > maxBytes) throw new MailFailure('limits');
      const reader = response.body?.getReader(); if (!reader) throw new MailFailure('invalid');
      const chunks: Uint8Array[] = []; let size = 0;
      try { for (;;) { stop.throwIfAborted(); const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > maxBytes) throw new MailFailure('limits'); chunks.push(next.value); } }
      finally { await reader.cancel().catch((): void => undefined); }
      let result: Record<string, unknown>; try { result = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new MailFailure('invalid'); }
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new MailFailure('invalid');
      if (response.status === 403) {
        const details = result.error as { errors?: { reason?: string }[] };
        if (Array.isArray(details?.errors) && details.errors.some(e => e?.reason === 'insufficientPermissions' || e?.reason === 'authError')) throw new MailFailure('access');
        throw new MailFailure('provider');
      }
      if (!response.ok) throw new MailFailure(result.error === 'invalid_grant' ? 'access' : 'provider');
      return result;
    } catch (error) { signal.throwIfAborted(); if (error instanceof MailFailure || error instanceof MissingMailMessage) throw error; throw new MailFailure('network'); }
  }
  token(values: Record<string, string>, signal: AbortSignal) { return this.json(GOOGLE_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(values).toString() }, signal, 64 * 1024); }
  get(endpoint: string, token: string, signal: AbortSignal, maxBytes?: number) { return this.json(GMAIL_BASE + endpoint, { method: 'GET', headers: { Authorization: `Bearer ${token}` } }, signal, maxBytes); }
  async revoke(token: string, signal: AbortSignal) {
    // Google may return an empty response for successful revocation; use the same fixed endpoint/timeout fence.
    try { const response = await this.transport(GOOGLE_REVOKE, { method: 'POST', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(mailLimits.requestMs)]), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }).toString() }); await response.body?.cancel(); return response.ok; }
    catch { return false; }
  }
}
export class MissingMailMessage extends Error {}
