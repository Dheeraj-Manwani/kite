import { useEffect, useState } from 'react';
import { SailMark } from '../kite/SailMark';
import { useSettings } from '../hooks/useSettings';
import { hotkeyLabel } from '../../shared/release';
import { approvalAction } from './approvalAction';
import type { ApprovalCard as Card } from '../../shared/types';
/** Planned guide steps, shown as plain text so the user can check the route before approving. */
function guideSteps(input: unknown): string[] {
  const steps = (input as { steps?: unknown } | null)?.steps;
  return Array.isArray(steps) ? steps.map(s => (s as { instruction?: unknown })?.instruction).filter((s): s is string => typeof s === 'string').slice(0, 15) : [];
}
export function ApprovalCard({ card }: { card: Card }) {
  const [now, setNow] = useState(Date.now()), [busy, setBusy] = useState(false), settings = useSettings();
  const hotkey = settings ? hotkeyLabel(settings.settings.hotkey) : '';
  useEffect(() => { setBusy(false); const timer = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(timer); }, [card.approvalId]);
  const left = Math.max(0, card.expiresAt - now), seconds = Math.ceil(left / 1000);
  const decide = async (approved: boolean, scope?: 'task' | 'once') => {
    setBusy(true);
    try { const result = await window.kite.approveTool(card.approvalId, approved, scope); if (!result.ok) setBusy(false); }
    catch { setBusy(false); }
    finally { window.kite.setOverlayInteractive(false); }
  };
  // The question is the title; the countdown is calm until its last 5 seconds (UX-22).
  return <section className="approval-card" aria-label="Confirm action">
    <div className="approval-heading"><SailMark /><p className="approval-summary">{card.summary}</p></div>
    {card.toolName === 'show_me_how' && <ol className="approval-steps">{guideSteps(card.input).map((step, i) => <li key={i}>{step}</li>)}</ol>}
    {card.dryRun && <small>Preview only. Nothing will run.</small>}
    {card.toolName === 'type_text' && <small>Focus the destination app first. Voice approval is recommended.</small>}
    <div className="approval-actions">
      {card.toolName === 'do_task'
      ? <div className="approval-buttons"><button className="primary" disabled={busy || !seconds} onClick={() => { void decide(true, 'task'); }}>{approvalAction(card)}</button>
        <button disabled={busy || !seconds} onClick={() => { void decide(true, 'once'); }}>Step by step</button>
        <button className="ghost" disabled={busy || !seconds} onClick={() => { void decide(false); }}>Not now</button></div>
      : <div className="approval-buttons"><button className="primary" disabled={busy || !seconds} onClick={() => { void decide(true); }}>{approvalAction(card)}</button><button className="ghost" disabled={busy || !seconds} onClick={() => { void decide(false); }}>Not now</button></div>}
      <span className={`approval-countdown${seconds <= 5 ? ' ending' : ''}`} role="timer" aria-label={`Auto-cancels in ${seconds} seconds`}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><circle className="countdown-track" cx="10" cy="10" r="8" />
          <circle className="countdown-arc" cx="10" cy="10" r="8" strokeDasharray={`${50.27 * left / 30000} 50.27`} transform="rotate(-90 10 10)" /></svg>
        Auto-cancels in {seconds} s</span>
    </div>
    {card.toolName === 'do_task' && <small>“Allow this task” lets ordinary steps run; anything that sends, deletes, buys, or submits still asks. “Step by step” asks before every step.</small>}
    <small>Or hold {hotkey || 'your shortcut'} and say “yes” or “no”.</small>
    <details className="approval-details"><summary>Details</summary><code>{card.toolName}</code><pre>{JSON.stringify(card.input, null, 2)}</pre></details>
  </section>;
}
