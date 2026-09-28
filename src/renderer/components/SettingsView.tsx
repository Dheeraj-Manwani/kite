import { useEffect, useState } from 'react';
import type { AppSettings, ModelSelection, OperationResult, ProviderId, SecretId, SettingsSnapshot } from '../../shared/types';
const providers: { id: ProviderId; label: string }[] = [
  { id: 'openai', label: 'OpenAI' }, { id: 'anthropic', label: 'Anthropic' }, { id: 'google', label: 'Google Gemini' },
  { id: 'groq', label: 'Groq · also speech recognition' }, { id: 'moonshot', label: 'Moonshot / Kimi' },
];
const encode = (m: ModelSelection) => `${m.provider}:${m.id}`;
const decode = (s: string): ModelSelection => ({ provider: s.slice(0, s.indexOf(':')) as ProviderId, id: s.slice(s.indexOf(':') + 1) });
export function SettingsView() {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot>();
  const [keys, setKeys] = useState<Partial<Record<SecretId, string>>>({});
  const [editing, setEditing] = useState<Partial<Record<SecretId, boolean>>>({});
  const [chips, setChips] = useState<Partial<Record<SecretId, string>>>({});
  const [busy, setBusy] = useState<Partial<Record<SecretId, boolean>>>({});
  const [status, setStatus] = useState('Loading settings…');
  const [customProvider, setCustomProvider] = useState<ProviderId>('moonshot');
  const [customId, setCustomId] = useState('');
  useEffect(() => {
    let active = true;
    const unsubscribe = window.kite.onSettingsChanged(s => { if (active) setSnapshot(s); });
    void window.kite.getSettings().then(s => { if (active) { setSnapshot(s); setStatus('Changes apply immediately. Keys stay encrypted on this computer.'); } })
      .catch(() => { if (active) setStatus('Could not load settings. Restart Kite.'); });
    return () => { active = false; unsubscribe(); };
  }, []);
  async function operation(fn: () => Promise<OperationResult>, success = 'Saved.') {
    try { const result = await fn(); setStatus(result.ok ? success : result.error ?? 'Could not complete the request.'); }
    catch { setStatus('Could not contact Kite. Please restart the app.'); }
  }
  const update = (patch: Partial<AppSettings>) => { void operation(() => window.kite.updateSettings(patch)); };
  async function rowAction(id: SecretId, action: 'save' | 'test' | 'refresh' | 'delete') {
    setBusy(s => ({ ...s, [id]: true }));
    try {
      if (action === 'test') { setChips(s => ({ ...s, [id]: 'Testing…' })); const result = await window.kite.testKey(id); setChips(s => ({ ...s, [id]: result.status })); }
      else if (action === 'save') {
        const result = await window.kite.setKey(id, keys[id] ?? '');
        if (!result.ok) { setStatus(result.error); return; }
        setKeys(s => ({ ...s, [id]: '' })); setEditing(s => ({ ...s, [id]: false })); setChips(s => ({ ...s, [id]: 'Not tested' })); setStatus('Key saved securely.');
        if (id === 'cartesia') await operation(() => window.kite.refreshVoices(), 'Key saved and voices refreshed.');
      } else if (action === 'delete') { await operation(() => window.kite.deleteKey(id), 'Key removed.'); setChips(s => ({ ...s, [id]: '' })); }
      else await operation(() => id === 'cartesia' ? window.kite.refreshVoices() : window.kite.refreshModels(id), 'Catalog refreshed.');
    } catch { setStatus('Could not complete the provider request.'); }
    finally { setBusy(s => ({ ...s, [id]: false })); }
  }
  function keyRow(id: SecretId, label: string) {
    const saved = snapshot?.keys[id];
    return <div className="provider-row" key={id}>
      <div className="provider-title"><strong>{label}</strong><span><span className="status-chip">{saved ? 'Saved ••••••••' : 'No key'}</span>{chips[id] && <span className="status-chip key-test" data-status={chips[id]}>{chips[id]}</span>}</span></div>
      {(!saved || editing[id]) && <input aria-label={`${label} API key`} type="password" autoComplete="off" spellCheck={false} value={keys[id] ?? ''}
        onChange={e => setKeys(s => ({ ...s, [id]: e.target.value }))} placeholder="Paste API key" />}
      <div className="settings-actions">
        {saved && !editing[id] ? <button disabled={busy[id]} onClick={() => setEditing(s => ({ ...s, [id]: true }))}>Replace</button>
          : <button disabled={busy[id] || !keys[id]?.trim()} onClick={() => { void rowAction(id, 'save'); }}>Save</button>}
        <button disabled={!saved || busy[id]} onClick={() => { void rowAction(id, 'test'); }}>Test</button>
        <button disabled={!saved || busy[id]} onClick={() => { void rowAction(id, 'refresh'); }}>{id === 'cartesia' ? 'Refresh voices' : 'Refresh models'}</button>
        {saved && <button disabled={busy[id]} onClick={() => { void rowAction(id, 'delete'); }}>Remove</button>}
      </div>
    </div>;
  }
  function picker(label: string, value: ModelSelection, change: (model: ModelSelection) => void) {
    const models = snapshot.models.filter(m => snapshot.keys[m.provider]);
    const selected = models.some(m => encode(m) === encode(value));
    return <label className="setting-field">{label}<select value={encode(value)} onChange={e => change(decode(e.target.value))}>
      {!selected && <option value={encode(value)}>{value.id} {snapshot.keys[value.provider] ? '(custom)' : '(save provider key)'}</option>}
      {providers.filter(p => snapshot.keys[p.id]).map(p => <optgroup key={p.id} label={p.label}>
        {models.filter(m => m.provider === p.id).map(m => <option key={m.id} value={encode(m)}>{m.label} · {m.tier}{m.supportsVision ? ' · ◉ Vision' : ''}{m.supportsTools ? ' · Actions' : ' · Chat only'}</option>)}
      </optgroup>)}
    </select></label>;
  }
  return <main className="settings-view">
    <header><h1>Kite</h1><p>A little company beside your cursor.</p></header>
    <p className="settings-status" role="status">{status}</p>
    <section><h2>Providers</h2><p className="settings-hint">Groq is also required for Ctrl + Win speech recognition.</p>{providers.map(p => keyRow(p.id, p.label))}</section>
    {snapshot && <>
      <section><h2>Actions</h2><label className="setting-field">Search engine<select value={snapshot.settings.searchEngine} onChange={e => update({ searchEngine: e.target.value as AppSettings['searchEngine'] })}><option value="google">Google</option><option value="bing">Bing</option><option value="duckduckgo">DuckDuckGo</option></select></label>
        <button onClick={() => { void operation(() => window.kite.rescanApps(), 'App index ready. Scans are cached for 10 minutes.'); }}>Rescan apps</button>
        <p>Every action requires your confirmation. For typing, focus the destination app and say yes.</p></section>
      <section><h2>Model</h2>{picker('Powered by', snapshot.settings.model, model => update({ model }))}
        <div className="custom-model"><label>Custom provider<select value={customProvider} onChange={e => setCustomProvider(e.target.value as ProviderId)}>
          {providers.map(p => <option key={p.id} value={p.id} disabled={!snapshot.keys[p.id]}>{p.label}</option>)}
        </select></label><label>Custom model ID<input value={customId} onChange={e => setCustomId(e.target.value)} placeholder="Exact API model ID" /></label>
        <button disabled={!customId.trim() || !snapshot.keys[customProvider]} onClick={() => update({ model: { provider: customProvider, id: customId.trim() } })}>Use model</button>
        <button disabled={!customId.trim() || !snapshot.keys[customProvider]} onClick={() => update({ fallback: { provider: customProvider, id: customId.trim() } })}>Use as fallback</button></div>
        <label className="settings-toggle"><input type="checkbox" checked={snapshot.settings.fallbackEnabled} onChange={e => update({ fallbackEnabled: e.target.checked })} />Retry once on a fallback model</label>
        {picker('Fallback model', snapshot.settings.fallback, fallback => update({ fallback }))}
        <small>Only connection errors, server errors, or rate limits before the first token trigger fallback.</small>
      </section>
      <section><h2>Voice</h2>{keyRow('cartesia', 'Cartesia')}
        <label className="settings-toggle"><input type="checkbox" checked={snapshot.settings.ttsEnabled} onChange={e => update({ ttsEnabled: e.target.checked })} />Speak replies</label>
        <label className="setting-field">Voice<select value={snapshot.settings.voiceId} onChange={e => update({ voiceId: e.target.value })}>
          <option value="">Choose a voice</option>{snapshot.voices.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select></label>
        <label className="setting-field">Speed · {snapshot.settings.speed.toFixed(2)}×<input type="range" min="0.6" max="1.5" step="0.05" value={snapshot.settings.speed} onChange={e => update({ speed: Number(e.target.value) })} /></label>
        <button disabled={!snapshot.settings.ttsEnabled} onClick={() => { void operation(() => window.kite.previewVoice(), 'Playing voice preview.'); }}>Preview</button>
      </section>
    </>}
    <footer>Hold Ctrl + Win to speak. Press again to interrupt. Escape stops an active interaction.</footer>
  </main>;
}
