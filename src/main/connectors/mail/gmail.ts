import { randomUUID } from 'node:crypto';
import type { BoundMailOptions, InboxBriefing, MailAttachment, MailConnectionState, MailAccount } from '../../../shared/mail';
import { mailLimits } from '../../../shared/mail';
import { MailStore, publicAccount, type StoredMailAccount } from './store';
import { authorizeGoogle, parseGoogleClient } from './oauth';
import { MailHttp, GMAIL_SCOPE, MissingMailMessage } from './http';
import { MailFailure } from './errors';
import { decodeBase64, findAttachment, mailId, parseMailMessage } from './content';

const emailOf = (value: unknown) => { if (typeof value !== 'string' || !/^[^\s<>@]{1,100}@[^\s<>@]{1,150}$/.test(value)) throw new MailFailure('invalid'); return value.toLowerCase(); };
function tokenData(value: Record<string, unknown>, refresh = false) {
  if (typeof value.access_token !== 'string' || !value.access_token || value.access_token.length > 8192 || value.token_type !== 'Bearer' || !Number.isFinite(value.expires_in) || Number(value.expires_in) < 1 || Number(value.expires_in) > 86400) throw new MailFailure('invalid');
  const scopes = typeof value.scope === 'string' ? value.scope.split(/\s+/).filter(Boolean) : [];
  if ((!refresh || scopes.length) && (scopes.length !== 1 || scopes[0] !== GMAIL_SCOPE)) throw new MailFailure('scope');
  if (!refresh && (typeof value.refresh_token !== 'string' || !value.refresh_token || value.refresh_token.length > 8192)) throw new MailFailure('access');
  return { access: value.access_token, expiresAt: Date.now() + Number(value.expires_in) * 1000, refresh: typeof value.refresh_token === 'string' && value.refresh_token.length <= 8192 ? value.refresh_token : undefined };
}
export interface MailConnector {
  account(id: string): MailAccount | null;
  brief(options: BoundMailOptions, signal: AbortSignal): Promise<InboxBriefing>;
  attachment(options: BoundMailOptions, attachment: MailAttachment, signal: AbortSignal): Promise<Uint8Array>;
}
export class GmailConnector implements MailConnector {
  private tokens = new Map<string, { access: string; expiresAt: number }>();
  private refreshes = new Map<string, Promise<string>>();
  private connecting?: { controller: AbortController; done: Promise<MailAccount> };
  private requests = new Map<string, Set<AbortController>>();
  private closed = false;
  constructor(private store: MailStore, private openBrowser: (url: string) => Promise<void>, private changed: (id?: string) => void, private http = new MailHttp()) {}
  state(): MailConnectionState { return { configured: !!this.store.client(), connecting: !!this.connecting, accounts: this.store.accounts().map(publicAccount) }; }
  account(id: string) { const value = this.store.account(id); return value ? publicAccount(value) : null; }
  configure(value: unknown) { if (this.connecting || this.store.accounts().some(a => a.status !== 'disconnected')) throw new MailFailure('setup'); this.store.configure(parseGoogleClient(value)); this.changed(); }
  async connect(id?: string, revision?: number) {
    if (this.closed || this.connecting) throw new MailFailure('cancelled');
    const previous = id ? this.store.account(id) : null;
    if (id && (!previous || previous.revision !== revision)) throw new MailFailure('account');
    const client = this.store.client() ?? previous?.client; if (!client) throw new MailFailure('setup');
    if ((!previous || previous.status === 'disconnected') && this.store.accounts().filter(a => a.status !== 'disconnected').length >= 5) throw new MailFailure('limits');
    const controller = new AbortController();
    const done = Promise.resolve().then(async () => {
      const authorization = await authorizeGoogle(client, this.openBrowser, controller.signal, previous?.email);
      const result = tokenData(await this.http.token({ client_id: client.clientId, ...(client.clientSecret ? { client_secret: client.clientSecret } : {}), code: authorization.code, code_verifier: authorization.verifier, redirect_uri: authorization.redirectUri, grant_type: 'authorization_code' }, controller.signal));
      const email = emailOf((await this.http.get('profile', result.access, controller.signal)).emailAddress);
      controller.signal.throwIfAborted();
      if (previous && (email !== previous.email || this.store.account(previous.id)?.revision !== previous.revision)) throw new MailFailure('account');
      const existing = previous ?? this.store.accounts().find(a => a.email === email);
      const account: StoredMailAccount = { id: existing?.id ?? randomUUID(), provider: 'gmail', email, revision: (existing?.revision ?? 0) + 1, status: 'connected', client, refreshToken: result.refresh, createdAt: existing?.createdAt ?? Date.now() };
      this.abortAccount(account.id); this.store.save(account); this.tokens.set(account.id, result); this.changed(account.id); return publicAccount(account);
    });
    this.connecting = { controller, done }; this.changed();
    try { return await done; } finally { this.connecting = undefined; this.changed(); }
  }
  cancelConnect() { this.connecting?.controller.abort(); }
  private abortAccount(id: string) { for (const controller of this.requests.get(id) ?? []) controller.abort(); this.tokens.delete(id); }
  private invalidate(id: string, revision: number) { const account = this.store.account(id); if (!account || account.status !== 'connected' || account.revision !== revision) return; this.abortAccount(id); this.store.save({ ...account, status: 'reconnect', refreshToken: undefined, revision: account.revision + 1 }); this.changed(id); }
  async disconnect(id: string, revision: number) {
    const account = this.store.account(id); if (!account || account.revision !== revision) throw new MailFailure('account');
    this.cancelConnect(); this.abortAccount(id); this.store.save({ ...account, status: 'disconnected', refreshToken: undefined, revision: account.revision + 1 }); this.changed(id);
    const revoked = account.refreshToken ? await this.http.revoke(account.refreshToken, new AbortController().signal) : false;
    return { revoked }; // Local disconnect happens even if Google is unavailable.
  }
  private bound(options: BoundMailOptions) {
    const account = this.store.account(options.accountId);
    if (this.closed || !account || account.status !== 'connected' || account.revision !== options.accountRevision || account.email !== options.email || !account.refreshToken) throw new MailFailure('access'); return account;
  }
  private async access(account: StoredMailAccount) {
    const cached = this.tokens.get(account.id); if (cached && cached.expiresAt > Date.now() + 60_000) return cached.access;
    const refreshId = `${account.id}:${account.revision}`, existing = this.refreshes.get(refreshId); if (existing) return existing;
    const promise = (async () => {
      try {
        const result = tokenData(await this.http.token({ client_id: account.client.clientId, ...(account.client.clientSecret ? { client_secret: account.client.clientSecret } : {}), refresh_token: account.refreshToken, grant_type: 'refresh_token' }, new AbortController().signal), true);
        if (this.closed || this.store.account(account.id)?.revision !== account.revision || this.store.account(account.id)?.status !== 'connected') throw new MailFailure('access');
        if (result.refresh) this.store.save({ ...account, refreshToken: result.refresh }); this.tokens.set(account.id, result); return result.access;
      } catch (error) { if (error instanceof MailFailure && ['access', 'scope'].includes(error.code)) this.invalidate(account.id, account.revision); throw error; }
    })();
    this.refreshes.set(refreshId, promise); try { return await promise; } finally { this.refreshes.delete(refreshId); }
  }
  private async withAccount<T>(options: BoundMailOptions, signal: AbortSignal, read: (get: (endpoint: string, maxBytes?: number) => Promise<Record<string, unknown>>) => Promise<T>) {
    const account = this.bound(options), controller = new AbortController(), stop = AbortSignal.any([signal, controller.signal]);
    const set = this.requests.get(account.id) ?? new Set(); set.add(controller); this.requests.set(account.id, set);
    try {
      const token = await this.access(account); stop.throwIfAborted(); this.bound(options);
      const get = async (endpoint: string, maxBytes?: number) => { this.bound(options); const data = await this.http.get(endpoint, token, stop, maxBytes); this.bound(options); return data; };
      if (emailOf((await get('profile')).emailAddress) !== options.email) { this.invalidate(account.id, account.revision); throw new MailFailure('account'); }
      const result = await read(get); stop.throwIfAborted(); this.bound(options); return result;
    } catch (error) {
      signal.throwIfAborted(); if (controller.signal.aborted) throw new MailFailure('access');
      if (error instanceof MailFailure && error.code === 'access') this.invalidate(account.id, account.revision); throw error;
    } finally { set.delete(controller); if (!set.size) this.requests.delete(account.id); }
  }
  brief(options: BoundMailOptions, signal: AbortSignal): Promise<InboxBriefing> {
    return this.withAccount(options, signal, async get => {
      const list = await get(`messages?${new URLSearchParams({ q: options.query, maxResults: String(options.maxMessages), includeSpamTrash: 'false' })}`);
      if (list.messages !== undefined && !Array.isArray(list.messages)) throw new MailFailure('invalid');
      const ids = [...new Set((list.messages as { id?: unknown }[] ?? []).map(m => m?.id))]; if (ids.length > options.maxMessages || ids.some(id => !mailId(id))) throw new MailFailure('limits');
      const messages = []; let missingMessages = 0;
      for (const id of ids as string[]) {
        try { const value = await get(`messages/${encodeURIComponent(id)}?format=full`); if (value.id !== id) throw new MailFailure('invalid'); messages.push(parseMailMessage(value)); }
        catch (error) { if (error instanceof MissingMailMessage) missingMessages++; else throw error; }
      }
      const selectedAttachments: MailAttachment[] = []; let total = 0, skippedAttachments = 0;
      for (const m of messages) for (const a of m.attachments) {
        if (options.includeAttachments && a.eligible && selectedAttachments.length < mailLimits.attachments && total + a.bytes <= mailLimits.attachmentTotalBytes) { selectedAttachments.push(a); total += a.bytes; } else skippedAttachments++;
      }
      return { accountId: options.accountId, email: options.email, query: options.query, fetchedAt: Date.now(), messages, moreMatches: !!list.nextPageToken, missingMessages, selectedAttachments, skippedAttachments };
    });
  }
  attachment(options: BoundMailOptions, descriptor: MailAttachment, signal: AbortSignal) {
    if (!options.includeAttachments || !descriptor.eligible || descriptor.bytes > mailLimits.attachmentBytes || !mailId(descriptor.messageId) || (descriptor.attachmentId && !mailId(descriptor.attachmentId))) throw new MailFailure('invalid');
    return this.withAccount(options, signal, async get => {
      const message = await get(`messages/${encodeURIComponent(descriptor.messageId)}?format=full`); if (message.id !== descriptor.messageId) throw new MailFailure('invalid');
      const part = findAttachment(message, descriptor);
      const body = descriptor.attachmentId ? await get(`messages/${encodeURIComponent(descriptor.messageId)}/attachments/${encodeURIComponent(descriptor.attachmentId)}`, Math.ceil(mailLimits.attachmentBytes / 3) * 4 + 1024) : part.body;
      const bytes = decodeBase64(body?.data, mailLimits.attachmentBytes); if (bytes.length !== descriptor.bytes || Number(body?.size) !== descriptor.bytes) throw new MailFailure('invalid'); return new Uint8Array(bytes);
    });
  }
  sourceUrl(email: string, threadId: string) { if (!mailId(threadId)) throw new MailFailure('invalid'); return `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(email)}#all/${encodeURIComponent(threadId)}`; }
  async close() { this.closed = true; this.cancelConnect(); for (const id of this.requests.keys()) this.abortAccount(id); await Promise.allSettled([...this.refreshes.values(), ...(this.connecting ? [this.connecting.done] : [])]); this.tokens.clear(); }
}
