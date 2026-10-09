import { createServer } from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import type { GoogleClient } from './store';
import { GMAIL_SCOPE } from './http';
import { MailFailure } from './errors';

export function parseGoogleClient(value: unknown): GoogleClient {
  const installed = (value as { installed?: Record<string, unknown> })?.installed;
  if (!installed || typeof installed.client_id !== 'string' || !/^[A-Za-z0-9._-]{5,220}\.apps\.googleusercontent\.com$/.test(installed.client_id) || (installed.client_secret !== undefined && (typeof installed.client_secret !== 'string' || installed.client_secret.length > 512))) throw new MailFailure('setup');
  return { clientId: installed.client_id, ...(installed.client_secret ? { clientSecret: installed.client_secret as string } : {}) };
}

/** One use, local-only callback with state + PKCE. Authentication occurs in the system browser. */
export async function authorizeGoogle(client: GoogleClient, openBrowser: (url: string) => Promise<void>, signal: AbortSignal, email?: string, timeoutMs = 5 * 60_000) {
  const state = randomBytes(32).toString('base64url'), verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const server = createServer(); server.headersTimeout = 10_000; server.requestTimeout = 10_000;
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address(); if (!address || typeof address === 'string') throw new MailFailure('network');
  const redirectUri = `http://127.0.0.1:${address.port}/oauth/callback`;
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  for (const [key, value] of Object.entries({ client_id: client.clientId, response_type: 'code', redirect_uri: redirectUri, scope: GMAIL_SCOPE, state, code_challenge: challenge, code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent select_account', ...(email ? { login_hint: email } : {}) })) url.searchParams.set(key, value);
  try {
    return await new Promise<{ code: string; verifier: string; redirectUri: string }>((resolve, reject) => {
      let used = false;
      const finish = (error?: Error, code?: string) => { if (used) return; used = true; clearTimeout(timer); signal.removeEventListener('abort', cancel); if (error) reject(error); else resolve({ code, verifier, redirectUri }); };
      const cancel = () => finish(new MailFailure('cancelled')), timer = setTimeout(cancel, timeoutMs);
      signal.addEventListener('abort', cancel, { once: true });
      server.on('request', (req, res) => {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
        if (used || req.method !== 'GET' || req.headers.host !== `127.0.0.1:${address.port}` || !req.url || req.url.length > 8192) { res.writeHead(400); res.end('Invalid callback.'); return; }
        let callback: URL; try { callback = new URL(req.url, redirectUri); } catch { res.writeHead(400); res.end('Invalid callback.'); return; }
        const returnedState = callback.searchParams.getAll('state');
        if (callback.origin !== new URL(redirectUri).origin || callback.pathname !== '/oauth/callback' || returnedState.length !== 1 || Buffer.byteLength(returnedState[0]) !== state.length || !timingSafeEqual(Buffer.from(returnedState[0]), Buffer.from(state))) { res.writeHead(400); res.end('Invalid callback.'); return; }
        const codes = callback.searchParams.getAll('code');
        if (callback.searchParams.has('error') || codes.length !== 1 || !codes[0] || codes[0].length > 4096) { res.writeHead(400); res.end('Connection cancelled. Return to Kite.'); finish(new MailFailure('cancelled')); return; }
        res.end('Authorization received. Return to Kite. You can close this browser tab.'); finish(undefined, codes[0]);
      });
      if (signal.aborted) cancel(); else void openBrowser(url.href).catch(() => finish(new MailFailure('network')));
    });
  } finally { server.closeAllConnections(); server.close(); }
}
