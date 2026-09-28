import { useEffect, useState } from 'react';
import type { ApprovalCard as Card } from '../../shared/types';
export function ApprovalCard({ card }: { card: Card }) {
  const [now, setNow] = useState(Date.now()), [busy, setBusy] = useState(false);
  useEffect(() => { setBusy(false); const timer = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(timer); }, [card.approvalId]);
  const seconds = Math.max(0, Math.ceil((card.expiresAt - now) / 1000));
  const decide = async (approved: boolean) => {
    setBusy(true);
    try { const result = await window.kite.approveTool(card.approvalId, approved); if (!result.ok) setBusy(false); }
    catch { setBusy(false); }
    finally { window.kite.setOverlayInteractive(false); }
  };
  return <section className="approval-card" aria-label="Confirm action">
    <div className="approval-heading"><span aria-hidden="true">◇</span><strong>{card.dryRun ? 'Preview action' : 'Your permission'}</strong>
      <span className="approval-countdown" aria-label={`${seconds} seconds remaining`}><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray={`${94.25 * seconds / 30} 94.25`} transform="rotate(-90 18 18)" /></svg>{seconds}</span></div>
    <p className="approval-summary">{card.summary}</p>
    <details><summary>Full arguments · {card.toolName}</summary><pre>{JSON.stringify(card.input, null, 2)}</pre></details>
    {card.dryRun && <small>Dry run: no action will be performed.</small>}
    {card.toolName === 'type_text' && <small>Focus the destination app first. Voice approval is recommended.</small>}
    <div className="approval-buttons"><button disabled={busy || !seconds} onClick={() => { void decide(true); }}>✓ Do it</button><button disabled={busy || !seconds} onClick={() => { void decide(false); }}>✗ Cancel</button></div>
    <small>or hold Ctrl+Win and say yes/no</small>
  </section>;
}
