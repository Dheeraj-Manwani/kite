import type { ModelEntry, ModelSelection, ProviderId } from '../../shared/types';
export const providerLabels: Record<ProviderId, string> = { openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google Gemini', groq: 'Groq', moonshot: 'Moonshot', deepseek: 'DeepSeek' };
export const providerIds = Object.keys(providerLabels) as ProviderId[];
// Verified against provider documentation on 2026-09-28. See docs/models.md.
export const catalog: ModelEntry[] = [
  { provider: 'moonshot', id: 'kimi-k2.5', label: 'Kimi K2.5', supportsVision: true, supportsTools: true, tier: 'flagship' },
  { provider: 'groq', id: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout', supportsVision: true, supportsTools: true, tier: 'fast' },
  { provider: 'openai', id: 'gpt-6-astra', label: 'GPT-6 Astra', supportsVision: true, supportsTools: true, tier: 'flagship' },
  { provider: 'openai', id: 'gpt-6-sol', label: 'GPT-6 Sol', supportsVision: true, supportsTools: true, tier: 'fast' },
  { provider: 'openai', id: 'gpt-6-luna', label: 'GPT-6 Luna', supportsVision: true, supportsTools: true, tier: 'budget' },
  { provider: 'anthropic', id: 'claude-opus-5-5', label: 'Claude Opus 5.5', supportsVision: true, supportsTools: true, tier: 'flagship' },
  { provider: 'anthropic', id: 'claude-sonnet-5', label: 'Claude Sonnet 5', supportsVision: true, supportsTools: true, tier: 'fast' },
  { provider: 'anthropic', id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', supportsVision: true, supportsTools: true, tier: 'budget' },
  { provider: 'google', id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (preview)', supportsVision: true, supportsTools: true, tier: 'flagship' },
  { provider: 'google', id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', supportsVision: true, supportsTools: true, tier: 'fast' },
  { provider: 'google', id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', supportsVision: true, supportsTools: true, tier: 'budget' },
  { provider: 'groq', id: 'openai/gpt-oss-120b', label: 'GPT OSS 120B', supportsVision: false, supportsTools: true, tier: 'flagship' },
  { provider: 'groq', id: 'openai/gpt-oss-20b', label: 'GPT OSS 20B', supportsVision: false, supportsTools: true, tier: 'fast' },
  { provider: 'groq', id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B', supportsVision: false, supportsTools: true, tier: 'budget' },
  { provider: 'moonshot', id: 'kimi-k3', label: 'Kimi K3', supportsVision: true, supportsTools: true, tier: 'flagship' },
  { provider: 'moonshot', id: 'kimi-k2.6', label: 'Kimi K2.6', supportsVision: true, supportsTools: true, tier: 'fast' },
  { provider: 'moonshot', id: 'kimi-k2.7-code-highspeed', label: 'Kimi K2.7 Code Highspeed', supportsVision: true, supportsTools: true, tier: 'fast' },
  // Verified against DeepSeek's documentation and live API on 2026-10-01.
  { provider: 'deepseek', id: 'deepseek-flash', label: 'DeepSeek Flash', supportsVision: true, supportsTools: true, tier: 'fast' },
  { provider: 'deepseek', id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', supportsVision: false, supportsTools: true, tier: 'flagship' },
];
/** What each provider's API accepts, so call sites ask the catalog instead of naming providers. */
export interface ProviderTraits {
  /** Accepts `toolChoice: 'required'`. Moonshot's OpenAI-compatible API does not. */
  requiredToolChoice: boolean;
  /** Takes images inside tool results; otherwise images follow as a user message. */
  imageToolResults: boolean;
}
export const providerTraits: Record<ProviderId, ProviderTraits> = {
  openai: { requiredToolChoice: true, imageToolResults: true },
  anthropic: { requiredToolChoice: true, imageToolResults: true },
  google: { requiredToolChoice: true, imageToolResults: true },
  groq: { requiredToolChoice: true, imageToolResults: false },
  moonshot: { requiredToolChoice: false, imageToolResults: false },
  deepseek: { requiredToolChoice: true, imageToolResults: false },
};
export function describeModel(model: ModelSelection, models = catalog): ModelEntry {
  return models.find(m => m.provider === model.provider && m.id === model.id)
    ?? { ...model, label: model.id, supportsVision: false, supportsTools: false, tier: 'fast' };
}
export function mergeCatalog(base: ModelEntry[], entries: ModelEntry[]) {
  const map = new Map(base.map(m => [m.provider + ':' + m.id, m]));
  for (const model of entries) if (!map.has(model.provider + ':' + model.id)) map.set(model.provider + ':' + model.id, model);
  return [...map.values()];
}
