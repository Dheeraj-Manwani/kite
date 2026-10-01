import { useEffect, useRef, useState } from 'react';
import type { OperationResult, SecretId, SettingsSnapshot } from '../../shared/types';
import { CheckIcon, ExternalIcon, MoreIcon, Working } from '../icons';

const checkMessages: Record<string, string> = {
  'invalid key': 'That key didn’t work. Check it and try again.',
  'no credit / rate-limited': 'The provider is rate-limiting this key, or the account has no credit.',
  'model unavailable': 'This key can’t reach the provider’s models.',
  'network error': 'Couldn’t reach the provider. Check your connection and try again.',
};
const CHECKING = 'Checking…';

/**
 * One provider key, driven by its state (docs/ui-ux-improvements.md UX-51): a key field and one Connect button that saves,
 * tests, and loads the model list; once connected, a status line with rarer actions in a menu. Used by Settings and onboarding.
 */
export function ProviderRow({ id, label, badge, snapshot, toast, onConnected }: {
  id: SecretId; label: string; badge?: string; snapshot: SettingsSnapshot; toast(message: string): void; onConnected?(id: SecretId): void;
}) {
  const [key, setKey] = useState(''), [editing, setEditing] = useState(false), [busy, setBusy] = useState(false);
  // The last check: '' when it passed, CHECKING while it runs, otherwise what went wrong.
  const [state, setState] = useState('');
  const menu = useRef<HTMLDetailsElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: PointerEvent) => { if (!menu.current?.contains(e.target as Node)) menu.current?.removeAttribute('open'); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menuOpen]);
  const refresh = () => id === 'cartesia' ? window.kite.refreshVoices() : window.kite.refreshModels(id);
  async function operation(fn: () => Promise<OperationResult>, success: string) {
    try { const result = await fn(); toast(result.ok ? success : result.error ?? 'Couldn’t complete that.'); }
    catch { toast('Couldn’t reach Kite. Please restart the app.'); }
  }
  async function check(alsoRefresh: boolean) {
    setState(CHECKING);
    try {
      const { status } = await window.kite.testKey(id);
      if (status !== 'ok') { setState(checkMessages[status] ?? 'The check failed. Try again.'); return false; }
      if (alsoRefresh) { const result = await refresh(); if (!result.ok) { setState(result.error ?? 'Connected, but the model list didn’t load.'); return false; } }
      setState(''); return true;
    } catch { setState('Couldn’t reach Kite. Please restart the app.'); return false; }
  }
  async function connect() {
    setBusy(true);
    try {
      const saved = await window.kite.setKey(id, key);
      if (!saved.ok) { setState(saved.error ?? 'Couldn’t save that key.'); return; }
      setKey(''); setEditing(false);
      if (await check(true)) onConnected?.(id);
    } catch { setState('Couldn’t reach Kite. Please restart the app.'); }
    finally { setBusy(false); }
  }
  const saved = snapshot.keys[id], open = !saved || editing;
  const working = busy || state === CHECKING, problem = state && state !== CHECKING ? state : '';
  const count = id === 'cartesia' ? snapshot.voices.length : snapshot.models.filter(m => m.provider === id).length;
  const things = id === 'cartesia' ? count === 1 ? 'voice' : 'voices' : count === 1 ? 'model' : 'models';
  const act = (fn: () => void) => () => { menu.current?.removeAttribute('open'); fn(); };
  return <div className={`provider-row${open ? '' : ' connected'}`}>
    <div className="provider-head"><strong>{label}</strong>{badge && <span className="tag">{badge}</span>}
      {open ? <button className="link external" onClick={() => window.kite.openKeyPage(id)}>Get a key<ExternalIcon /></button> : <>
        <span className={`provider-state${working ? ' working' : problem ? ' problem' : ''}`} role="status">
          {working ? <Working text={CHECKING} /> : problem ? 'Key saved · needs attention' : <><CheckIcon />Connected · {count} {things}</>}</span>
        <details ref={menu} className="overflow" onToggle={e => setMenuOpen(e.currentTarget.open)}><summary aria-label={`More for ${label}`}><MoreIcon /></summary>
          <div className="menu">
            <button className="ghost" onClick={act(() => { void check(false); })}>Check connection</button>
            <button className="ghost" onClick={act(() => { void operation(refresh, id === 'cartesia' ? 'Voices refreshed.' : 'Models refreshed.'); })}>{id === 'cartesia' ? 'Refresh voices' : 'Refresh models'}</button>
            <button className="ghost" onClick={act(() => setEditing(true))}>Replace key</button>
            <button className="ghost danger" onClick={act(() => { void operation(() => window.kite.deleteKey(id), 'Key removed.'); setState(''); })}>Remove key</button>
          </div></details></>}
    </div>
    {open && <div className="provider-connect">
      <input aria-label={`${label} API key`} type="password" autoComplete="off" spellCheck={false} value={key} placeholder="Paste API key"
        onChange={e => setKey(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && key.trim() && !working) void connect(); }} />
      <button className="primary" disabled={working || !key.trim()} aria-busy={working || undefined} onClick={() => { void connect(); }}>{working ? <Working text="Connecting…" /> : 'Connect'}</button>
      {editing && <button className="ghost" onClick={() => setEditing(false)}>Cancel</button>}
    </div>}
    {problem && <small className="field-error" role="alert">{problem}</small>}
  </div>;
}
