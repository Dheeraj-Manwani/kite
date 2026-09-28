import Store from 'electron-store';
import type { AppSettings, ModelEntry, SettingsSnapshot, SecretId, VoiceChoice, ModelSelection } from '../../shared/types';
import { catalog, mergeCatalog, providerIds } from '../ai/catalog';
export const defaultSettings: AppSettings = { model: { provider: 'moonshot', id: 'kimi-k2.6' }, fallbackEnabled: false,
  fallback: { provider: 'groq', id: 'openai/gpt-oss-20b' }, ttsEnabled: false, voiceId: '', speed: 1, dryRun: false, searchEngine: 'google' };
export function validModel(value: unknown): value is ModelSelection {
  if (!value || typeof value !== 'object') return false;
  const m = value as ModelSelection;
  return providerIds.includes(m.provider) && typeof m.id === 'string' && m.id.length > 0 && m.id.length <= 200 && /^[a-zA-Z0-9._:/-]+$/.test(m.id);
}
export function openPreferences(hasKey: (id: SecretId) => boolean) {
  const store = new Store<{ preferences: AppSettings; models: ModelEntry[]; voices: VoiceChoice[] }>({ name: 'preferences',
    defaults: { preferences: defaultSettings, models: [], voices: [] } });
  const listeners = new Set<(snapshot: SettingsSnapshot, old: AppSettings) => void>();
  const get = () => ({ ...defaultSettings, ...store.get('preferences') });
  const snapshot = (): SettingsSnapshot => ({ settings: get(), models: mergeCatalog(catalog, store.get('models')), voices: store.get('voices'),
    keys: Object.fromEntries([...providerIds, 'cartesia'].map(id => [id, hasKey(id as SecretId)])) as Record<SecretId, boolean> });
  const notify = (old = get()) => { const value = snapshot(); listeners.forEach(fn => fn(value, old)); };
  return { get, snapshot, notify,
    subscribe(fn: (snapshot: SettingsSnapshot, old: AppSettings) => void) { listeners.add(fn); return () => listeners.delete(fn); },
    update(patch: Partial<AppSettings>) {
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid settings');
      const old = get(); const next = { ...old };
      for (const [key, value] of Object.entries(patch)) {
        if (key === 'model' || key === 'fallback') { if (!validModel(value) || !hasKey(value.provider)) throw new Error('Save a key for this provider first.'); next[key] = value; }
        else if (key === 'ttsEnabled' || key === 'fallbackEnabled' || key === 'dryRun') { if (typeof value !== 'boolean') throw new Error('Invalid setting'); next[key] = value; }
        else if (key === 'searchEngine') { if (!['google', 'bing', 'duckduckgo'].includes(value as string)) throw new Error('Invalid search engine'); next.searchEngine = value as AppSettings['searchEngine']; }
        else if (key === 'speed') { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0.6 || value > 1.5) throw new Error('Invalid speed'); next.speed = value; }
        else if (key === 'voiceId') { if (typeof value !== 'string' || value.length > 200) throw new Error('Invalid voice'); next.voiceId = value; }
        else throw new Error('Unknown setting');
      }
      if (next.ttsEnabled && (!hasKey('cartesia') || !next.voiceId)) throw new Error('Save a Cartesia key and select a voice first.');
      if ((patch.fallbackEnabled === true || patch.fallback) && next.fallbackEnabled && !hasKey(next.fallback.provider)) throw new Error('Save a key for the fallback provider.');
      const custom = [next.model, next.fallback].filter(m => hasKey(m.provider)).map(m => ({ ...m, label: m.id, supportsVision: false, supportsTools: false, tier: 'fast' as const }));
      store.set('models', mergeCatalog(store.get('models'), custom));
      store.set('preferences', next); notify(old);
    },
    cacheModels(models: ModelEntry[]) { store.set('models', mergeCatalog(store.get('models'), models)); notify(); },
    cacheVoices(voices: VoiceChoice[]) { store.set('voices', voices); notify(); },
  };
}
