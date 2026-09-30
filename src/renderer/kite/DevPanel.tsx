import { useEffect, useRef, useState } from 'react';
import type { KiteMood, ToolAudit } from '../../shared/types';
import { useKiteStore } from '../store/kite';
import { config } from './config';
import { runtime } from './runtime';
import { cursorInput } from './useKiteLoop';
import type { OneShot } from './behaviors';
import { voiceRuntime } from '../voice/runtime';

const sliders = [
  { key: 'stiffness', label: 'Spring stiffness', min: 100, max: 700, step: 10 },
  { key: 'damping', label: 'Damping', min: 10, max: 50, step: 1 },
  { key: 'wagAmplitude', label: 'Wag amplitude', min: 0, max: 6, step: 0.1 },
  { key: 'wagFrequency', label: 'Wag frequency', min: 0.2, max: 8, step: 0.1 },
] as const;
// How much of each kind of motion shows (docs/personality.md §5.5).
const motionSliders = [
  { key: 'follow', label: 'Follow (moods change the follow)', min: 0, max: 1, step: 0.05 },
  { key: 'expression', label: 'Expression (poses)', min: 0, max: 1, step: 0.05 },
  { key: 'ambient', label: 'Ambient (breathing, tail)', min: 0, max: 1, step: 0.05 },
] as const;
// The sail's shape dials (docs/personality.md §5.1); 1 is the rest pose.
const sailSliders = [
  { key: 'nose', label: 'Sail nose', min: 0.7, max: 1.4, step: 0.01 },
  { key: 'spread', label: 'Sail spread', min: 0.7, max: 1.3, step: 0.01 },
  { key: 'billow', label: 'Sail billow', min: 0, max: 2.5, step: 0.05 },
  { key: 'slack', label: 'Sail slack', min: 0, max: 2.5, step: 0.05 },
  { key: 'flutter', label: 'Sail flutter', min: -2, max: 2, step: 0.1 },
] as const;

export default function DevPanel() {
  const [calls, setCalls] = useState<ToolAudit[]>([]), [dryRun, setDryRun] = useState(false);
  useEffect(() => { void window.kite.getToolCalls().then(setCalls); void window.kite.getSettings().then(s => setDryRun(s.settings.dryRun)); const a = window.kite.onToolCallsChanged(setCalls), b = window.kite.onSettingsChanged(s => setDryRun(s.settings.dryRun)); return () => { a(); b(); }; }, []);
  const [perf,setPerf] = useState<import('../../shared/release').PerfSnapshot | null>(null);
  useEffect(()=>{const timer=setInterval(()=>{if(runtime.panelOpen)void window.kite.getPerf().then(setPerf);},1500);return()=>clearInterval(timer);},[]);
  const [open, setOpen] = useState(false);
  const [captureResult, setCaptureResult] = useState('');
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const panel = useRef<HTMLElement>(null), stats = useRef<HTMLOutputElement>(null);
  const timing = useRef<HTMLOutputElement>(null);
  const mood = useKiteStore(state => state.mood);
  useEffect(() => window.kite.onDevPanelToggle(() => {
    const geometry = cursorInput.geometry;
    if (geometry) setPosition({
      x: geometry.display.x - geometry.origin.x + 20,
      y: geometry.display.y - geometry.origin.y + 20,
    });
    setOpen(value => !value);
  }), []);
  useEffect(() => {
    runtime.panelOpen = open;
    if (!open || !panel.current) {
      window.kite.setDevPanelBounds(null);
      return;
    }
    const element = panel.current;
    const report = () => {
      const rect = element.getBoundingClientRect();
      window.kite.setDevPanelBounds({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    window.addEventListener('resize', report);
    const timer = setInterval(() => {
      if (stats.current) stats.current.textContent = `${runtime.fps} FPS · ${runtime.behavior}`;
      if (timing.current) {
        const t = voiceRuntime.timing;
        timing.current.textContent = t ? `Capture ${Math.round(t.captureMs ?? 0)}ms · STT ${Math.round(t.transcribeMs)}ms · first token ${Math.round(t.firstTokenMs)}ms · total ${Math.round(t.totalMs)}ms · first audio ${t.ttsFirstAudioMs === undefined ? '—' : Math.round(t.ttsFirstAudioMs) + 'ms'} · voice-to-voice ${t.voiceToVoiceMs === undefined ? '—' : Math.round(t.voiceToVoiceMs) + 'ms'} · avg (20) ${voiceRuntime.voiceAverageMs === undefined ? '—' : Math.round(voiceRuntime.voiceAverageMs) + 'ms'}` : 'Hold Ctrl + Win to speak';
      }
    }, 500);
    return () => {
      observer.disconnect(); window.removeEventListener('resize', report); clearInterval(timer);
      runtime.panelOpen = false; window.kite.setDevPanelBounds(null);
    };
  }, [open, position]);
  if (!open) return null;
  return <aside ref={panel} className="dev-panel" style={{ left: position.x, top: position.y }}
    aria-label="Kite motion preview"
    onPointerEnter={() => window.kite.setOverlayInteractive(true)}
    onPointerLeave={() => window.kite.setOverlayInteractive(false)}>
    <header><strong>Kite / Motion lab</strong><button onClick={() => setOpen(false)} aria-label="Close motion panel">×</button></header>
    <details><summary>Perf</summary>{perf&&<output>Main {perf.mainMB.toFixed(1)} MB · renderer {perf.rendererMB.toFixed(1)} MB · all processes {perf.totalMB.toFixed(1)} MB · CPU {perf.cpu.toFixed(2)}% · frame work {runtime.frameMs.toFixed(2)} ms · voice median {perf.voiceMedianMs===null?'no samples':Math.round(perf.voiceMedianMs)+' ms'} ({perf.voiceSamples})</output>}</details>
    <output ref={stats}>Measuring FPS…</output>
    <output ref={timing}>Hold Ctrl + Win to speak</output>
    <div className="dev-buttons">
      <button onClick={() => window.kite.openSettings()}>API keys</button>
      <button onClick={() => { void window.kite.testCapture().then(result => { setCaptureResult(result.ok ? `Saved test capture: ${result.path}` : result.error); }); }}>Test capture (save PNG)</button>
      <button title="Draws a built-in lesson on the whiteboard; no model needed." onClick={() => { void window.kite.demoBoard().then(result => { setCaptureResult(result.ok ? 'Whiteboard demo playing.' : result.error ?? 'Whiteboard demo unavailable.'); }); }}>Demo whiteboard</button>
      <button title="Tours up to three menus or tabs of the active window. Kite only points." onClick={() => { void window.kite.demoGuide().then(result => { setCaptureResult(result.ok ? 'Guide demo running: click the ringed control.' : result.error ?? 'Guide demo unavailable.'); }); }}>Demo guide</button>
      <button onClick={() => { void window.kite.printRecentMessages().then(result => { if (timing.current) timing.current.textContent = result.ok ? 'Recent message count recorded in the logs; message contents are never logged.' : 'Could not read history.'; }); }}>Log recent message count</button>
    </div>
    {captureResult && <output style={{ overflowWrap: 'anywhere' }}>{captureResult}</output>}
    <div className="dev-buttons">{(['idle', 'listening', 'thinking', 'talking'] as KiteMood[]).map(value =>
      <button key={value} aria-pressed={mood === value} onClick={() => useKiteStore.getState().setMood(value)}>{value}</button>)}</div>
    <label className="dev-check"><input type="checkbox" checked={dryRun} onChange={e => { void window.kite.setDryRun(e.target.checked); }} /> Dry-run actions (no OS effects)</label>
    <details className="tool-audit"><summary>Last 20 tool calls ({calls.length})</summary>{calls.map(call => <div key={call.id}><strong>{call.tool} · {call.decision}{call.dry_run ? ' · dry run' : ''}</strong><div>{call.summary}</div><pre>{call.error ?? call.result_json ?? 'Waiting'}</pre></div>)}</details>
    <p>Preview a personality beat</p>
    <div className="dev-buttons">{(['gust', 'wake', 'dizzy'] as OneShot[]).map(value =>
      <button key={value} onClick={() => { useKiteStore.getState().setMood('idle'); runtime.trigger = value; }}>{value === 'wake' ? 'wake-up' : value}</button>)}</div>
    {sliders.map(({ key, label, min, max, step }) => <label key={key}>{label}
      <input type="range" min={min} max={max} step={step} defaultValue={config[key]}
        onChange={event => { config[key] = Number(event.target.value); }} />
    </label>)}
    {motionSliders.map(({ key, label, min, max, step }) => <label key={key}>{label}
      <input type="range" min={min} max={max} step={step} defaultValue={config.motion[key]}
        onChange={event => { config.motion[key] = Number(event.target.value); }} />
    </label>)}
    {sailSliders.map(({ key, label, min, max, step }) => <label key={key}>{label}
      <input type="range" min={min} max={max} step={step} defaultValue={config.sail[key]}
        onChange={event => { config.sail[key] = Number(event.target.value); }} />
    </label>)}
    <label className="dev-check"><input type="checkbox" defaultChecked={config.eyes} onChange={event => { config.eyes = event.target.checked; }} /> Eyes + blink</label>
    <label className="dev-check"><input type="checkbox" defaultChecked={runtime.fakeLevels} onChange={event => { runtime.fakeLevels = event.target.checked; }} /> Simulated audio / speech levels</label>
    <small>Ctrl/⌘ + Shift + D to toggle. Desktop clicks pass through outside this panel.</small>
  </aside>;
}
