import { useSyncExternalStore } from 'react';
import type { SettingsSnapshot } from '../../shared/types';
import { kiteSizes } from '../../shared/release';

// One settings subscription for the renderer's lifetime, shared by every component that reads it,
// so mounting and unmounting cards and pills never adds or removes IPC listeners.
let current: SettingsSnapshot | null = null, connected = false;
const listeners = new Set<() => void>();
function connect() {
  if (connected) return;
  connected = true;
  const set = (snapshot: SettingsSnapshot) => { current = snapshot; listeners.forEach(listener => listener()); };
  void window.kite.getSettings().then(set);
  window.kite.onSettingsChanged(set);
}
const subscribe = (listener: () => void) => { connect(); listeners.add(listener); return () => { listeners.delete(listener); }; };

/** The current settings snapshot, or null until it has loaded. */
export const useSettings = () => useSyncExternalStore(subscribe, () => current);

/** The kite's size setting as a scale: 1, 1.3, or 1.6 (docs/design.md K-14). */
export const useKiteScale = () => kiteSizes[useSettings()?.settings.kiteSize ?? 'standard'] ?? 1;

/** The main model's display name, such as "Claude Sonnet 5". */
export function modelLabel(snapshot: SettingsSnapshot | null) {
  if (!snapshot) return '';
  const { provider, id } = snapshot.settings.model;
  return snapshot.models.find(model => model.provider === provider && model.id === id)?.label ?? id;
}
