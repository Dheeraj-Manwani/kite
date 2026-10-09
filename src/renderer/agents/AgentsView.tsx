import { useCallback, useEffect, useRef, useState } from 'react';
import { backgroundLimits, finishedRun, statusLabels, workflowLabels, type BackgroundWorkflow, type AgentDraft, type BackgroundAgent, type BackgroundDetail, type BackgroundFile, type BackgroundHealth, type BackgroundResult, type BackgroundRun, type BackgroundSnapshot } from '../../shared/background';
import { ScheduleControls } from './ScheduleControls';
import { SailMark } from '../kite/SailMark';
import type { MailConnectionState } from '../../shared/mail';
import { CareerFields, defaultCareer, validCareer, ShortlistView, ApplicationView, ApplicationInput, ApplicationActions } from './CareerControls';
import { MailAccounts, MailOptionsFields, BriefingView, defaultMail, validMail } from './MailControls';

type Filter = 'active' | 'needs' | 'completed' | 'agents' | 'schedules';
const bytes = (n: number) => n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`;
const matches = (r: BackgroundRun, f: Filter) => f === 'needs' ? r.status === 'waiting_user' : f === 'completed' ? finishedRun(r.status) : !finishedRun(r.status);
const accepts = (file: BackgroundFile, workflow: BackgroundWorkflow) => workflow === 'pdf_optimize' ? file.kind === 'pdf' : workflow === 'text_pdf' ? !file.kind || file.kind === 'text' : file.kind !== 'pdf';
const target = (mb: string) => mb ? Math.round(Number(mb) * 1024 * 1024) : undefined;

function SelectedFiles({ files, onRemove }: { files: BackgroundFile[]; onRemove(id: string): void }) {
  return <ul className="agents-chosen-files">{files.map(file => <li key={file.id}><span>{file.name} <small>{bytes(file.bytes)}</small></span><button type="button" aria-label={`Remove ${file.name}`} onClick={() => onRemove(file.id)}>Remove</button></li>)}</ul>;
}

export default function AgentsView() {
  const [mailState, setMailState] = useState<MailConnectionState | null>(null);
  const [snapshot, setSnapshot] = useState<BackgroundSnapshot | null>(null), [health, setHealth] = useState<BackgroundHealth | null>(null);
  const [selected, setSelected] = useState<string | null>(null), [detail, setDetail] = useState<BackgroundDetail | null>(null), [filter, setFilter] = useState<Filter>('active');
  const [create, setCreate] = useState(false), [editing, setEditing] = useState<BackgroundAgent | 'new' | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const selectedRef = useRef(selected), epoch = useRef(0); selectedRef.current = selected;
  const refresh = useCallback(async () => {
    const generation = ++epoch.current;
    try {
      const [next, mail] = await Promise.all([window.kite.backgroundSnapshot(), window.kite.mailState()]);
      const id = selectedRef.current;
      const nextDetail = id ? await window.kite.backgroundDetail(id) : null;
      if (generation !== epoch.current) return;
      setSnapshot(next); setDetail(nextDetail); setMailState(mail);
      if (!next) setError('Agents could not start. Restart Kite after checking OS encryption and SQLite.');
    } catch { if (generation === epoch.current) setError('Agents are unavailable. Restart Kite and try again.'); }
  }, []);
  useEffect(() => { void refresh(); void window.kite.backgroundHealth().then(setHealth).catch((): void => undefined); const off = window.kite.onBackgroundChanged(() => { void refresh(); }); return () => { off(); epoch.current++; }; }, [refresh]);
  useEffect(() => { void refresh(); }, [selected, refresh]);
  const perform = async (action: () => Promise<BackgroundResult>) => {
    if (busy) return; setBusy(true); setError('');
    try {
      const result = await action(); if (!result.ok) setError(result.error ?? 'The action could not finish.');
      if (result.runId) { setSelected(result.runId); selectedRef.current = result.runId; setFilter('active'); }
      await refresh(); return result;
    } catch { setError('The action could not finish. Please try again.'); }
    finally { setBusy(false); }
  };
  const counts = { active: snapshot?.runs.filter(r => !finishedRun(r.status)).length ?? 0, needs: snapshot?.runs.filter(r => r.status === 'waiting_user').length ?? 0 };
  const run = detail?.run;
  return <main className="agents-view">
    <header className="agents-heading"><div><h1>Agents</h1><p>Hand off a task. Keep working while Kite takes care of it.</p></div><button className="primary" onClick={() => { setCreate(true); setEditing(null); }} disabled={!snapshot}>New run</button></header>
    {snapshot?.paused && <p className="agents-banner" role="status">Kite is paused. Your runs are saved and will continue when Kite resumes.</p>}
    {error && <p className="agents-error" role="alert">{error}</p>}
    <div className="agents-tabs" aria-label="Agent views">{([['active', `Active (${counts.active})`], ['needs', `Needs you (${counts.needs})`], ['completed', 'Completed'], ['agents', 'My agents'], ['schedules', 'Schedules']] as const).map(([id, label]) => <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</div>
    {create && <RunComposer mailState={mailState} agents={snapshot?.agents ?? []} busy={busy} onClose={() => setCreate(false)} onStart={async input => { const result = await perform(() => window.kite.startBackgroundRun(input)); if (result?.ok) setCreate(false); }} onError={setError} />}
    {filter === 'schedules' ? <ScheduleControls accounts={mailState?.accounts ?? []} agents={snapshot?.agents ?? []} schedules={snapshot?.schedules ?? []} busy={busy} perform={perform} error={setError} select={id => { setSelected(id); setFilter('completed'); }} /> : filter === 'agents' ? <section className="agents-library">
      <div className="agents-section-title"><h2>Reusable helpers</h2><button onClick={() => setEditing('new')}>Create agent</button></div>
      <p>Choose a name, save its brief, and select a document task or Gmail search. Each run keeps the version it started with.</p>
      {editing && <AgentEditor mailState={mailState} key={editing === 'new' ? 'new' : editing.id} agent={editing === 'new' ? null : editing} busy={busy} onClose={() => setEditing(null)} onSave={async input => { const result = await perform(() => window.kite.saveBackgroundAgent(input)); if (result?.ok) setEditing(null); }} />}
      {snapshot?.agents.length ? snapshot.agents.map(agent => <article className="agents-saved" key={agent.id}><SailMark size={22} /><div><h3>{agent.name}</h3><p>{agent.instructions || 'A reusable task helper.'}</p><small>{workflowLabels[agent.workflow]} · {agent.workflow === 'inbox_briefing' ? agent.mail?.query : agent.workflow === 'pdf_optimize' ? agent.targetBytes ? `target ${bytes(agent.targetBytes)}` : 'no size target' : `${agent.style} layout`} · revision {agent.revision}</small></div><button onClick={() => { setEditing(agent); }}>Edit</button><button className="ghost" disabled={busy} onClick={() => { void perform(() => window.kite.archiveBackgroundAgent(agent.id, agent.revision)); }}>Archive</button></article>) : <p className="agents-empty">Save your first helper to reuse its task settings.</p>}
    </section> : <div className="agents-layout">
      <section className="agents-list" aria-label="Runs">{snapshot?.runs.filter(r => matches(r, filter)).length ? snapshot.runs.filter(r => matches(r, filter)).map(r => <button className={`agents-run-item${r.id === selected ? ' selected' : ''}`} key={r.id} aria-pressed={r.id === selected} onClick={() => { setSelected(r.id); setError(''); }}><strong>{r.title}</strong><span>{r.agentName} · {statusLabels[r.status]}</span><small>{r.total ? `${r.completed} of ${r.total} ${['inbox_briefing','career_scout','job_application'].includes(r.workflow) ? 'outputs' : 'PDFs'}` : 'Waiting for input'} · On this PC</small></button>) : <div className="agents-empty"><SailMark size={36} /><p>{filter === 'needs' ? 'No runs need your input.' : filter === 'completed' ? 'Finished runs and their files will appear here.' : 'Start a document task, Inbox Briefing or Career Scout. Results are saved here while you keep working.'}</p></div>}</section>
      <section className="agents-detail" aria-label="Selected run">{run ? <>
        <header><span className="agents-status" data-status={run.status}>{statusLabels[run.status]}</span><h2>{run.title}</h2><p>{run.agentName} · {workflowLabels[run.workflow ?? 'text_pdf']} · revision {run.agentRevision} · On this PC</p></header>
        <p role="status">{run.message}</p>
        {run.schedule && <p>Scheduled for {new Date(run.schedule.at).toLocaleString()}{run.unchanged ? ' · No changes; no new files or notification.' : ''}</p>}
        {run.delegation && <section className="agents-child-tasks"><h3>Board tasks</h3><p>{bytes(run.delegation.bytes)} of {bytes(run.delegation.maxBytes)} shared input budget · up to {run.delegation.concurrency} at once · {run.delegation.modelCalls} model calls</p><ul>{run.delegation.children.map(child => <li key={child.id}>{child.name} · {child.status} · {bytes(child.bytes)}</li>)}</ul></section>}
        <div className="agents-actions">{!finishedRun(run.status) ? <>
          <button disabled={busy} onClick={() => { void perform(() => window.kite.controlBackgroundRun({ runId: run.id, expectedRevision: run.revision, action: run.status === 'paused' ? 'resume' : 'pause' })); }}>{run.status === 'paused' ? 'Resume' : 'Pause'}</button>
          <button className="danger" disabled={busy} onClick={() => { void perform(() => window.kite.controlBackgroundRun({ runId: run.id, expectedRevision: run.revision, action: 'cancel' })); }}>Cancel run</button>
        </> : run.workflow !== 'job_application' && <button disabled={busy} onClick={() => { void perform(() => window.kite.controlBackgroundRun({ runId: run.id, expectedRevision: run.revision, action: 'retry' })); }}>Run again</button>}</div>
        {detail.application && <ApplicationView application={detail.application} run={run} />}
        {run.status === 'waiting_user' && run.request?.kind === 'application_input' && <ApplicationInput run={run} busy={busy} error={setError} answer={async input => { await perform(() => window.kite.answerBackgroundRun(input)); }} />}
        {run.status === 'waiting_user' && ['application_review','application_takeover'].includes(run.request?.kind) && <section className="agents-request"><p>{run.request.message}</p><ApplicationActions run={run} busy={busy} uncertain={!!detail.application?.mutation} browser={action => perform(() => window.kite.applicationBrowser({runId:run.id,revision:run.revision,action}))} finish={() => { void perform(() => window.kite.answerBackgroundRun({runId:run.id,expectedRevision:run.revision,requestId:run.request.id,approved:false})); }} />{run.request.kind==='application_review' && <button disabled={busy} onClick={() => { void perform(() => window.kite.answerBackgroundRun({runId:run.id,expectedRevision:run.revision,requestId:run.request.id,approved:true})); }}>Approve application preparation</button>}</section>}
        {run.status === 'waiting_user' && run.request && !['application_input','application_review','application_takeover'].includes(run.request.kind) && <RunRequest mailState={mailState} key={run.request.id} run={run} busy={busy} onAnswer={async answer => { await perform(() => window.kite.answerBackgroundRun(answer)); }} />}
        {run.inputs.length > 0 && <section className="agents-inputs"><h3>Inputs</h3><ul>{run.inputs.map((name, i) => <li key={i}>{name}</li>)}</ul><small>{run.workflow==='job_application' ? 'Frozen resume snapshot. Review its destination before browser preparation.' : 'Document workflows stay on this PC. Originals are never overwritten. Markdown notation is preserved as source text.'}</small></section>}
        {run.artifacts.length > 0 && <section><h3>Files</h3>{run.artifacts.map(artifact => <div className="agents-artifact" key={artifact.id}><div><strong>{artifact.name}</strong><small>{bytes(artifact.bytes)} · {artifact.mediaType === 'application/pdf' ? `${artifact.pages} ${artifact.pages === 1 ? 'page' : 'pages'} · checked` : 'untrusted attachment · hash checked'}</small>{artifact.optimization && <p className="agents-size-report">{bytes(artifact.optimization.inputBytes)} → {bytes(artifact.bytes)}<br />{artifact.optimization.changed ? `Saved ${bytes(artifact.optimization.savedBytes)} (${Math.round(100 * artifact.optimization.savedBytes / artifact.optimization.inputBytes)}%). Text and images preserved.` : 'No smaller lossless rewrite. Saved an unchanged copy.'}{artifact.optimization.targetBytes && <><br /><strong>{artifact.optimization.targetMet ? 'Target met' : 'Target not met'}: {bytes(artifact.optimization.targetBytes)}</strong></>}</p>}</div>{(artifact.mediaType === 'application/pdf' ? ['preview', 'open', 'reveal', 'save'] as const : ['reveal', 'save'] as const).map(action => <button key={action} disabled={busy} onClick={() => { void perform(() => window.kite.backgroundArtifact({ runId: run.id, artifactId: artifact.id, action })); }}>{({ preview: 'Preview', open: 'Open', reveal: 'Show in folder', save: 'Save a copy' })[action]}</button>)}</div>)}</section>}
        {detail.shortlist && <ShortlistView list={detail.shortlist} run={run} busy={busy} prepare={input => { void perform(() => window.kite.prepareCareerJob(input)); }} />}
        {detail.briefing && <BriefingView briefing={detail.briefing} runId={run.id} onOpen={(runId, messageId) => { void perform(() => window.kite.openMailSource({ runId, messageId })); }} />}
        {detail.briefing && run.status==='succeeded' && <button disabled={busy} onClick={()=>{void perform(()=>window.kite.scoutMailBriefing({runId:run.id,revision:run.revision}));}}>Scout jobs from this briefing</button>}
        <section className="agents-activity"><h3>Activity</h3><ol>{detail.events.map(event => <li key={event.sequence}><time dateTime={new Date(event.at).toISOString()}>{new Date(event.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><span>{event.message}</span></li>)}</ol></section>
        <small className="agents-run-meta">Started {new Date(run.createdAt).toLocaleString()} · {run.modelCalls} model calls · {run.attempts} execution attempts</small>
      </> : <div className="agents-empty"><h2>Your work has a home.</h2><p>Select a run to see its progress, answer a question, or open its files. You can close this window while Kite keeps working.</p></div>}</section>
    </div>}
    <MailAccounts state={mailState} refresh={refresh} />
    {health && <details className="agents-access"><summary>Capabilities and access</summary><p>Text and Markdown source to PDF: {health.pdf.engine} {health.pdf.version}. Work runs locally while Kite is running.</p>{health.documents && <p>{health.documents.engine} {health.documents.version}: {health.documents.message}</p>}<p>{health.office.message} Gmail briefings use the connected account. Career Scout reads Greenhouse/Lever and prepares applications in an isolated browser for manual review/submission. Lossy compression and schedules are planned.</p><p>Saved briefs describe an agent’s purpose; each deterministic workflow uses the supplied input and selected settings. It does not execute instructions as code or call a model.</p></details>}
  </main>;
}

function RunComposer({ mailState, agents, busy, onClose, onStart, onError }: { mailState: MailConnectionState | null; agents: BackgroundAgent[]; busy: boolean; onClose(): void; onStart(input: import('../../shared/background').StartRunInput): Promise<void>; onError(message: string): void }) {
  const [title, setTitle] = useState('My task'), [text, setText] = useState(''), [agentId, setAgentId] = useState(''), [workflow, setWorkflow] = useState<BackgroundWorkflow>('document_pdf'), [targetMb, setTargetMb] = useState(''), [files, setFiles] = useState<BackgroundFile[]>([]), [choosing, setChoosing] = useState(false);
  const [mail, setMail] = useState(defaultMail);
  const [career,setCareer]=useState(defaultCareer);
  const agent = agents.find(a => a.id === agentId), selectedWorkflow = agent?.workflow ?? workflow;
  const requestId = useRef(crypto.randomUUID());
  const choose = async () => { setChoosing(true); try { const result = await window.kite.chooseBackgroundFiles(); if (result.ok) setFiles(result.files); else onError(result.error); } catch { onError('Files could not be selected.'); } finally { setChoosing(false); } };
  return <form className="agents-composer" onSubmit={e => { e.preventDefault(); void onStart({ requestId: requestId.current, title, ...(agentId ? { agentId } : { workflow, ...(workflow === 'pdf_optimize' && targetMb ? { targetBytes: target(targetMb) } : {}), ...(workflow === 'inbox_briefing' && mail.accountId ? { mail } : {}), ...(workflow === 'career_scout' && validCareer(career) ? {career} : {}) }), ...(selectedWorkflow !== 'pdf_optimize' && selectedWorkflow !== 'inbox_briefing' && selectedWorkflow !== 'career_scout' && text.trim() ? { text } : {}), fileIds: ['inbox_briefing','career_scout'].includes(selectedWorkflow) ? [] : files.map(f => f.id) }); }}>
    <div className="agents-section-title"><h2>New run</h2><button type="button" className="ghost" onClick={onClose}>Close</button></div>
    <div className="agents-form-row"><label>Run name<input autoFocus value={title} onChange={e => { setTitle(e.target.value); requestId.current = crypto.randomUUID(); }} maxLength={120} required /></label><label>Agent<select value={agentId} onChange={e => { setAgentId(e.target.value); requestId.current = crypto.randomUUID(); }}><option value="">One-off run</option>{agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label></div>
    {!agent && <div className="agents-form-row"><label>Task<select aria-label="Document task" value={workflow} onChange={e => { setWorkflow(e.target.value as BackgroundWorkflow); requestId.current = crypto.randomUUID(); }}><option value="document_pdf">Convert text or images to PDF</option><option value="pdf_optimize">Optimize PDF (lossless)</option><option value="inbox_briefing">Inbox Briefing (Gmail)</option><option value="career_scout">Career Scout (Greenhouse/Lever)</option></select></label>{workflow === 'pdf_optimize' && <label>Target size per PDF (MB, optional)<input type="number" min="0.0009765625" max="20" step="any" value={targetMb} onChange={e => { setTargetMb(e.target.value); requestId.current = crypto.randomUUID(); }} placeholder="No target" /></label>}</div>}
    {agent && <p className="agents-help">{workflowLabels[agent.workflow]}{agent.targetBytes ? ` · target ${bytes(agent.targetBytes)} per PDF` : ''}</p>}
    {selectedWorkflow !== 'pdf_optimize' && selectedWorkflow !== 'inbox_briefing' && selectedWorkflow !== 'career_scout' && <label>Text or Markdown source<textarea value={text} onChange={e => { setText(e.target.value); requestId.current = crypto.randomUUID(); }} maxLength={backgroundLimits.textChars} rows={6} placeholder="Paste text or choose text/image files below. Markdown is preserved as source text." /></label>}
    {selectedWorkflow === 'career_scout' ? agent ? <p>Saved job boards and filters will be reviewed before discovery.</p> : <CareerFields value={career} change={v => {setCareer(v);requestId.current=crypto.randomUUID();}} /> : selectedWorkflow === 'inbox_briefing' ? agent ? <p>Saved Gmail search: {agent.mail?.query}. Account and search will be reviewed before reading.</p> : <MailOptionsFields value={mail} onChange={v => { setMail(v); requestId.current = crypto.randomUUID(); }} state={mailState} /> : <>
    <div className="agents-actions"><button type="button" disabled={choosing || busy} onClick={() => { void choose(); requestId.current = crypto.randomUUID(); }}>{choosing ? 'Checking files…' : 'Choose files'}</button></div>
    <SelectedFiles files={files} onRemove={id => { setFiles(files.filter(f => f.id !== id)); requestId.current = crypto.randomUUID(); }} />
    <p className="agents-help">{selectedWorkflow === 'pdf_optimize' ? 'Choose plain PDFs. No image downsampling or text changes. If a rewrite is larger, Kite saves an unchanged copy. A size target is a goal, not a guarantee.' : selectedWorkflow === 'text_pdf' ? 'Choose UTF-8 .txt or .md files.' : 'Choose UTF-8 .txt/.md or supported PNG/JPEG images. Each input becomes a separate PDF.'} Originals stay untouched. Without input, the run waits for you.</p>
    {files.some(f => !accepts(f, selectedWorkflow)) && <p role="alert">Remove files that do not match this task, or change the task.</p>}
    </>}
    <button type="submit" disabled={busy || choosing || !title.trim() || (selectedWorkflow === 'career_scout' ? !agent && !validCareer(career) : selectedWorkflow === 'inbox_briefing' ? !agent && mail.accountId !== '' && !validMail(mail) : files.some(f => !accepts(f, selectedWorkflow)))}>{busy ? 'Starting…' : 'Start run'}</button>
  </form>;
}

function AgentEditor({ mailState, agent, busy, onSave, onClose }: { mailState: MailConnectionState | null; agent: BackgroundAgent | null; busy: boolean; onSave(input: AgentDraft): Promise<void>; onClose(): void }) {
  const [name, setName] = useState(agent?.name ?? ''), [instructions, setInstructions] = useState(agent?.instructions ?? ''), [style, setStyle] = useState(agent?.style ?? 'readable'), [workflow, setWorkflow] = useState<BackgroundWorkflow>(agent?.workflow ?? 'document_pdf'), [targetMb, setTargetMb] = useState(agent?.targetBytes ? String(agent.targetBytes / (1024 * 1024)) : '');
  const [mail, setMail] = useState(agent?.mail ?? defaultMail());
  const [career,setCareer]=useState(agent?.career ?? defaultCareer());
  return <form className="agents-composer" key={agent?.id ?? 'new'} onSubmit={e => { e.preventDefault(); void onSave({ name, instructions, workflow, style, ...(workflow === 'inbox_briefing' ? { mail } : {}), ...(workflow === 'career_scout' ? {career} : {}), ...(workflow === 'pdf_optimize' && targetMb ? { targetBytes: target(targetMb) } : {}), ...(agent ? { id: agent.id, expectedRevision: agent.revision } : {}) }); }}>
    <h3>{agent ? 'Edit agent' : 'Create agent'}</h3><label>Name<input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={80} required /></label>
    <label>Brief<textarea value={instructions} onChange={e => setInstructions(e.target.value)} maxLength={2000} rows={3} placeholder="What will you use this helper for?" /></label>
    <label>Task<select value={workflow} onChange={e => setWorkflow(e.target.value as BackgroundWorkflow)}>{Object.entries(workflowLabels).filter(([id])=>id!=='job_application').map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    {workflow === 'career_scout' ? <CareerFields value={career} change={setCareer} /> : workflow === 'inbox_briefing' ? <MailOptionsFields value={mail} onChange={setMail} state={mailState} /> : workflow === 'pdf_optimize' ? <label>Target size per PDF (MB, optional)<input type="number" min="0.0009765625" max="20" step="any" value={targetMb} onChange={e => setTargetMb(e.target.value)} /></label> : <label>Text PDF layout<select value={style} onChange={e => setStyle(e.target.value as typeof style)}><option value="readable">Readable — 12 pt</option><option value="compact">Compact — 10 pt</option></select></label>}
    <p className="agents-help">The brief describes this helper’s purpose. Its selected task and settings control the deterministic work.</p>
    <div className="agents-actions"><button disabled={busy || !name.trim() || (workflow === 'inbox_briefing' && !validMail(mail)) || (workflow === 'career_scout' && !validCareer(career))} type="submit">Save agent</button><button type="button" className="ghost" onClick={onClose}>Cancel</button></div>
  </form>;
}

function RunRequest({ mailState, run, busy, onAnswer }: { mailState: MailConnectionState | null; run: BackgroundRun; busy: boolean; onAnswer(input: import('../../shared/background').RunAnswer): Promise<void> }) {
  const [text, setText] = useState(''), [files, setFiles] = useState<BackgroundFile[]>([]), [choosing, setChoosing] = useState(false), [error, setError] = useState(''), request = run.request;
  const choose = async () => { setChoosing(true); try { const result = await window.kite.chooseBackgroundFiles(); if (result.ok) setFiles(result.files); else setError(result.error); } catch { setError('Files could not be selected.'); } finally { setChoosing(false); } };
  const [mail, setMail] = useState(defaultMail);
  const [career,setCareer]=useState(defaultCareer);
  const base = { runId: run.id, requestId: request.id, expectedRevision: run.revision };
  return <section className="agents-request" aria-label="Your input"><h3>{request.kind === 'approval' ? 'Your approval' : 'Add input'}</h3><p>{request.message}</p>
    {request.kind === 'career_input' ? <form onSubmit={e => {e.preventDefault();void onAnswer({...base,career});}}><CareerFields value={career} change={setCareer} /><button disabled={busy||!validCareer(career)}>Continue run</button></form> : request.kind === 'mail_input' ? <form onSubmit={e => { e.preventDefault(); void onAnswer({ ...base, mail }); }}><MailOptionsFields value={mail} onChange={setMail} state={mailState} /><button disabled={busy || !validMail(mail)}>Continue run</button></form> : request.kind === 'mail_access' ? <><p>Account: {run.mail?.email}. Connect or reconnect it in Mail accounts below. This run cannot switch mailboxes.</p><button disabled={busy || !mailState?.accounts.some(a => a.id === run.mail?.accountId && a.status === 'connected')} onClick={() => { void onAnswer({ ...base, approved: true }); }}>Review and resume</button></> : request.kind === 'input' ? <form onSubmit={e => { e.preventDefault(); void onAnswer({ ...base, ...(run.workflow !== 'pdf_optimize' && text.trim() ? { text } : {}), fileIds: files.map(f => f.id) }); }}>{run.workflow !== 'pdf_optimize' && <label>Text to convert<textarea value={text} onChange={e => setText(e.target.value)} rows={5} maxLength={backgroundLimits.textChars} /></label>}<div className="agents-actions"><button type="button" disabled={choosing || busy} onClick={() => { void choose(); }}>{choosing ? 'Checking files…' : 'Choose files'}</button></div><SelectedFiles files={files} onRemove={id => setFiles(files.filter(f => f.id !== id))} />{error && <p role="alert">{error}</p>}{files.some(f => !accepts(f, run.workflow ?? 'text_pdf')) && <p role="alert">Choose files that match this task.</p>}<button disabled={busy || choosing || (!text.trim() && !files.length) || files.some(f => !accepts(f, run.workflow ?? 'text_pdf'))}>Continue run</button></form> : <>
      <p>{run.workflow === 'inbox_briefing' ? run.mail?.email : run.inputs.join(', ')} · local output · no external model upload</p><div className="agents-actions"><button disabled={busy} onClick={() => { void onAnswer({ ...base, approved: true }); }}>{run.workflow === 'career_scout' ? 'Approve job discovery' : run.workflow === 'inbox_briefing' ? 'Approve this mail search' : 'Approve these PDFs'}</button><button disabled={busy} className="ghost" onClick={() => { void onAnswer({ ...base, approved: false }); }}>Decline</button></div>
      {request.expiresAt && <small>Review by {new Date(request.expiresAt).toLocaleString()}.</small>}
    </>}
  </section>;
}
