import { useEffect, useState } from 'react';
import type { SettingsSnapshot } from '../../shared/types';
import { hotkeyLabel } from '../../shared/release';

// One settings subscription for the renderer's lifetime, shared by every card that shows the shortcut,
// so mounting and unmounting cards never adds or removes IPC listeners.
let current = '', subscribed = false;
const readers = new Set<(label: string) => void>();
function subscribe() {
  if (subscribed) return;
  subscribed = true;
  const set = (snapshot: SettingsSnapshot) => { current = hotkeyLabel(snapshot.settings.hotkey); readers.forEach(read => read(current)); };
  void window.kite.getSettings().then(set);
  window.kite.onSettingsChanged(set);
}

/** The user's push-to-talk shortcut as text ("Ctrl + Win"), kept current with Settings. Empty until loaded. */
export function useHotkeyLabel() {
  const [label, setLabel] = useState(current);
  useEffect(() => {
    subscribe(); readers.add(setLabel); setLabel(current);
    return () => { readers.delete(setLabel); };
  }, []);
  return label;
}
