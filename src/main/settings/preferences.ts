import { validateHotkey, configurableTools, kiteSizes, kiteSkins, livelinessLevels, kitePlacements } from '../../shared/release';
import Store from 'electron-store';
import type { AppSettings, ModelEntry, SettingsSnapshot, SecretId, VoiceChoice, ModelSelection } from '../../shared/types';
import { catalog, mergeCatalog, providerIds } from '../ai/catalog';
import { defaultPermissions, validPermissions, type NudgeRecord } from '../../shared/permissions';
import { structuredBoards } from '../board/feature';
export const defaultSettings: AppSettings = { onboardingComplete: false, hotkey: ['Control','Meta'], launchOnStartup: false, reducedMotion: false, toolApprovals: { get_datetime: false, list_reminders: false, open_app: true, web_search: true }, visionModel: { provider: 'moonshot', id: 'kimi-k2.5' }, screenWithoutAsking: false, keepScreenshots: false, model: { provider: 'moonshot', id: 'kimi-k2.6' }, fallbackEnabled: false,
  fallback: { provider: 'groq', id: 'openai/gpt-oss-20b' }, ttsEnabled: false, voiceId: '', speed: 1, dryRun: false, searchEngine: 'google', guideMode: true, whiteboard: true, boardCaptions: false, computerUse: true, kiteSize: 'standard', earcons: false, liveliness: 'subtle', kitePlacement: 'screenEdge', kiteSkin: 'rose',
  permissions: defaultPermissions, jobsModel: null, boardModel: null, memory: true };
export function validModel(value: unknown): value is ModelSelection {
  if (!value || typeof value !== 'object') return false;
  const m = value as ModelSelection;
  return providerIds.includes(m.provider) && typeof m.id === 'string' && m.id.length > 0 && m.id.length <= 200 && /^[a-zA-Z0-9._:/-]+$/.test(m.id);
}
export function openPreferences(hasKey: (id: SecretId) => boolean) {
  const store = new Store<{ preferences: AppSettings; models: ModelEntry[]; voices: VoiceChoice[]; nudges: NudgeRecord[] }>({ name: 'preferences',
    defaults: { preferences: defaultSettings, models: [], voices: [], nudges: [] } });
  const listeners = new Set<(snapshot: SettingsSnapshot, old: AppSettings) => void>();
  const get = () => {
    const value = { ...defaultSettings, ...store.get('preferences'), screenWithoutAsking: false };
    // Preserve existing choices when upgrading from Calm / Lively.
    const savedMotion = value.liveliness as string;
    value.liveliness = savedMotion === 'calm' ? 'subtle' : savedMotion === 'lively' ? 'playful' : value.liveliness;
    return value;
  };
  const snapshot = (): SettingsSnapshot => ({ settings: get(), models: mergeCatalog(catalog, store.get('models')), voices: store.get('voices'), boardPlannerEnabled: structuredBoards(),
    keys: Object.fromEntries([...providerIds, 'cartesia'].map(id => [id, hasKey(id as SecretId)])) as Record<SecretId, boolean> });
  const notify = (old = get()) => { const value = snapshot(); listeners.forEach(fn => fn(value, old)); };
  return { get, snapshot, notify,
    subscribe(fn: (snapshot: SettingsSnapshot, old: AppSettings) => void) { listeners.add(fn); return () => listeners.delete(fn); },
    update(patch: Partial<AppSettings>) {
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid settings');
      const old = get(); const next = { ...old };
      for (const [key, value] of Object.entries(patch)) {
        if (key === 'model' || key === 'fallback' || key === 'visionModel') { if (!validModel(value) || !hasKey(value.provider)) throw new Error('Save a key for this provider first.'); next[key] = value; }
        else if (key === 'ttsEnabled' || key === 'fallbackEnabled' || key === 'dryRun' || key === 'keepScreenshots' || key === 'onboardingComplete' || key === 'launchOnStartup' || key === 'reducedMotion' || key === 'guideMode' || key === 'whiteboard' || key === 'boardCaptions' || key === 'computerUse' || key === 'earcons' || key === 'memory') { if (typeof value !== 'boolean') throw new Error('Invalid setting'); next[key] = value; }
        else if (key === 'hotkey') { if (!validateHotkey(value)) throw new Error('Use two or more modifiers only; other keys would type into the focused app.'); next.hotkey = [...value]; }
        else if (key === 'screenWithoutAsking') { if (value !== false) throw new Error('Screen access always requires confirmation in v1.'); }
        else if (key === 'toolApprovals') {
          if (!value || typeof value !== 'object' || Array.isArray(value) || Object.entries(value).some(([k,v]) => !configurableTools.includes(k as typeof configurableTools[number]) || typeof v !== 'boolean')) throw new Error('Only low-risk tools have configurable trust.');
          next.toolApprovals = { ...old.toolApprovals, ...value };
        }
        else if (key === 'searchEngine') { if (!['google', 'bing', 'duckduckgo'].includes(value as string)) throw new Error('Invalid search engine'); next.searchEngine = value as AppSettings['searchEngine']; }
        else if (key === 'speed') { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0.6 || value > 1.5) throw new Error('Invalid speed'); next.speed = value; }
        else if (key === 'kiteSize') { if (typeof value !== 'string' || !Object.hasOwn(kiteSizes, value)) throw new Error('Invalid kite size'); next.kiteSize = value as AppSettings['kiteSize']; }
        else if (key === 'liveliness') { if (!livelinessLevels.includes(value as AppSettings['liveliness'])) throw new Error('Invalid liveliness'); next.liveliness = value as AppSettings['liveliness']; }
        else if (key === 'kitePlacement') { if (!kitePlacements.includes(value as NonNullable<AppSettings['kitePlacement']>)) throw new Error('Invalid kite placement'); next.kitePlacement = value as AppSettings['kitePlacement']; }
        else if (key === 'kiteSkin') { if (!kiteSkins.includes(value as AppSettings['kiteSkin'])) throw new Error('Invalid kite color'); next.kiteSkin = value as AppSettings['kiteSkin']; }
        else if (key === 'permissions') { const valid = validPermissions(value); if (!valid) throw new Error('Invalid permissions'); next.permissions = valid; }
        else if (key === 'jobsModel' || key === 'boardModel') {
          if (value === null) next[key] = null;
          else if (!validModel(value) || !hasKey(value.provider)) throw new Error('Save a key for this provider first.');
          else next[key] = { provider: value.provider, id: value.id };
        }
        else if (key === 'voiceId') { if (typeof value !== 'string' || value.length > 200) throw new Error('Invalid voice'); next.voiceId = value; }
        else throw new Error('Unknown setting');
      }
      if (patch.visionModel && !snapshot().models.some(m => m.provider === next.visionModel.provider && m.id === next.visionModel.id && m.supportsVision)) throw new Error('Choose a vision-capable model.');
      if (next.ttsEnabled && (!hasKey('cartesia') || !next.voiceId)) throw new Error('Save a Cartesia key and select a voice first.');
      if ((patch.fallbackEnabled === true || patch.fallback) && next.fallbackEnabled && !hasKey(next.fallback.provider)) throw new Error('Save a key for the fallback provider.');
      const custom = [next.model, next.fallback, next.boardModel].filter(m => m && hasKey(m.provider)).map(m => ({ ...m, label: m.id, supportsVision: false, supportsTools: false, tier: 'fast' as const }));
      store.set('models', mergeCatalog(store.get('models'), custom));
      store.set('preferences', next); notify(old);
    },
    cacheModels(models: ModelEntry[]) { store.set('models', mergeCatalog(store.get('models'), models)); notify(); },
    cacheVoices(voices: VoiceChoice[]) { store.set('voices', voices); notify(); },
    /** Yes-counts for "stop asking?" (permissions.ts `countYes`): Kite's own bookkeeping, not a setting. */
    nudges: () => store.get('nudges') ?? [],
    setNudges(records: NudgeRecord[]) { store.set('nudges', records); },
  };
}
