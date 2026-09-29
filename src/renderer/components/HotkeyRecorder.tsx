import { useEffect, useState } from 'react';
import { hotkeyLabel, hotkeyWarning, modifiers, validateHotkey, type Modifier } from '../../shared/release';
export function HotkeyRecorder({ value, change, suppressVoice = false }: { value: Modifier[]; change(value: Modifier[]): void; suppressVoice?: boolean }) {
  const [recording, setRecording] = useState(false), [candidate, setCandidate] = useState<Modifier[]>([]), [error, setError] = useState('');
  useEffect(()=>{window.kite.setHotkeyRecording(recording || suppressVoice);return()=>window.kite.setHotkeyRecording(false);},[recording, suppressVoice]);
  return <div className="hotkey-recorder"><p>Push to talk: <strong>{hotkeyLabel(value)}</strong></p><button
    onClick={e => { setRecording(true); setCandidate([]); setError(''); e.currentTarget.focus(); }}
    onBlur={() => setRecording(false)} onKeyDown={e => {
      if (!recording) return; e.preventDefault();
      if (e.key === 'Escape') { setRecording(false); return; }
      if (!modifiers.includes(e.key as Modifier)) { setError('Modifiers only. Letters and other keys would type into the focused app.'); setCandidate([]); return; }
      const keys = modifiers.filter(k => e.getModifierState(k)); setCandidate(keys);
    }}>{recording ? `Press modifiers: ${hotkeyLabel(candidate) || 'waiting…'}` : 'Change hotkey'}</button>
    {recording && <button onMouseDown={e => e.preventDefault()} disabled={!validateHotkey(candidate)} onClick={() => { change(candidate); setRecording(false); }}>Use this combination</button>}
    <small role="status">{error || hotkeyWarning(recording ? candidate : value)}</small></div>;
}
