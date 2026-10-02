import { useEffect, useState } from 'react';
import { useSettings } from '../hooks/useSettings';
import { ExportIcon, LockIcon, TrashIcon } from '../icons';
import { Group, SwitchRow } from './SettingsParts';
import { mask, sensitive, type MemoryFact } from '../../shared/memory';

const day = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const placeTitle = (key: string) => { const head = key.split('.')[0]; return head.charAt(0).toUpperCase() + head.slice(1); };

/** One fact: its label and value, where it came from, and Edit and Forget. Sensitive values stay masked until shown. */
function Fact({ fact, toast }: { fact: MemoryFact; toast(text: string): void }) {
  const [editing, setEditing] = useState(false), [value, setValue] = useState(fact.value), [shown, setShown] = useState(false);
  useEffect(() => { setValue(fact.value); }, [fact.value]);
  const hidden = sensitive(fact) && !shown;
  const save = async () => {
    const result = await window.kite.editMemory(fact.id, { value: value.trim() });
    if (result.ok) setEditing(false); else toast(result.error ?? 'Couldn’t save that.');
  };
  return <div className="setting-row memory-fact">
    <span className="row-text"><span className="row-label">{fact.label}</span>
      {editing ? <input aria-label={`New value for ${fact.label}`} value={value} autoFocus onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') { setEditing(false); setValue(fact.value); } }} />
        : <span className="memory-value">{hidden ? mask(fact) === 'saved' ? '••••••' : mask(fact) : fact.value}
          {sensitive(fact) && <button type="button" className="link" onClick={() => setShown(v => !v)}>{shown ? 'Hide' : 'Show'}</button>}</span>}
      <small>{fact.source}{fact.updated !== fact.created ? ` · changed ${day(fact.updated)}` : ''}{fact.used ? ` · last used ${day(fact.used)}` : ''}</small></span>
    <span className="row-control">{editing
      ? <><button className="primary" disabled={!value.trim()} onClick={() => { void save(); }}>Save</button><button onClick={() => { setEditing(false); setValue(fact.value); }}>Cancel</button></>
      : <><button onClick={() => setEditing(true)}>Edit</button>
        <button className="ghost" aria-label={`Forget ${fact.label}`} onClick={() => { void window.kite.deleteMemory(fact.id).then(r => { if (r.ok) toast(`Forgot ${fact.label.toLowerCase()}.`); }); }}><TrashIcon /></button></>}</span>
  </div>;
}

/**
 * Memory (docs/end-to-end-jobs.md §3.4): everything Kite keeps about you, where each fact came from, and how to change
 * or delete it. Beside History, since both are your own data on this PC.
 */
export default function MemoryView() {
  const settings = useSettings();
  const [facts, setFacts] = useState<MemoryFact[] | null>(null), [toast, setToast] = useState('');
  useEffect(() => {
    let alive = true;
    const load = () => { void window.kite.listMemory().then(list => { if (alive) setFacts(list); }); };
    load(); const off = window.kite.onMemoryChanged(load);
    return () => { alive = false; off(); };
  }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer); }, [toast]);
  const on = settings?.settings.memory !== false;
  const of = (kind: MemoryFact['kind']) => (facts ?? []).filter(f => f.kind === kind);
  const places = [...new Set(of('address').map(f => f.key.split('.')[0]))];
  const list = (items: MemoryFact[]) => items.map(f => <Fact key={f.id} fact={f} toast={setToast} />);
  return <main className="settings-view memory-view">
    <h1>Memory</h1>
    <Group hint="Kite saves what you tell it during tasks, and what you ask it to remember, so the next errand needs fewer questions. It shows a notice with Undo each time.">
      <SwitchRow label="Remember things about me" checked={on} change={v => { void window.kite.updateSettings({ memory: v }); }}
        description={on ? 'Kite saves and uses your details.' : 'Off: Kite saves nothing new and uses nothing below. What is saved stays until you delete it.'} />
    </Group>
    {facts && !facts.length && <p className="group-hint memory-empty">Nothing saved yet. Try “Remember that my pincode is 411045”, or answer Kite’s questions during an errand.</p>}
    {of('profile').length > 0 && <Group title="About you">{list(of('profile'))}</Group>}
    {places.map(place => <Group key={place} title={`${placeTitle(place)} address`}>{list(of('address').filter(f => f.key.startsWith(`${place}.`)))}</Group>)}
    {of('preference').length > 0 && <Group title="Preferences">{list(of('preference'))}</Group>}
    {of('order').length > 0 && <Group title="Orders">{list(of('order'))}</Group>}
    <Group title="Privacy">
      <div className="setting-row always-ask"><LockIcon /><span className="row-text"><span className="row-label">Your details never go to a model</span>
        <small>Values are encrypted on this PC. Models see only “phone ending 21” or “Home pincode” and type a placeholder such as {'{{home.pincode}}'}, which Kite fills in itself. Preferences and your city are sent as text. Screenshots, when a model asks to look, can show what is on screen.</small></span></div>
      <div className="setting-row always-ask"><LockIcon /><span className="row-text"><span className="row-label">Never saved</span>
        <small>Passwords, card and bank numbers, CVVs, one-time codes, UPI PINs, Aadhaar and PAN numbers.</small></span></div>
    </Group>
    <p className="group-hint">Forgetting something here doesn’t change old conversations in History; delete those there.</p>
    <div className="custom-actions">
      <button disabled={!facts?.length} onClick={() => { void window.kite.exportMemory().then(r => { if (r.ok) setToast('Exported.'); else if (r.error) setToast(r.error); }); }}><ExportIcon />Export</button>
      <button className="danger" disabled={!facts?.length} onClick={() => { void window.kite.deleteMemory(null).then(r => { if (r.ok) setToast('Forgot everything.'); }); }}><TrashIcon />Forget everything</button>
    </div>
    {toast && <div className="toast" role="status">{toast}</div>}
  </main>;
}
