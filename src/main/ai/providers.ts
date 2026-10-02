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
    // includeUsage: streamed replies end with token counts (the whiteboard lesson log and harness read them).
    case 'moonshot': return createOpenAICompatible({ name: 'moonshot', baseURL: 'https://api.moonshot.ai/v1', apiKey, includeUsage: true,
      transformRequestBody: body => ['kimi-k2.5', 'kimi-k2.6'].includes(modelId) ? ({ ...body, thinking: { type: 'disabled' } }) : body,
    })(modelId);
    // Thinking is on by default and then needs reasoning_content sent back on every tool follow-up, or the API returns 400.
    case 'deepseek': return createOpenAICompatible({ name: 'deepseek', baseURL: 'https://api.deepseek.com', apiKey, includeUsage: true,
      transformRequestBody: body => ({ ...body, thinking: { type: 'disabled' } }),
    })(modelId);
    default: throw new Error('Unsupported provider');
  }
}
