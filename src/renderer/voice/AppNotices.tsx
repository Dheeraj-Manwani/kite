import { useEffect, useRef, useState } from 'react';
import { runtime } from '../kite/runtime';
import { react, voiceRuntime } from './runtime';

interface Notice { text: string; ms: number; at: number; action?: { label: string; run(): void } }

/**
 * App notices as small bubbles from the kite (docs/ui-ux-improvements.md UX-18): pause, resume, an update, a fault.
 * They take the answer bubble's place, tail, and hit-test, wait while an answer is showing, and hold under the pointer.
 * The overlay's app events all land here, so what the kite does and what it says stay in step.
 */
export function AppNotices() {
  const [notice, setNotice] = useState<Notice | null>(null), [shown, setShown] = useState(false);
  const element = useRef<HTMLElement>(null), current = useRef<Notice | null>(null), pending = useRef<Notice | null>(null);
  const until = useRef(0), hovered = useRef(false);
  const hide = () => {
    current.current = null; setShown(false); voiceRuntime.notice = null;
    if (hovered.current) { hovered.current = false; voiceRuntime.hover = false; }
    if (!voiceRuntime.bubble) { window.kite.setBubbleBounds(null); window.kite.setOverlayInteractive(false); }
  };
  useEffect(() => {
    let leave: ReturnType<typeof setTimeout> | undefined, welcome: ReturnType<typeof setTimeout> | undefined;
    const say = (text: string, ms: number, action?: Notice['action']) => { pending.current = { text, ms, at: performance.now(), action }; };
    const off = window.kite.onAppEvent(e => {
      if (e.type === 'paused') {
        document.documentElement.classList.add('kite-paused'); clearTimeout(welcome); clearTimeout(leave);
        // It says goodbye, then reels out of sight (personality.md §5.3).
        say('Paused — see you soon.', 1300); leave = setTimeout(() => { runtime.away = 'leave'; }, 1300);
      } else if (e.type === 'resumed') {
        document.documentElement.classList.remove('kite-paused'); clearTimeout(leave); clearTimeout(welcome);
        // It drifts back down to the cursor first, then says hello.
        runtime.away = 'return'; welcome = setTimeout(() => say('Welcome back.', 3000), 1100);
      } else if (e.type === 'update:ready') {
        react('costume', .5); say('I have an update ready.', 15000, { label: 'Restart', run: () => window.kite.aboutAction('restart') });
      } else if (e.type === 'fault') {
        react('tangled'); say('Something went wrong. Try again, or open the logs.', 12000, { label: 'Open logs', run: () => window.kite.aboutAction('logs') });
      } else if (e.type === 'onboarding:done') runtime.flight = e.from;
    });
    // One notice at a time, and never over an answer: it waits, and a notice that waited past its moment is dropped.
    const timer = setInterval(() => {
      const now = performance.now(), busy = !!voiceRuntime.bubble;
      if (current.current && (busy || (!hovered.current && now > until.current))) hide();
      const next = pending.current;
      if (!current.current && next && !busy) {
        pending.current = null;
        if (now - next.at < next.ms) { current.current = next; until.current = now + next.ms; setNotice(next); setShown(true); }
      }
    }, 150);
    return () => { off(); clearInterval(timer); clearTimeout(leave); clearTimeout(welcome); voiceRuntime.notice = null; };
  }, []);
  useEffect(() => { if (shown) voiceRuntime.notice = element.current; }, [shown]);
  const hover = (value: boolean) => {
    if (!shown) return;
    hovered.current = value; voiceRuntime.hover = value; window.kite.setOverlayInteractive(value);
    if (!value) until.current = Math.max(until.current, performance.now() + 1500);
  };
  return <aside ref={element} className={`speech-bubble notice${shown ? ' visible' : ''}`} aria-hidden={!shown}
    onPointerEnter={() => hover(true)} onPointerLeave={() => hover(false)}>
    <div className="bubble-body"><span role="status">{shown ? notice?.text : ''}</span>
      {shown && notice?.action && <button className="primary" onClick={() => { notice.action?.run(); hide(); }}>{notice.action.label}</button>}</div>
  </aside>;
}
