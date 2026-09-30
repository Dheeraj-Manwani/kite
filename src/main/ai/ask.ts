import type { ToolSession } from '../tools/registry';
import { runAgentLoop } from './agentLoop';
import { streamText } from 'ai';
import { getModel } from './providers';
import { buildSystemPrompt } from './systemPrompt';
import { describeModel } from './catalog';
import type { ChatMessage } from './conversation';
import type { ModelEntry } from '../../shared/types';
export function providerOptionsFor(model: ModelEntry) {
  return model.provider === 'openai' ? { openai: { store: false,
    ...(/^gpt-6-(sol|luna)$/.test(model.id) ? { reasoningEffort: 'none' } : model.id === 'gpt-6-astra' ? { reasoningEffort: 'low' } : {}),
  } } : undefined;
}
export async function ask(messages: ChatMessage[], key: string, abortSignal: AbortSignal, onDelta: (text: string) => void,
  model: ModelEntry = describeModel({ provider: 'moonshot', id: 'kimi-k2.6' }), session?: ToolSession, context?: string): Promise<string> {
  const providerOptions = providerOptionsFor(model);
  if (model.supportsTools && session) return runAgentLoop({ model: getModel(model.provider, model.id, { getKey: () => key }), system: buildSystemPrompt(model, context), messages, signal: abortSignal, onDelta, session, providerOptions });
  const result = streamText({ onError: () => undefined,
    model: getModel(model.provider, model.id, { getKey: () => key }), system: buildSystemPrompt(model, context), messages,
    abortSignal, maxRetries: 0, maxOutputTokens: 1200,
    providerOptions,
  });
  let text = '';
  for await (const part of result.fullStream) {
    if (part.type === 'error') throw part.error;
    if (part.type === 'text-delta') { text += part.text; onDelta(part.text); }
  }
  if (abortSignal.aborted) throw new DOMException('Aborted', 'AbortError');
  if (!text.trim()) throw new Error('The provider returned no reply.');
  return text;
}
