import { useEffect, useState } from 'react';
import type { ProviderId, SecretId, SettingsSnapshot } from '../../shared/types';
import { ProviderRow } from './ProviderRow';

const brains: { id: ProviderId; label: string; family: string }[] = [
  { id: 'anthropic', label: 'Anthropic', family: 'Claude' }, { id: 'openai', label: 'OpenAI', family: 'GPT' },
  { id: 'google', label: 'Google Gemini', family: 'Gemini' }, { id: 'moonshot', label: 'Moonshot / Kimi', family: 'Kimi' },
];

/** What setup still needs, in the words the Continue row uses (UX-61). */
export function missingKeys(snapshot: SettingsSnapshot | undefined): string[] {
  if (!snapshot) return [];
  return [!snapshot.keys.groq && 'a Groq key to use voice', !brains.some(b => snapshot.keys[b.id]) && 'a model provider for answers'].filter((x): x is string => !!x);
}

/** The keys step, scoped to what's needed now: Groq, one brain, and an optional voice (docs/ui-ux-improvements.md UX-61). */
export function KeysStep({ snapshot }: { snapshot: SettingsSnapshot }) {
  const [choice, setChoice] = useState<ProviderId>(() => (brains.find(b => snapshot.keys[b.id]) ?? brains.find(b => b.id === snapshot.settings.model.provider) ?? brains[0]).id);
  const [toast, setToast] = useState('');
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer); }, [toast]);
  // A brain only helps if the main model uses it: switch to this provider when the current model has no key.
  const adopt = async (id: SecretId) => {
    const fresh = await window.kite.getSettings();
    if (fresh.keys[fresh.settings.model.provider]) return;
    const model = fresh.models.find(m => m.provider === id);
    if (model) await window.kite.updateSettings({ model: { provider: model.provider, id: model.id } });
  };
  return <div className="keys-step">
    <section className="settings-group"><h2>Groq, so I can hear you</h2>
      <p className="group-hint">Groq turns your voice into text. It’s required.</p>
      <div className="group-card"><ProviderRow id="groq" label="Groq" snapshot={snapshot} toast={setToast} /></div></section>
    <section className="settings-group"><h2>Pick a brain</h2>
      <p className="group-hint">This provider’s model answers your questions. One is enough.</p>
      <div className="brain-cards" role="radiogroup" aria-label="Model provider">{brains.map(b =>
        <button key={b.id} role="radio" aria-checked={choice === b.id} className={`brain-card${choice === b.id ? ' chosen' : ''}`} onClick={() => setChoice(b.id)}>
          <strong>{b.label}</strong><small>{snapshot.keys[b.id] ? 'Connected' : b.family}</small></button>)}</div>
      <div className="group-card"><ProviderRow key={choice} id={choice} label={brains.find(b => b.id === choice)?.label ?? choice} snapshot={snapshot} toast={setToast} onConnected={id => { void adopt(id); }} /></div></section>
    <section className="settings-group"><h2>A voice</h2>
      <p className="group-hint">Optional. Cartesia lets me speak my answers.</p>
      <div className="group-card"><ProviderRow id="cartesia" label="Cartesia" badge="Optional" snapshot={snapshot} toast={setToast} /></div></section>
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>;
}
