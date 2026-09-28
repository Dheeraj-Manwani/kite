import type { SecretId } from '../../shared/types';
export class MissingKeyError extends Error {
  constructor(public provider: SecretId) { super('Missing provider key'); }
}
/** Never forward raw SDK errors: they can contain request headers or bodies. */
export function friendlyError(error: unknown, provider?: SecretId): { text: string; settings?: boolean } {
  const name = provider === 'groq' ? 'Groq' : provider === 'moonshot' ? 'Moonshot' : provider ?? 'The provider';
  if (error instanceof MissingKeyError) return {
    text: error.provider === 'groq' ? 'I need a Groq key to hear you. Open settings?' : `I need a ${error.provider} key to reply. Open settings?`,
    settings: true,
  };
  const status = typeof error === 'object' && error !== null && 'statusCode' in error ? error.statusCode : undefined;
  if (status === 401 || status === 403) return { text: `${name} did not accept the key or denied access. Check the key in settings.`, settings: true };
  if (status === 404) return { text: `${name} cannot access the configured model. The model may be unavailable or not enabled for this account.`, settings: true };
  if (status === 402) return { text: `${name} reported a billing or credit problem. Check that provider’s API account balance.`, settings: true };
  if (status === 400) return { text: `${name} rejected the request format. The configured model or audio format may need updating.` };
  if (status === 429) return { text: `${name} is being rate-limited. Please try again shortly.` };
  return { text: 'I couldn’t finish that request. Check your connection and provider settings, then try again.', settings: true };
}
