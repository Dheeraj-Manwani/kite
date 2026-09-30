import { useEffect, useState } from 'react';
import { SailMark } from '../kite/SailMark';
import { useHotkeyLabel } from '../hooks/useHotkeyLabel';
import { approvalAction } from './approvalAction';
import type { ApprovalCard as Card } from '../../shared/types';
/** Planned guide steps, shown as plain text so the user can check the route before approving. */
function guideSteps(input: unknown): string[] {
  const steps = (input as { steps?: unknown } | null)?.steps;
  return Array.isArray(steps) ? steps.map(s => (s as { instruction?: unknown })?.instruction).filter((s): s is string => typeof s === 'string').slice(0, 15) : [];
}
export function ApprovalCard({ card }: { card: Card }) {
  const [now, setNow] = useState(Date.now()), [busy, setBusy] = useState(false), hotkey = useHotkeyLabel();
  useEffect(() => { setBusy(false); const timer = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(timer); }, [card.approvalId]);
  const seconds = Math.max(0, Math.ceil((card.expiresAt - now) / 1000));
  const decide = async (approved: boolean, scope?: 'task' | 'once') => {
    setBusy(true);
    try { const result = await window.kite.approveTool(card.approvalId, approved, scope); if (!result.ok) setBusy(false); }
    catch { setBusy(false); }
    finally { window.kite.setOverlayInteractive(false); }
  };
  return <section className="approval-card" aria-label="Confirm action">
    <div className="approval-heading"><SailMark /><strong>{card.dryRun ? 'Preview action' : 'Your permission'}</strong>
      <span className="approval-countdown" aria-label={`${seconds} seconds remaining`}><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray={`${94.25 * seconds / 30} 94.25`} transform="rotate(-90 18 18)" /></svg>{seconds}</span></div>
    <p className="approval-summary">{card.summary}</p>
    {card.toolName === 'show_me_how' && <ol className="approval-steps">{guideSteps(card.input).map((step, i) => <li key={i}>{step}</li>)}</ol>}
    <details><summary>Full arguments · {card.toolName}</summary><pre>{JSON.stringify(card.input, null, 2)}</pre></details>
    {card.dryRun && <small>Dry run: no action will be performed.</small>}
    {card.toolName === 'type_text' && <small>Focus the destination app first. Voice approval is recommended.</small>}
    {card.toolName === 'do_task'
      ? <div className="approval-buttons"><button className="primary" disabled={busy || !seconds} onClick={() => { void decide(true, 'task'); }}>{approvalAction(card)}</button>
        <button disabled={busy || !seconds} onClick={() => { void decide(true, 'once'); }}>Step by step</button>
        <button className="ghost" disabled={busy || !seconds} onClick={() => { void decide(false); }}>Not now</button></div>
      : <div className="approval-buttons"><button className="primary" disabled={busy || !seconds} onClick={() => { void decide(true); }}>{approvalAction(card)}</button><button className="ghost" disabled={busy || !seconds} onClick={() => { void decide(false); }}>Not now</button></div>}
    {card.toolName === 'do_task' && <small>“Allow this task” lets ordinary steps run; anything that sends, deletes, buys, or submits still asks. “Step by step” asks before every step.</small>}
    <small>Or hold {hotkey || 'your shortcut'} and say “yes” or “no”.</small>
  </section>;
}
