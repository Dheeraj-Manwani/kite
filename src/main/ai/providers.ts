import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { ProviderId } from '../../shared/types';
import { MissingKeyError } from '../voice/errors';
export { MissingKeyError } from '../voice/errors';
type Secrets = { getKey(provider: ProviderId): string | undefined };
let secrets: Secrets;
export function configureProviders(value: Secrets) { secrets = value; }
export function getModel(providerId: ProviderId, modelId: string, source: Secrets = secrets) {
  const apiKey = source?.getKey(providerId);
  if (!apiKey) throw new MissingKeyError(providerId);
  switch (providerId) {
    case 'openai': return createOpenAI({ apiKey })(modelId);
    case 'anthropic': return createAnthropic({ apiKey })(modelId);
    case 'google': return createGoogleGenerativeAI({ apiKey })(modelId);
    case 'groq': return createGroq({ apiKey })(modelId);
    case 'moonshot': return createOpenAICompatible({ name: 'moonshot', baseURL: 'https://api.moonshot.ai/v1', apiKey,
      transformRequestBody: body => modelId === 'kimi-k2.6' ? ({ ...body, thinking: { type: 'disabled' } }) : body,
    })(modelId);
    default: throw new Error('Unsupported provider');
  }
}
