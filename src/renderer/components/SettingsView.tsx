import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { HotkeyRecorder } from './HotkeyRecorder';
import { Keycaps } from './Keycaps';
import { sections, type Section } from './sections';
import { configurableTools, kiteSkins, livelinessLevels, type ConfigurableTool, type KiteSize, type KiteSkin, type Liveliness } from '../../shared/release';
import { SailMark } from '../kite/SailMark';
import { routeVision } from '../../shared/vision';
import type { AboutInfo, AppSettings, ModelSelection, OperationResult, ProviderId, SettingsSnapshot } from '../../shared/types';
import { BusyDots, LockIcon, Working } from '../icons';
import { ProviderRow } from './ProviderRow';
import { ModelPicker } from './ModelPicker';
import { previewEarcons } from '../voice/earcons';

// Groq comes first: without it Kite can't hear you.
const providers: { id: ProviderId; label: string; badge?: string }[] = [
  { id: 'groq', label: 'Groq', badge: 'Required for voice' }, { id: 'openai', label: 'OpenAI' }, { id: 'anthropic', label: 'Anthropic' },
  { id: 'google', label: 'Google Gemini' }, { id: 'moonshot', label: 'Moonshot / Kimi' },
];
// People reason about what Kite will do, not about tool ids (UX-54).
const toolLabels: Record<ConfigurableTool, string> = { open_app: 'Open an app', web_search: 'Search the web', get_datetime: 'Check the date and time', list_reminders: 'Read your reminders' };
const askByDefault = (name: ConfigurableTool) => !['get_datetime', 'list_reminders'].includes(name);
const alwaysAsks = ['Type or paste into an app', 'Read or change your clipboard', 'Look at your screen', 'Start a guide', 'Do a task in an app'];
const encode = (m: ModelSelection) => `${m.provider}:${m.id}`;
const kiteSizeLabels: Record<KiteSize, string> = { standard: 'Standard', large: 'Large', extraLarge: 'Extra large' };
const livelinessLabels: Record<Liveliness, string> = { lively: 'Lively', calm: 'Calm' };
const skinLabels: Record<KiteSkin, string> = { rose: 'Rose', teal: 'Teal', violet: 'Violet', sky: 'Sky' };
// The speed slider's range, and where 1.0× ("Normal") sits on it (UX-56).
const SPEED = { min: .6, max: 1.5 };
const speedAt = (value: number) => (value - SPEED.min) / (SPEED.max - SPEED.min);

function Group({ title, hint, children }: { title?: string; hint?: ReactNode; children: ReactNode }) {
  return <section className="settings-group">{title && <h2>{title}</h2>}{hint && <p className="group-hint">{hint}</p>}<div className="group-card">{children}</div></section>;
}
function Row({ label, description, children }: { label: string; description?: ReactNode; children: ReactNode }) {
  return <div className="setting-row"><span className="row-text"><span className="row-label">{label}</span>{description && <small>{description}</small>}</span><span className="row-control">{children}</span></div>;
}
/** Settings that apply immediately are switches, and "on" is ink, not pink (UX-54). */
function SwitchRow({ label, description, checked, disabled, change }: { label: string; description?: ReactNode; checked: boolean; disabled?: boolean; change(value: boolean): void }) {
  return <label className="setting-row switch-row"><span className="row-text"><span className="row-label">{label}</span>{description && <small>{description}</small>}</span>
    <input type="checkbox" role="switch" className="switch" checked={checked} disabled={disabled} onChange={e => change(e.target.checked)} /></label>;
}

/** An action that takes a moment shows the kite tail's three dots while it runs (UX-06). */
function BusyButton({ run, disabled, children }: { run(): Promise<unknown>; disabled?: boolean; children: ReactNode }) {
  const [busy, setBusy] = useState(false);
  return <button disabled={disabled || busy} aria-busy={busy || undefined} onClick={() => { setBusy(true); void run().finally(() => setBusy(false)); }}>{children}{busy && <BusyDots />}</button>;
}

/** One section of Settings at a time (UX-50). */
export function SettingsView({ section = 'general' }: { section?: Section }) {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot>();
  const [toast, setToast] = useState(''), [loadError, setLoadError] = useState(''), [about, setAbout] = useState<AboutInfo | null>(null);
  const [customProvider, setCustomProvider] = useState<ProviderId>('moonshot'), [customId, setCustomId] = useState('');
  useEffect(() => {
    let active = true;
    const unsubscribe = window.kite.onSettingsChanged(s => { if (active) setSnapshot(s); });
    void window.kite.getSettings().then(s => { if (active) setSnapshot(s); }).catch(() => { if (active) setLoadError('Couldn’t load settings. Restart Kite.'); });
    return () => { active = false; unsubscribe(); };
  }, []);
  useEffect(() => { if (section === 'about') void window.kite.getAbout().then(setAbout); }, [section]);
  // Global results are a short toast; results for one provider stay in its row (UX-53).
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer); }, [toast]);
  async function operation(fn: () => Promise<OperationResult>, success?: string) {
    try { const result = await fn(); if (!result.ok) setToast(result.error ?? 'Couldn’t complete that.'); else if (success) setToast(success); }
    catch { setToast('Couldn’t reach Kite. Please restart the app.'); }
  }
  const update = (patch: Partial<AppSettings>) => { void operation(() => window.kite.updateSettings(patch)); };
  function picker(label: string, value: ModelSelection, change: (model: ModelSelection) => void, options: { visionOnly?: boolean; disabled?: boolean } = {}) {
    if (!snapshot) return null;
    // Models from providers with a key, grouped by provider (UX-55).
    const groups = providers.filter(p => snapshot.keys[p.id]).map(p => ({ provider: p.id, label: p.label,
      models: snapshot.models.filter(m => m.provider === p.id && (!options.visionOnly || m.supportsVision)) })).filter(g => g.models.length);
    return <ModelPicker label={label} value={value} groups={groups} change={change} disabled={options.disabled}
      missing={snapshot.keys[value.provider] ? 'Custom' : 'Needs a key'} />;
  }
  const title = sections.find(s => s.id === section)?.label ?? 'Settings';
  const shell = (content: ReactNode) => <main className="settings-view">
    <h1>{title}</h1>
    {loadError && <p className="field-error" role="alert">{loadError}</p>}
    {content}
    {toast && <div className="toast" role="status">{toast}</div>}
  </main>;
  if (!snapshot) return shell(!loadError && <p className="loading"><Working text="Loading…" /></p>);
  const s = snapshot.settings, hotkey = s.hotkey ?? ['Control', 'Meta'];
  const mainModel = snapshot.models.find(m => encode(m) === encode(s.model));
  let visionName = 'your vision model';
  try { if (mainModel) visionName = routeVision(mainModel, s.visionModel, snapshot.models, p => !!snapshot.keys[p]).label; } catch { /* none configured yet */ }

  switch (section) {
    case 'general': return shell(<Group>
      <div className="setting-row stacked"><HotkeyRecorder value={hotkey} change={value => update({ hotkey: value })} /></div>
      <SwitchRow label="Launch at startup" description="Start Kite when you sign in to Windows." checked={!!s.launchOnStartup} change={v => update({ launchOnStartup: v })} />
      <SwitchRow label="Reduce motion" description="Calmer motion for the kite and the overlay, even if Windows animations are on." checked={!!s.reducedMotion} change={v => update({ reducedMotion: v })} />
      <Row label="Kite size" description="Larger is easier to see on high-resolution screens.">
        <select aria-label="Kite size" value={s.kiteSize ?? 'standard'} onChange={e => update({ kiteSize: e.target.value as KiteSize })}>
          {(Object.keys(kiteSizeLabels) as KiteSize[]).map(size => <option key={size} value={size}>{kiteSizeLabels[size]}</option>)}</select></Row>
      {/* The kite's character, within its rules (docs/design.md K-15): how much it moves, and what it wears. */}
      <Row label="Liveliness" description="How much the kite moves on its own. Calm halves its idle motion; it still shows what it's doing.">
        <select aria-label="Liveliness" value={s.liveliness ?? 'lively'} onChange={e => update({ liveliness: e.target.value as Liveliness })}>
          {[...livelinessLevels].reverse().map(level => <option key={level} value={level}>{livelinessLabels[level]}</option>)}</select></Row>
      <Row label="Kite color" description="The logo stays rose.">
        <span className="kite-color-preview" data-skin={s.kiteSkin ?? 'rose'} aria-hidden="true"><SailMark size={22} live /></span>
        <select aria-label="Kite color" value={s.kiteSkin ?? 'rose'} onChange={e => update({ kiteSkin: e.target.value as KiteSkin })}>
          {kiteSkins.map(skin => <option key={skin} value={skin}>{skinLabels[skin]}</option>)}</select></Row>
    </Group>);
    case 'models': return shell(<>
      <Group title="Providers" hint="Groq turns your voice into text. Add at least one more provider for answers. Keys stay encrypted on this computer.">
        {providers.map(p => <ProviderRow key={p.id} id={p.id} label={p.label} badge={p.badge} snapshot={snapshot} toast={setToast} />)}</Group>
      <Group title="Models">
        <Row label="Main model" description="Answers every question.">{picker('Main model', s.model, model => update({ model }))}</Row>
        <Row label="Vision model" description="Looks at your screen when you circle something or approve a look.">{picker('Vision model', s.visionModel, visionModel => update({ visionModel }), { visionOnly: true })}</Row>
      </Group>
      {/* The backup model and custom IDs are for when the defaults don't fit (UX-55). */}
      <details className="advanced"><summary>Advanced</summary>
        <div className="group-card">
          <SwitchRow label="Retry on a backup model" description="Only after a connection error, server error, or rate limit, before the first word arrives."
            checked={s.fallbackEnabled} change={v => update({ fallbackEnabled: v })} />
          <Row label="Backup model">{picker('Backup model', s.fallback, fallback => update({ fallback }), { disabled: !s.fallbackEnabled })}</Row>
        </div>
        <div className="custom-model"><strong>Use a custom model ID</strong><label>Provider<select value={customProvider} onChange={e => setCustomProvider(e.target.value as ProviderId)}>
          {providers.map(p => <option key={p.id} value={p.id} disabled={!snapshot.keys[p.id]}>{p.label}</option>)}</select></label>
          <label>Model ID<input value={customId} onChange={e => setCustomId(e.target.value)} placeholder="Exact API model ID" /></label>
          <div className="custom-actions"><button disabled={!customId.trim() || !snapshot.keys[customProvider]} onClick={() => update({ model: { provider: customProvider, id: customId.trim() } })}>Use as main model</button>
            <button disabled={!customId.trim() || !snapshot.keys[customProvider]} onClick={() => update({ fallback: { provider: customProvider, id: customId.trim() } })}>Use as backup</button></div></div>
      </details>
    </>);
    case 'voice': return shell(<>
      <Group title="Cartesia" hint="Optional. Gives Kite a voice; without it, answers are text only."><ProviderRow id="cartesia" label="Cartesia" snapshot={snapshot} toast={setToast} /></Group>
      {/* Without a key the voice controls can't do anything, so one line says what would turn them on (UX-56). */}
      <Group>{snapshot.keys.cartesia ? <>
        <SwitchRow label="Speak replies" checked={s.ttsEnabled} change={v => update({ ttsEnabled: v })} />
        <Row label="Voice"><select aria-label="Voice" value={s.voiceId} onChange={e => update({ voiceId: e.target.value })}>
          <option value="">Choose a voice</option>{snapshot.voices.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
          <BusyButton disabled={!s.ttsEnabled} run={() => operation(() => window.kite.previewVoice(), 'Playing a preview.')}>Preview</BusyButton></Row>
        <Row label="Speed" description={s.speed === 1 ? 'Normal' : `${s.speed.toFixed(2)}×`}>
          <span className="range-field" style={{ '--normal': speedAt(1) } as CSSProperties}>
            <input className="range" aria-label="Speed" aria-valuetext={s.speed === 1 ? 'Normal' : `${s.speed.toFixed(2)} times`} type="range" min={SPEED.min} max={SPEED.max} step="0.05" value={s.speed}
              style={{ '--fill': `${speedAt(s.speed) * 100}%` } as CSSProperties} onChange={e => update({ speed: Number(e.target.value) })} />
            <button type="button" className="range-tick" onClick={() => update({ speed: 1 })}>Normal</button></span></Row>
      </> : <div className="setting-row"><span className="row-text"><span className="row-label">Add a Cartesia key to hear Kite speak.</span>
        <small>Until then, answers are text only.</small></span></div>}</Group>
      <Group title="Sounds">
        <SwitchRow label="Sound cues" checked={!!s.earcons} change={v => { update({ earcons: v }); if (v) previewEarcons(); }}
          description="A short chirp when Kite starts listening, a soft note when you let go, and a chime when Kite needs your OK." />
      </Group>
    </>);
    case 'privacy': return shell(<>
      <Group title="Screenshots" hint={<>Hold <Keycaps keys={hotkey} /> and draw to ask about something on screen. “Kite is looking” appears every time Kite captures your screen.</>}>
        <SwitchRow label="Keep screenshots in history" description="Off: screenshots stay in memory and are gone after the answer." checked={s.keepScreenshots} change={v => update({ keepScreenshots: v })} />
      </Group>
      <Group title="What leaves this PC"><ul className="flow-list">
        <li>Your voice goes to Groq to become text.</li>
        <li>Your questions, and anything you let Kite read, go to {mainModel?.label ?? 'your main model'}.</li>
        <li>Screenshots go to {visionName}, only when you circle something or approve a look.</li>
        <li>With a voice turned on, answers go to Cartesia to be spoken.</li>
        <li>Guides and tasks say on their approval card what they send.</li>
        <li>Your keys and history stay on this computer. Keys are encrypted.</li>
      </ul></Group>
    </>);
    case 'actions': return shell(<>
      <Group title="Actions">
        <Row label="Search engine"><select aria-label="Search engine" value={s.searchEngine} onChange={e => update({ searchEngine: e.target.value as AppSettings['searchEngine'] })}>
          <option value="google">Google</option><option value="bing">Bing</option><option value="duckduckgo">DuckDuckGo</option></select></Row>
        <Row label="Apps" description="Kite finds apps in your Start menu."><BusyButton run={() => operation(() => window.kite.rescanApps(), 'Apps rescanned.')}>Rescan apps</BusyButton></Row>
        <SwitchRow label="Show me how" checked={s.guideMode ?? true} change={v => update({ guideMode: v })}
          description="Ask “how do I…?” and Kite points at each control, step by step. It reads control names with Windows UI Automation and never clicks for you." />
        <SwitchRow label="Whiteboard" checked={s.whiteboard ?? true} change={v => update({ whiteboard: v })}
          description="Kite explains ideas with hand-drawn diagrams, one piece at a time, while it talks." />
        <SwitchRow label="Do it for me" checked={s.computerUse ?? true} change={v => update({ computerUse: v })}
          description="After you approve a task, Kite clicks and types in one app. It never moves your pointer, asks again before anything that sends, deletes, buys, or submits, and stops after 15 steps." />
      </Group>
      <Group title="Ask before I…">
        {configurableTools.map(name => <SwitchRow key={name} label={toolLabels[name]} checked={s.toolApprovals?.[name] ?? askByDefault(name)} change={v => update({ toolApprovals: { [name]: v } })} />)}
        <div className="setting-row always-ask"><LockIcon /><span className="row-text"><span className="row-label">Always asks in this version</span><small>{alwaysAsks.join(' · ')}</small></span></div>
      </Group>
    </>);
    case 'about': return shell(<>
      <Group>
        <Row label={`Kite ${about?.version ?? ''}`.trim()} description={about ? `Updates: ${about.updateStatus}` : undefined}>
          {about?.updateReady && <button className="primary" onClick={() => window.kite.aboutAction('restart')}>Restart to update</button>}</Row>
        <Row label="Tutorial" description="Walk through setup again."><button onClick={() => window.kite.openView('onboarding')}>Replay tutorial</button></Row>
        <Row label="Logs" description="Diagnostic logs never include what you say or ask."><button onClick={() => window.kite.aboutAction('logs')}>Open logs folder</button></Row>
        <Row label="Report a problem" description="Opens a GitHub issue with your Kite and Windows versions filled in."><button onClick={() => window.kite.aboutAction('report')}>Report a problem</button></Row>
      </Group>
      <p className="group-hint">Hold <Keycaps keys={hotkey} /> to speak. Press it again to interrupt. Esc stops whatever Kite is doing.</p>
    </>);
  }
}
