import { useEffect, useState } from 'react';
import { hotkeyLabel, hotkeyWarning, modifiers, validateHotkey, type Modifier } from '../../shared/release';
import { Keycaps } from './Keycaps';
/** `compact` hides the current-shortcut line where the page already shows it, as onboarding does. */
export function HotkeyRecorder({ value, change, suppressVoice = false, compact = false }: { value: Modifier[]; change(value: Modifier[]): void; suppressVoice?: boolean; compact?: boolean }) {
  const [recording, setRecording] = useState(false), [candidate, setCandidate] = useState<Modifier[]>([]), [error, setError] = useState('');
  useEffect(()=>{window.kite.setHotkeyRecording(recording || suppressVoice);return()=>window.kite.setHotkeyRecording(false);},[recording, suppressVoice]);
  return <div className="hotkey-recorder">{!compact && <p className="hotkey-current">Push to talk <Keycaps keys={value} /></p>}<button
    onClick={e => { setRecording(true); setCandidate([]); setError(''); e.currentTarget.focus(); }}
    onBlur={() => setRecording(false)} onKeyDown={e => {
      if (!recording) return; e.preventDefault();
      if (e.key === 'Escape') { setRecording(false); return; }
      if (!modifiers.includes(e.key as Modifier)) { setError('Modifiers only. Letters and other keys would type into the focused app.'); setCandidate([]); return; }
      const keys = modifiers.filter(k => e.getModifierState(k)); setCandidate(keys);
    }}>{recording ? `Press modifiers: ${hotkeyLabel(candidate) || 'waiting…'}` : 'Change shortcut'}</button>
    {recording && <button className="primary" onMouseDown={e => e.preventDefault()} disabled={!validateHotkey(candidate)} onClick={() => { change(candidate); setRecording(false); }}>Use this combination</button>}
    <small role="status">{error || hotkeyWarning(recording ? candidate : value)}</small></div>;
}
