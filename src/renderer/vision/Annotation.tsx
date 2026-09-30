import { useEffect, useRef, useState } from 'react';
import { getStroke } from 'perfect-freehand';
import { analyzeStrokes, contains, type ScreenEvent, type Stroke } from '../../shared/vision';
import { visionRuntime as vr } from './runtime';
import { cursorInput } from '../kite/useKiteLoop';
export function Annotation() {
  const [preparing, setPreparing] = useState(false);
  const [mode, setMode] = useState<Extract<ScreenEvent, { type: 'annotate' }> | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]), [looking, setLooking] = useState(false), [fading, setFading] = useState(false), [pulse, setPulse] = useState(false);
  const active = useRef<number | null>(null), current = useRef(mode), fadeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    const leave = () => { setPreparing(false); current.current = null; setMode(null); vr.drawing = false; vr.pen = null; active.current = null; window.kite.setOverlayInteractive(false); };
    const clear = () => { leave(); clearTimeout(fadeTimer.current); vr.strokes = []; vr.glanceUntil = 0; vr.target = null; setStrokes([]); setFading(false); };
    const screen = window.kite.onScreenEvent(event => {
      if (event.type === 'looking') {
        document.documentElement.classList.toggle('capture-hidden', event.hidden);
        setLooking(event.active);
        if (event.active && !event.hidden) vr.blinkUntil = performance.now() + 180;
        if (event.hidden) requestAnimationFrame(() => requestAnimationFrame(() => window.kite.screenHidden(event.token)));
      } else if (event.type === 'prepare') {
        void import('./images').then(m => m.prepareImages(event.png, event.display, event.strokes, event.crop)).then(images => window.kite.screenPrepared(event.token, images)).catch(() => window.kite.screenPrepared(event.token, null));
      } else if (event.type === 'annotate') {
        if (vr.id !== event.id) return;
        setPreparing(false); current.current = event; setMode(event); vr.drawing = true; window.kite.setOverlayInteractive(true);
      } else clear();
    });
    let approvalPending = false;
    let suspended: { id: number; strokes: Stroke[]; target: typeof vr.target } | undefined;
    const voice = window.kite.onVoiceEvent(event => {
      if (event.type === 'approval:resume' && suspended?.id === event.id) {
        vr.id = suspended.id; vr.strokes = suspended.strokes; vr.target = suspended.target;
        setStrokes([...vr.strokes]); suspended = undefined; approvalPending = false; return;
      }
      if (event.type === 'ptt:start') {
        suspended = approvalPending ? { id: vr.id, strokes: vr.strokes, target: vr.target } : undefined;
        clear(); setPreparing(!suspended); vr.id = event.id; setPulse(false); approvalPending = false;
        if (suspended) setStrokes(suspended.strokes);
      }
      if (event.id !== vr.id) return;
      if (event.type === 'tool:approvalRequired') approvalPending = true;
      if (event.type === 'tool:decision') approvalPending = false;
      if (event.type === 'ptt:stop') {
        leave(); setPulse(vr.strokes.length > 0);
        const r = analyzeStrokes(vr.strokes).union; vr.target = r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
      }
      if (event.type === 'llm:delta' && !vr.glanceUntil) vr.glanceUntil = performance.now() + 650;
      if (event.type === 'vision:done') { leave(); setFading(true); fadeTimer.current = setTimeout(clear, 800); }
      if (['ptt:cancel', 'ptt:tooShort', 'voice:empty', 'voice:aborted', 'llm:error'].includes(event.type)) clear();
    });
    return () => { screen(); voice(); clear(); document.documentElement.classList.remove('capture-hidden'); };
  }, []);
  const point = (e: React.PointerEvent) => ({ x: e.clientX, y: e.clientY, t: performance.now() });
  const publish = () => setStrokes(vr.strokes.map(s => [...s]));
  const add = (e: React.PointerEvent) => {
    if (active.current !== e.pointerId || !current.current) return;
    const p = point(e); vr.pen = p;
    if (vr.strokes.reduce((n, s) => n + s.length, 0) >= 2000) return;
    const s = vr.strokes.at(-1), last = s?.at(-1);
    if (last && Math.hypot(p.x - last.x, p.y - last.y) >= 1) { s.push(p); publish(); }
  };
  const geometry = cursorInput.geometry;
  const indicator = geometry ? { left: geometry.display.x - geometry.origin.x + 24, top: geometry.display.y - geometry.origin.y + 24 } : { left: 24, top: 24 };
  return <>
    {looking && <div className="screen-looking" style={indicator} role="status">Kite is looking</div>}
    <svg className={`annotation ${mode ? 'drawing' : ''} ${preparing ? 'preparing' : ''} ${fading ? 'fading' : ''} ${pulse ? 'pulse' : ''}`}
      onPointerDown={e => {
        e.preventDefault(); e.stopPropagation(); const m = current.current;
        if (!m || e.button !== 0 || active.current !== null || vr.strokes.length >= 5 || vr.strokes.reduce((n, s) => n + s.length, 0) >= 2000) return;
        const p = point(e); if (!contains(m.display.bounds, { x: p.x + m.origin.x, y: p.y + m.origin.y })) return;
        e.currentTarget.setPointerCapture(e.pointerId); active.current = e.pointerId; vr.strokes.push([p]); vr.pen = p; publish();
      }} onPointerMove={add} onPointerUp={e => { add(e); active.current = null; }} onPointerCancel={() => { active.current = null; }}>
      {strokes.map((s, i) => {
        const outline = getStroke(s.map(p => [p.x, p.y]), { size: 5, thinning: .45, smoothing: .6, simulatePressure: true });
        return <path key={i} d={outline.length ? `M${outline.map(p => p.join(',')).join('L')}Z` : ''} />;
      })}
    </svg>
  </>;
}
