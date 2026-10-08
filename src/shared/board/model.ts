import type { ModelEntry, ModelSelection, ProviderId } from '../types';
/** Provisional automatic preference; an explicit choice always wins. */
export function boardModel(settings: { model: ModelSelection; boardModel?: ModelSelection | null }, models: ModelEntry[], hasKey: (p: ProviderId) => boolean): ModelEntry {
  const selected = settings.boardModel && models.find(m => m.provider === settings.boardModel.provider && m.id === settings.boardModel.id);
  if (settings.boardModel) {
    if (!selected || !hasKey(selected.provider)) throw new Error('Save a key and choose an available whiteboard model.');
    return selected;
  }
  const fast = models.find(m => m.provider === 'deepseek' && m.id === 'deepseek-flash' && hasKey(m.provider));
  const main = models.find(m => m.provider === settings.model.provider && m.id === settings.model.id && hasKey(m.provider));
  if (!fast && !main) throw new Error('Save a provider key for whiteboard lessons.');
  return fast ?? main;
}
