import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SailMark } from '../kite/SailMark';
import { layoutGuide } from '../../shared/guide';
import type { TaskAction, TaskView } from '../../shared/agent';
import type { ScreenBounds } from '../../shared/types';
import { cursorInput } from '../kite/useKiteLoop';
import { react } from '../voice/runtime';
import { ringPaths } from '../guide/ring';
import { taskRuntime } from './runtime';
const overlaps = (a: ScreenBounds, b: ScreenBounds) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const ended = (view: TaskView) => ['done', 'failed', 'stopped'].includes(view.status);
const heading: Partial<Record<TaskView['status'], string>> = { done: 'Done', failed: 'Couldn’t finish', stopped: 'Stopped', paused: 'Paused', approval: 'Your OK', asking: 'Question' };
/**
 * The task card: what Kite is doing, the step budget, confirmations, and a Stop button that is always there.
 * The kite points at each control before it is used, with the same marker ring as guide mode.
 */
export function TaskLayer() {
  const [view, setView] = useState<TaskView | null>(null);
  const [size, setSize] = useState({ width: 320, height: 220 });
  const card = useRef<HTMLElement>(null), previous = useRef<TaskView | null>(null);
  useEffect(() => {
    const off = window.kite.onTaskEvent(next => {
      const before = previous.current; previous.current = next;
      if (next && before?.id === next.id && next.status !== before.status) {
        if (next.status === 'approval') react('proposing');
        else if (next.status === 'done') react('success');
        else if (next.status === 'failed') react('tangled');
        else if (next.status === 'stopped' || next.status === 'paused') react('flinch');
        else if (next.status === 'acting') react('approved', 0.5);
      } else if (next && before?.id !== next.id) react('perk');
      setView(next);
    });
    return () => { off(); taskRuntime.anchor = null; taskRuntime.aim = null; window.kite.setTaskBounds(null); };
  }, []);
  const geometry = cursorInput.geometry, origin = geometry?.origin ?? { x: 0, y: 0 };
  const local = (r: ScreenBounds) => ({ ...r, x: r.x - origin.x, y: r.y - origin.y });
  const display = view?.display ? local(view.display) : geometry ? local(geometry.display) : { x: 0, y: 0, width: innerWidth, height: innerHeight };
  const target = view?.target && !ended(view) && view.status !== 'paused' ? local(view.target) : null;
  const layout = useMemo(() => target ? layoutGuide(target, display, { width: 0, height: 0 }) : null,
    [target?.x, target?.y, target?.width, target?.height, display.x, display.y, display.width, display.height]);
  const ring = view && layout && (view.status === 'acting' || view.status === 'approval');
  const paths = useMemo(() => ring && layout ? ringPaths(layout.ring, view.id * 97 + view.step) : [], [ring, layout, view?.id, view?.step]);
  useEffect(() => {
    taskRuntime.anchor = layout?.anchor ?? null; taskRuntime.aim = layout?.aim ?? null;
  }, [layout]);
  // Top-right of the app's display; bottom-right when that would cover the control being used.
  let position = { x: display.x + display.width - size.width - 16, y: display.y + 16 };
  if (target && overlaps({ ...position, ...size }, { x: target.x - 12, y: target.y - 12, width: target.width + 24, height: target.height + 24 }))
    position = { x: position.x, y: display.y + display.height - size.height - 64 };
  useLayoutEffect(() => {
    const element = card.current;
    if (!view || !element) { window.kite.setTaskBounds(null); return; }
    const width = element.offsetWidth, height = element.offsetHeight;
    if (Math.abs(width - size.width) > 2 || Math.abs(height - size.height) > 2) { setSize({ width, height }); return; }
    window.kite.setTaskBounds({ x: position.x, y: position.y, width, height });
  });
  if (!view) return null;
  const control = (action: TaskAction) => window.kite.taskControl(action);
  const finished = ended(view);
  return <div className="task-layer">
    {ring && <svg className="guide-ring" key={`${view.id}:${view.step}`} aria-hidden="true">
      {paths.map((d, i) => <path key={i} d={d} pathLength={1} className={`pass-${i}`} />)}
    </svg>}
    <section ref={card} className={`task-card ${view.status}`} aria-label="Kite is doing a task" style={{ transform: `translate(${position.x}px, ${position.y}px)` }}>
      <header><SailMark /><strong>{heading[view.status] ?? 'Doing it'} · {view.app}</strong>
        <span className="task-progress">Step {view.step} of {view.budget}</span></header>
      <div className="task-meter" aria-hidden="true"><span style={{ width: `${Math.min(100, view.step / view.budget * 100)}%` }} /></div>
      <p className="task-goal">{view.goal}</p>
      {view.action && <p className="task-action"><span>{view.status === 'approval' ? 'Next' : 'Now'}</span>{view.action}</p>}
      {view.message && <p className="task-message" role="status" aria-live="polite">{view.message}</p>}
      {view.status === 'approval' && <div className="task-approval">
        <button className="primary" onClick={() => control('allow')}>{view.risk ? 'Allow' : 'Allow once'}</button>
        {view.scope === 'once' && !view.risk && <button onClick={() => control('allowAll')}>Allow the rest</button>}
        <button onClick={() => control('skip')}>Skip</button>
      </div>}
      {view.log.length > 0 && <ol className="task-log">{view.log.map((entry, i) => <li key={i} className={entry.ok ? 'ok' : 'bad'}>{entry.text}</li>)}</ol>}
      {!finished && <div className="task-actions">
        <button onClick={() => control(view.status === 'paused' ? 'resume' : 'pause')}>{view.status === 'paused' ? 'Resume' : 'Pause'}</button>
        <button className="task-stop danger" onClick={() => control('stop')}>Stop</button>
      </div>}
      {!finished && <small className="task-hint">Say “stop” or press Esc anytime. Touching your mouse or keyboard pauses me. I never move your pointer.</small>}
    </section>
  </div>;
}
