import { VisionUnavailableError } from '../../shared/vision';
import type { SecretId } from '../../shared/types';
import { providerLabels } from '../ai/catalog';
export class MissingKeyError extends Error {
  constructor(public provider: SecretId) { super('Missing provider key'); }
}
/**
 * An error as Kite says it (docs/design.md UX-15): what happened as a one-line title, then what to do.
 * `settings` offers Open settings as the one action; `setup` marks something to configure rather than a failure.
 */
export interface FriendlyError { title: string; text: string; settings?: boolean; setup?: boolean }
const nameOf = (id: SecretId) => id === 'cartesia' ? 'Cartesia' : providerLabels[id] ?? id;
const withArticle = (name: string) => `${/^[AEIOU]/i.test(name) ? 'an' : 'a'} ${name}`;
/** Never forward raw SDK errors: they can contain request headers or bodies. */
export function friendlyError(error: unknown, provider?: SecretId): FriendlyError {
  if (error instanceof VisionUnavailableError) return { title: 'I need a vision model to see your screen', text: 'Pick a vision-capable model in Settings, then ask again.', settings: true, setup: true };
  if (error instanceof MissingKeyError) return error.provider === 'groq'
    ? { title: 'I need a Groq key to hear you', text: 'Add one in Settings, then hold your shortcut again.', settings: true, setup: true }
    : { title: `I need ${withArticle(nameOf(error.provider))} key to reply`, text: 'Add one in Settings, then ask again.', settings: true, setup: true };
  const name = provider ? nameOf(provider) : 'The provider';
  const status = typeof error === 'object' && error !== null && 'statusCode' in error ? error.statusCode : undefined;
  if (status === 401 || status === 403) return { title: `${name} didn’t accept the key`, text: 'Check or replace the key in Settings.', settings: true };
  if (status === 404) return { title: `${name} can’t reach the chosen model`, text: 'It may not be enabled for your account. Pick another model in Settings.', settings: true };
  if (status === 402) return { title: `${name} reported a billing problem`, text: 'Check the credit on that provider’s account, then try again.' };
  if (status === 400) return { title: `${name} rejected the request`, text: 'The model or audio format may need updating. Try another model in Settings.', settings: true };
  if (status === 429) return { title: `${name} is rate-limited right now`, text: 'Wait a moment, then try again.' };
  return { title: 'I couldn’t finish that', text: 'Check your connection and provider settings, then try again.', settings: true };
}
