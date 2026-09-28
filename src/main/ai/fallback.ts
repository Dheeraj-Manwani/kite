export function retryableBeforeToken(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { statusCode?: number; status?: number; name?: string; code?: string; cause?: unknown };
  if (e.name === 'AbortError') return false;
  const status = e.statusCode ?? e.status;
  if (status !== undefined) return status === 429 || (status >= 500 && status <= 599);
  return ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'].includes(e.code ?? '')
    || (e instanceof TypeError && /fetch|network/i.test(e.message)) || (!!e.cause && retryableBeforeToken(e.cause));
}
export async function withFallback<T>(primary: () => Promise<T>, fallback: () => Promise<T>, hasToken: () => boolean, enabled: boolean, signal: AbortSignal, onFallback: () => void): Promise<T> {
  try { return await primary(); }
  catch (error) {
    if (!enabled || signal.aborted || hasToken() || !retryableBeforeToken(error)) throw error;
    onFallback(); return fallback();
  }
}
