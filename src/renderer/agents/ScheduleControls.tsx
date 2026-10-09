import { useState } from 'react';
import type { MailAccount } from '../../shared/mail';
import type { BackgroundAgent, BackgroundResult, BackgroundRun } from '../../shared/background';
import type { AgentSchedule, Recurrence, ScheduleHistory } from '../../shared/schedules';

function Scope({ mail, career }: Pick<AgentSchedule, 'mail' | 'career'>) {
  return <p>{mail ? `${mail.email} · search “${mail.query}” · up to ${mail.maxMessages} messages${mail.includeAttachments ? ' and up to 8 supported attachments' : ''}` : career ? `${career.boards.map(b => `${b.provider}/${b.region}/${b.board}`).join(', ')} · keywords “${career.keywords || 'any'}” · location “${career.location || 'any'}” · up to ${career.maxJobs} jobs` : ''}</p>;
}
export function ScheduleControls({ agents, schedules, accounts, busy, perform, select, error }: { accounts: MailAccount[]; agents: BackgroundAgent[]; schedules: AgentSchedule[]; busy: boolean; perform(action: () => Promise<BackgroundResult>): Promise<BackgroundResult | undefined>; select(id: string): void; error(message: string): void }) {
  const helpers = agents.filter(a => ['inbox_briefing','career_scout'].includes(a.workflow));
  const [creating, setCreating] = useState(false), [agentId, setAgentId] = useState(''), [kind, setKind] = useState<'interval' | 'daily'>('daily'), [minutes, setMinutes] = useState('60'), [time, setTime] = useState('09:00'), [timeZone, setTimeZone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone), [consent, setConsent] = useState(false);
  const [review, setReview] = useState<string | null>(null), [history, setHistory] = useState<{ id: string; page: ScheduleHistory } | null>(null);
  const helper = helpers.find(a => a.id === agentId);
  const loadHistory = async (id: string, before?: number) => {
    try { const page = await window.kite.agentScheduleHistory({ id, ...(before ? { before } : {}) }); if (page) setHistory(old => ({ id, page: { runs: before && old?.id === id ? [...old.page.runs, ...page.runs] : page.runs, nextCursor: page.nextCursor } })); }
    catch { error('Schedule history could not load.'); }
  };
  return <section className="agents-schedules">
    <div className="agents-section-title"><h2>Schedules</h2><button disabled={busy || !helpers.length} onClick={() => { setCreating(!creating); setConsent(false); }}>New schedule</button></div>
    <p>Checks run while Kite and this PC are awake. Missed checks become one check. Unchanged results stay quiet. Save an Inbox Briefing or Career Scout helper to schedule it.</p>
    {creating && <form className="agents-composer" onSubmit={e => { e.preventDefault(); if (!helper) return; const recurrence: Recurrence = kind === 'interval' ? { kind, minutes: Number(minutes) } : { kind, time, timeZone }; void perform(() => window.kite.saveAgentSchedule({ requestId: crypto.randomUUID(), agentId: helper.id, agentRevision: helper.revision, recurrence, consent: true })).then(result => { if (result?.ok) { setCreating(false); setConsent(false); } }); }}>
      <label>Saved helper<select aria-label="Scheduled helper" value={agentId} onChange={e => { setAgentId(e.target.value); setConsent(false); }}><option value="">Choose helper</option>{helpers.map(a => <option key={a.id} value={a.id}>{a.name} · revision {a.revision}</option>)}</select></label>
      <label>Repeat<select aria-label="Schedule repeat" value={kind} onChange={e => { setKind(e.target.value as typeof kind); setConsent(false); }}><option value="daily">Daily</option><option value="interval">Every interval</option></select></label>
      {kind === 'interval' ? <label>Minutes<input aria-label="Schedule minutes" type="number" min={15} max={10080} value={minutes} onChange={e => { setMinutes(e.target.value); setConsent(false); }} /></label> : <><label>Time<input aria-label="Schedule time" type="time" value={time} onChange={e => { setTime(e.target.value); setConsent(false); }} required /></label><label>Time zone<input aria-label="Schedule time zone" value={timeZone} onChange={e => { setTimeZone(e.target.value); setConsent(false); }} required /></label></>}
      {helper && <><Scope mail={helper.mail ? { ...helper.mail, email: accounts.find(a => a.id === helper.mail.accountId)?.email ?? 'Disconnected account', accountRevision: 0 } : undefined} career={helper.career} /><p>Freeze revision {helper.revision}. This approval covers recurring reads of these sources and saving local results. Changes to permissions or Gmail access require renewed approval.</p></>}
      <label className="agents-check"><input aria-label="Approve recurring reads" type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />Approve these recurring reads and local files</label>
      <button className="primary" disabled={busy || !helper || !consent}>Create schedule</button>
    </form>}
    {schedules.map(s => <article className="agents-schedule" key={s.id}><h3>{s.agentName} <small>revision {s.agentRevision} · {s.state}</small></h3><Scope mail={s.mail} career={s.career} /><p>{s.recurrence.kind === 'daily' ? `Daily at ${s.recurrence.time} (${s.recurrence.timeZone})` : `Every ${s.recurrence.minutes} minutes`} · {s.state === 'active' ? `Next: ${new Date(s.nextAt).toLocaleString()}` : 'No future dispatch'}</p><p>{s.message}</p>
      <div className="agents-actions">{s.state === 'active' ? <button disabled={busy} onClick={() => { void perform(() => window.kite.controlAgentSchedule({ id: s.id, revision: s.revision, action: 'pause' })); }}>Pause future checks</button> : <button disabled={busy} onClick={() => setReview(review === s.id ? null : s.id)}>Review recurring access</button>}{s.lastRunId && <button onClick={() => select(s.lastRunId)}>Latest check</button>}<button onClick={() => { void loadHistory(s.id); }}>History</button></div>
      {review === s.id && s.state !== 'active' && <div className="agents-request"><p>Approve the frozen sources shown above again, using current permissions and the same Gmail account. The next check starts at the next future occurrence.</p><button disabled={busy} onClick={() => { void perform(() => window.kite.controlAgentSchedule({ id: s.id, revision: s.revision, action: 'renew' })).then(r => { if (r?.ok) setReview(null); }); }}>Approve and enable recurring checks</button></div>}
      {history?.id === s.id && <div className="agents-schedule-history"><h4>Check history</h4>{history.page.runs.length ? history.page.runs.map((r: BackgroundRun) => <button key={r.id} onClick={() => select(r.id)}>{new Date(r.createdAt).toLocaleString()} · {r.unchanged ? 'No changes' : r.status}</button>) : <p>No checks yet.</p>}{history.page.nextCursor && <button onClick={() => { void loadHistory(s.id, history.page.nextCursor); }}>Older checks</button>}</div>}
    </article>)}
  </section>;
}
