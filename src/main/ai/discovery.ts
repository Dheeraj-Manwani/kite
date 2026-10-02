import { generateText } from 'ai';
import type { KeyStatus, ModelEntry, ProviderId, SecretId, VoiceChoice } from '../../shared/types';
import { catalog } from './catalog';
import { getModel } from './providers';
import { MissingKeyError } from '../voice/errors';
export const cartesiaVersion = '2026-08-14';
export function keyErrorStatus(error: unknown): KeyStatus {
  if (error instanceof MissingKeyError) return 'invalid key';
  const e = error as { statusCode?: number; status?: number };
  const status = e?.statusCode ?? e?.status;
  if (status === 401 || status === 403) return 'invalid key';
  if (status === 402 || status === 429) return 'no credit / rate-limited';
  if (status === 400 || status === 404) return 'model unavailable';
  return 'network error';
}
async function json(url: string, headers: Record<string, string>) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Object.assign(new Error('Provider request failed'), { statusCode: response.status });
  return response.json();
}
export async function listModels(provider: ProviderId, key: string): Promise<ModelEntry[]> {
  const urls: Record<ProviderId, string> = { openai: 'https://api.openai.com/v1/models', anthropic: 'https://api.anthropic.com/v1/models?limit=1000',
    google: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', groq: 'https://api.groq.com/openai/v1/models', moonshot: 'https://api.moonshot.ai/v1/models',
    deepseek: 'https://api.deepseek.com/models' };
  const headers: Record<string, string> = provider === 'anthropic' ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
    : provider === 'google' ? { 'x-goog-api-key': key } : { Authorization: `Bearer ${key}` };
  const models: ModelEntry[] = []; let url = urls[provider];
  for (let page = 0; url && page < 30; page++) {
    const data = await json(url, headers);
    for (const item of data.models ?? data.data ?? []) {
      const id = String(item.id ?? item.name ?? '').replace(/^models\//, '');
      if (!id || (provider === 'google' && !item.supportedGenerationMethods?.includes('generateContent'))) continue;
      if (/whisper|tts|audio|embedding|moderation|image|realtime|guard|orpheus/i.test(id)) continue;
      models.push(catalog.find(m => m.provider === provider && m.id === id)
        ?? { provider, id, label: item.display_name ?? item.displayName ?? id, supportsVision: false, supportsTools: false, tier: 'fast' });
    }
    url = provider === 'google' && data.nextPageToken ? urls[provider] + '&pageToken=' + encodeURIComponent(data.nextPageToken)
      : provider === 'anthropic' && data.has_more && data.last_id ? urls[provider] + '&after_id=' + encodeURIComponent(data.last_id) : '';
  }
  return models;
}
export async function listVoices(key: string): Promise<VoiceChoice[]> {
  const voices: VoiceChoice[] = []; let url = 'https://api.cartesia.ai/voices?limit=100';
  for (let page = 0; url && page < 30; page++) {
    const data = await json(url, { Authorization: `Bearer ${key}`, 'Cartesia-Version': cartesiaVersion });
    const items = Array.isArray(data) ? data : data.data ?? [];
    voices.push(...items.filter((v: { id?: string; name?: string }) => v.id && v.name).map((v: VoiceChoice) => ({ id: v.id, name: v.name })));
    url = data.has_more && items.length ? 'https://api.cartesia.ai/voices?limit=100&starting_after=' + encodeURIComponent(data.next_page ?? items[items.length - 1].id) : '';
  }
  return voices;
}
export async function testKey(provider: SecretId, key: string, voiceId?: string): Promise<{ status: KeyStatus }> {
  try {
    if (!key) throw new MissingKeyError(provider);
    if (provider === 'cartesia') {
      const voice = voiceId || (await listVoices(key))[0]?.id;
      if (!voice) throw new Error('No voices');
      const response = await fetch('https://api.cartesia.ai/tts/bytes', { method: 'POST', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${key}`, 'Cartesia-Version': cartesiaVersion, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: 'sonic-3.5', transcript: 'Hi.', voice: { mode: 'id', id: voice }, language: 'en',
          output_format: { container: 'raw', encoding: 'pcm_f32le', sample_rate: 44100 } }) });
      await response.body?.cancel();
      if (!response.ok) throw { statusCode: response.status };
    } else {
      const model = catalog.find(m => m.provider === provider && m.tier === 'budget') ?? catalog.find(m => m.provider === provider && m.tier === 'fast');
      await generateText({ model: getModel(provider, model.id, { getKey: () => key }), prompt: 'Reply only with Hi.',
        // Responses enforces a minimum cap of 16; the requested visible reply is 1–5 tokens.
        maxOutputTokens: provider === 'openai' ? 16 : 5,
        providerOptions: provider === 'openai' ? { openai: { reasoningEffort: 'none', store: false } } : undefined,
        maxRetries: 0, abortSignal: AbortSignal.timeout(15000) });
    }
    return { status: 'ok' };
  } catch (error) { return { status: keyErrorStatus(error) }; }
}
