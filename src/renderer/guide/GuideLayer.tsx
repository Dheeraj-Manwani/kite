import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { layoutGuide, type GuideAction, type GuideView } from '../../shared/guide';
import type { ScreenBounds } from '../../shared/types';
import { cursorInput } from '../kite/useKiteLoop';
import { react } from '../voice/runtime';
import { guideRuntime } from './runtime';
import { ringPaths } from './ring';
const estimate = { width: 280, height: 150 };
function message(view: GuideView) {
  switch (view.status) {
    case 'locating': return view.instruction;
    case 'pointing': return view.instruction;
    case 'lost': return `I can't spot “${view.target}” yet. Bring ${view.app} to the front and I'll keep looking.`;
    case 'paused': return `Paused on step ${view.index + 1}. Say “continue” or press Resume.`;
    case 'done': return 'All done — nice work!';
  }
}
/** Hand-drawn ring around the current control plus a step card. The kite's flight reads guideRuntime. */
export function GuideLayer() {
  const [view, setView] = useState<GuideView | null>(null);
  const [size, setSize] = useState(estimate);
  const card = useRef<HTMLElement>(null), previous = useRef<GuideView | null>(null);
  useEffect(() => {
    const off = window.kite.onGuideEvent(next => {
      const before = previous.current; previous.current = next;
      if (next && before?.id === next.id) {
        if (next.completed > before.completed && next.status !== 'done') react('approved');
        if (next.status === 'done' && before.status !== 'done') react('success');
        if (next.status === 'lost' && before.status !== 'lost') react('puzzled');
      } else if (next) react('perk');
      setView(next);
    });
    return () => { off(); guideRuntime.anchor = null; guideRuntime.aim = null; window.kite.setGuideBounds(null); };
  }, []);
  const geometry = cursorInput.geometry, origin = geometry?.origin ?? { x: 0, y: 0 };
  const local = (r: ScreenBounds) => ({ ...r, x: r.x - origin.x, y: r.y - origin.y });
  // The overlay origin only changes with display layout, which re-emits the view.
  const layout = useMemo(() => view?.rect && view.display ? layoutGuide(local(view.rect), local(view.display), size) : null, [view, size, origin.x, origin.y]);
  const pointing = view?.status === 'pointing' && !!layout;
  const paths = useMemo(() => pointing && layout && view ? ringPaths(layout.ring, view.id * 31 + view.index) : [], [pointing, layout, view]);
  useEffect(() => {
    // Between steps the kite hovers where it was; lost, paused, and done hand it back to the cursor.
    if (pointing && layout) { guideRuntime.anchor = layout.anchor; guideRuntime.aim = layout.aim; }
    else if (view?.status !== 'locating') { guideRuntime.anchor = null; guideRuntime.aim = null; }
  }, [pointing, layout, view?.status]);
  const position = layout?.card ?? (geometry
    ? { x: geometry.display.x - origin.x + geometry.display.width - size.width - 24, y: geometry.display.y - origin.y + geometry.display.height - size.height - 72 }
    : { x: 24, y: 24 });
  useLayoutEffect(() => {
    const element = card.current;
    if (!view || !element) { window.kite.setGuideBounds(null); return; }
    const width = element.offsetWidth, height = element.offsetHeight;
    if (Math.abs(width - size.width) > 2 || Math.abs(height - size.height) > 2) { setSize({ width, height }); return; }
    // While the next control is found, a just-opened menu may be under the card: let clicks through.
    window.kite.setGuideBounds(view.status === 'locating' ? null : { x: position.x, y: position.y, width, height });
  });
  if (!view) return null;
  const control = (action: GuideAction) => window.kite.guideControl(action);
  const last = view.index === view.total - 1;
  return <div className="guide-layer">
    {pointing && <svg className="guide-ring" key={`${view.id}:${view.index}`} aria-hidden="true">
      {paths.map((d, i) => <path key={i} d={d} pathLength={1} className={`pass-${i}`} />)}
    </svg>}
    <section ref={card} className={`guide-card ${view.status}`} aria-label="Show me how" style={{ transform: `translate(${position.x}px, ${position.y}px)` }}>
      <header><span aria-hidden="true">◇</span><strong>Show me how</strong>
        <span className="guide-progress">{view.status === 'done' ? `${view.total} of ${view.total}` : `Step ${view.index + 1} of ${view.total}`}</span></header>
      <div className="guide-dots" aria-hidden="true">{Array.from({ length: view.total }, (_, i) =>
        <span key={i} className={view.status === 'done' || i < view.index ? 'done' : i === view.index ? 'current' : ''} />)}</div>
      <p className="guide-instruction" role="status" aria-live="polite">{message(view)}</p>
      {(view.status === 'pointing' || view.status === 'locating') && <div className="guide-target">
        <span>{view.status === 'locating' ? 'Looking for' : 'Click'}</span><strong>{view.target}</strong>
        {view.status === 'pointing' && view.source === 'vision' && <small>found on screen</small>}
      </div>}
      {view.status !== 'done' && <div className="guide-actions">
        <button onClick={() => control('back')} disabled={view.index === 0}>Back</button>
        <button onClick={() => control(view.status === 'paused' ? 'resume' : 'pause')}>{view.status === 'paused' ? 'Resume' : 'Pause'}</button>
        <button onClick={() => control('next')}>{last ? 'Finish' : 'Skip'}</button>
        <button className="guide-stop" onClick={() => control('stop')}>Stop</button>
      </div>}
      {view.status !== 'done' && <small className="guide-hint">Say “wait”, “next”, or “stop” anytime. I only point; you click.</small>}
    </section>
  </div>;
}
