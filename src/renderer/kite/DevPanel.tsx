import { useEffect, useRef, useState } from 'react';
import type { KiteMood } from '../../shared/types';
import { useKiteStore } from '../store/kite';
import { config } from './config';
import { runtime } from './runtime';
import { cursorInput } from './useKiteLoop';
import type { OneShot } from './behaviors';

const sliders = [
  { key: 'stiffness', label: 'Spring stiffness', min: 100, max: 700, step: 10 },
  { key: 'damping', label: 'Damping', min: 10, max: 50, step: 1 },
  { key: 'wagAmplitude', label: 'Wag amplitude', min: 0, max: 6, step: 0.1 },
  { key: 'wagFrequency', label: 'Wag frequency', min: 0.2, max: 8, step: 0.1 },
] as const;

export default function DevPanel() {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const panel = useRef<HTMLElement>(null), stats = useRef<HTMLOutputElement>(null);
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
    <output ref={stats}>Measuring FPS…</output>
    <div className="dev-buttons">{(['idle', 'listening', 'thinking', 'talking'] as KiteMood[]).map(value =>
      <button key={value} aria-pressed={mood === value} onClick={() => useKiteStore.getState().setMood(value)}>{value}</button>)}</div>
    <p>Preview a personality beat</p>
    <div className="dev-buttons">{(['gust', 'wake', 'dizzy'] as OneShot[]).map(value =>
      <button key={value} onClick={() => { useKiteStore.getState().setMood('idle'); runtime.trigger = value; }}>{value === 'wake' ? 'wake-up' : value}</button>)}</div>
    {sliders.map(({ key, label, min, max, step }) => <label key={key}>{label}
      <input type="range" min={min} max={max} step={step} defaultValue={config[key]}
        onChange={event => { config[key] = Number(event.target.value); }} />
    </label>)}
    <label className="dev-check"><input type="checkbox" defaultChecked={config.eyes} onChange={event => { config.eyes = event.target.checked; }} /> Eyes + blink</label>
    <label className="dev-check"><input type="checkbox" defaultChecked={runtime.fakeLevels} onChange={event => { runtime.fakeLevels = event.target.checked; }} /> Simulated audio / speech levels</label>
    <small>Ctrl/⌘ + Shift + D to toggle. Desktop clicks pass through outside this panel.</small>
  </aside>;
}
