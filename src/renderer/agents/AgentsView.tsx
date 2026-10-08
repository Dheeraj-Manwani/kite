import { useCallback, useEffect, useRef, useState } from 'react';
import { backgroundLimits, finishedRun, statusLabels, type AgentDraft, type BackgroundAgent, type BackgroundDetail, type BackgroundFile, type BackgroundHealth, type BackgroundResult, type BackgroundRun, type BackgroundSnapshot } from '../../shared/background';
import { SailMark } from '../kite/SailMark';

type Filter = 'active' | 'needs' | 'completed' | 'agents';
const bytes = (n: number) => n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`;
const matches = (r: BackgroundRun, f: Filter) => f === 'needs' ? r.status === 'waiting_user' : f === 'completed' ? finishedRun(r.status) : !finishedRun(r.status);

export default function AgentsView() {
  const [snapshot, setSnapshot] = useState<BackgroundSnapshot | null>(null), [health, setHealth] = useState<BackgroundHealth | null>(null);
  const [selected, setSelected] = useState<string | null>(null), [detail, setDetail] = useState<BackgroundDetail | null>(null), [filter, setFilter] = useState<Filter>('active');
  const [create, setCreate] = useState(false), [editing, setEditing] = useState<BackgroundAgent | 'new' | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const selectedRef = useRef(selected), epoch = useRef(0); selectedRef.current = selected;
  const refresh = useCallback(async () => {
    const generation = ++epoch.current;
    try {
      const next = await window.kite.backgroundSnapshot();
      const id = selectedRef.current;
      const nextDetail = id ? await window.kite.backgroundDetail(id) : null;
      if (generation !== epoch.current) return;
      setSnapshot(next); setDetail(nextDetail);
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
    <div className="agents-tabs" aria-label="Agent views">{([['active', `Active (${counts.active})`], ['needs', `Needs you (${counts.needs})`], ['completed', 'Completed'], ['agents', 'My agents']] as const).map(([id, label]) => <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</div>
    {create && <RunComposer agents={snapshot?.agents ?? []} busy={busy} onClose={() => setCreate(false)} onStart={async input => { const result = await perform(() => window.kite.startBackgroundRun(input)); if (result?.ok) setCreate(false); }} onError={setError} />}
    {filter === 'agents' ? <section className="agents-library">
      <div className="agents-section-title"><h2>Reusable helpers</h2><button onClick={() => setEditing('new')}>Create agent</button></div>
      <p>Choose a name, save its brief, and select a PDF layout. Each run keeps the version it started with.</p>
      {editing && <AgentEditor key={editing === 'new' ? 'new' : editing.id} agent={editing === 'new' ? null : editing} busy={busy} onClose={() => setEditing(null)} onSave={async input => { const result = await perform(() => window.kite.saveBackgroundAgent(input)); if (result?.ok) setEditing(null); }} />}
      {snapshot?.agents.length ? snapshot.agents.map(agent => <article className="agents-saved" key={agent.id}><SailMark size={22} /><div><h3>{agent.name}</h3><p>{agent.instructions || 'Text and Markdown to PDF.'}</p><small>PDF · {agent.style} layout · revision {agent.revision}</small></div><button onClick={() => { setEditing(agent); }}>Edit</button><button className="ghost" disabled={busy} onClick={() => { void perform(() => window.kite.archiveBackgroundAgent(agent.id, agent.revision)); }}>Archive</button></article>) : <p className="agents-empty">Save your first helper to reuse its name and PDF layout.</p>}
    </section> : <div className="agents-layout">
      <section className="agents-list" aria-label="Runs">{snapshot?.runs.filter(r => matches(r, filter)).length ? snapshot.runs.filter(r => matches(r, filter)).map(r => <button className={`agents-run-item${r.id === selected ? ' selected' : ''}`} key={r.id} aria-pressed={r.id === selected} onClick={() => { setSelected(r.id); setError(''); }}><strong>{r.title}</strong><span>{r.agentName} · {statusLabels[r.status]}</span><small>{r.total ? `${r.completed} of ${r.total} PDFs` : 'Waiting for input'} · On this PC</small></button>) : <div className="agents-empty"><SailMark size={36} /><p>{filter === 'needs' ? 'No runs need your input.' : filter === 'completed' ? 'Finished runs and their files will appear here.' : 'Start with a PDF. Paste text or choose a text file, and Kite will save a new copy.'}</p></div>}</section>
      <section className="agents-detail" aria-label="Selected run">{run ? <>
        <header><span className="agents-status" data-status={run.status}>{statusLabels[run.status]}</span><h2>{run.title}</h2><p>{run.agentName} · revision {run.agentRevision} · On this PC</p></header>
        <p role="status">{run.message}</p>
        <div className="agents-actions">{!finishedRun(run.status) ? <>
          <button disabled={busy} onClick={() => { void perform(() => window.kite.controlBackgroundRun({ runId: run.id, expectedRevision: run.revision, action: run.status === 'paused' ? 'resume' : 'pause' })); }}>{run.status === 'paused' ? 'Resume' : 'Pause'}</button>
          <button className="danger" disabled={busy} onClick={() => { void perform(() => window.kite.controlBackgroundRun({ runId: run.id, expectedRevision: run.revision, action: 'cancel' })); }}>Cancel run</button>
        </> : <button disabled={busy} onClick={() => { void perform(() => window.kite.controlBackgroundRun({ runId: run.id, expectedRevision: run.revision, action: 'retry' })); }}>Run again</button>}</div>
        {run.status === 'waiting_user' && run.request && <RunRequest key={run.request.id} run={run} busy={busy} onAnswer={async answer => { await perform(() => window.kite.answerBackgroundRun(answer)); }} />}
        {run.inputs.length > 0 && <section className="agents-inputs"><h3>Inputs</h3><ul>{run.inputs.map((name, i) => <li key={i}>{name}</li>)}</ul><small>Text stays on this PC. Markdown notation is preserved as source text.</small></section>}
        {run.artifacts.length > 0 && <section><h3>Files</h3>{run.artifacts.map(artifact => <div className="agents-artifact" key={artifact.id}><div><strong>{artifact.name}</strong><small>{bytes(artifact.bytes)} · {artifact.pages} {artifact.pages === 1 ? 'page' : 'pages'} · checked</small></div><button disabled={busy} onClick={() => { void perform(() => window.kite.backgroundArtifact({ runId: run.id, artifactId: artifact.id, action: 'open' })); }}>Open</button><button disabled={busy} onClick={() => { void perform(() => window.kite.backgroundArtifact({ runId: run.id, artifactId: artifact.id, action: 'save' })); }}>Save a copy</button></div>)}</section>}
        <section className="agents-activity"><h3>Activity</h3><ol>{detail.events.map(event => <li key={event.sequence}><time dateTime={new Date(event.at).toISOString()}>{new Date(event.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><span>{event.message}</span></li>)}</ol></section>
        <small className="agents-run-meta">Started {new Date(run.createdAt).toLocaleString()} · {run.modelCalls} model calls · {run.attempts} execution attempts</small>
      </> : <div className="agents-empty"><h2>Your work has a home.</h2><p>Select a run to see its progress, answer a question, or open its files. You can close this window while Kite keeps working.</p></div>}</section>
    </div>}
    {health && <details className="agents-access"><summary>Capabilities and access</summary><p>Available now: text and Markdown source to PDF using {health.pdf.engine} {health.pdf.version}. Work runs locally while Kite is running.</p><p>{health.office.message} Mail, browser automation, compression, and schedules are planned.</p><p>Saved briefs describe an agent’s purpose; this deterministic workflow uses the supplied input and selected layout. It does not execute instructions as code or call a model.</p></details>}
  </main>;
}

function RunComposer({ agents, busy, onClose, onStart, onError }: { agents: BackgroundAgent[]; busy: boolean; onClose(): void; onStart(input: import('../../shared/background').StartRunInput): Promise<void>; onError(message: string): void }) {
  const [title, setTitle] = useState('My document'), [text, setText] = useState(''), [agentId, setAgentId] = useState(''), [files, setFiles] = useState<BackgroundFile[]>([]), [choosing, setChoosing] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  const choose = async () => { setChoosing(true); try { const result = await window.kite.chooseBackgroundFiles(); if (result.ok) setFiles(result.files); else onError(result.error); } catch { onError('Files could not be selected.'); } finally { setChoosing(false); } };
  return <form className="agents-composer" onSubmit={e => { e.preventDefault(); void onStart({ requestId: requestId.current, title, ...(agentId ? { agentId } : {}), ...(text.trim() ? { text } : {}), fileIds: files.map(f => f.id) }); }}>
    <div className="agents-section-title"><h2>New PDF run</h2><button type="button" className="ghost" onClick={onClose}>Close</button></div>
    <div className="agents-form-row"><label>Run name<input autoFocus value={title} onChange={e => { setTitle(e.target.value); requestId.current = crypto.randomUUID(); }} maxLength={120} required /></label><label>Agent<select value={agentId} onChange={e => { setAgentId(e.target.value); requestId.current = crypto.randomUUID(); }}><option value="">Document Helper</option>{agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label></div>
    <label>Text or Markdown source<textarea value={text} onChange={e => { setText(e.target.value); requestId.current = crypto.randomUUID(); }} maxLength={backgroundLimits.textChars} rows={6} placeholder="Paste the text to turn into a PDF, or choose a .txt or .md file below." /></label>
    <div className="agents-actions"><button type="button" disabled={choosing || busy} onClick={() => { void choose(); requestId.current = crypto.randomUUID(); }}>{choosing ? 'Choosing…' : 'Choose text files'}</button>{files.length > 0 && <span>{files.map(f => f.name).join(', ')}</span>}</div>
    <p className="agents-help">Saves a new PDF in Kite. Originals stay untouched. Without input, the run waits for you to add it later.</p>
    <button type="submit" disabled={busy || choosing || !title.trim()}>{busy ? 'Starting…' : 'Start run'}</button>
  </form>;
}

function AgentEditor({ agent, busy, onSave, onClose }: { agent: BackgroundAgent | null; busy: boolean; onSave(input: AgentDraft): Promise<void>; onClose(): void }) {
  const [name, setName] = useState(agent?.name ?? ''), [instructions, setInstructions] = useState(agent?.instructions ?? ''), [style, setStyle] = useState(agent?.style ?? 'readable');
  return <form className="agents-composer" key={agent?.id ?? 'new'} onSubmit={e => { e.preventDefault(); void onSave({ name, instructions, workflow: 'text_pdf', style, ...(agent ? { id: agent.id, expectedRevision: agent.revision } : {}) }); }}>
    <h3>{agent ? 'Edit agent' : 'Create agent'}</h3><label>Name<input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={80} required /></label>
    <label>Brief<textarea value={instructions} onChange={e => setInstructions(e.target.value)} maxLength={2000} rows={3} placeholder="What will you use this helper for?" /></label>
    <label>PDF layout<select value={style} onChange={e => setStyle(e.target.value as typeof style)}><option value="readable">Readable — 12 pt</option><option value="compact">Compact — 10 pt</option></select></label>
    <p className="agents-help">Capability: text and Markdown source to PDF. The brief describes its purpose; layout controls the conversion.</p>
    <div className="agents-actions"><button disabled={busy || !name.trim()} type="submit">Save agent</button><button type="button" className="ghost" onClick={onClose}>Cancel</button></div>
  </form>;
}

function RunRequest({ run, busy, onAnswer }: { run: BackgroundRun; busy: boolean; onAnswer(input: import('../../shared/background').RunAnswer): Promise<void> }) {
  const [text, setText] = useState(''), [files, setFiles] = useState<BackgroundFile[]>([]), [choosing, setChoosing] = useState(false), [error, setError] = useState(''), request = run.request;
  const choose = async () => { setChoosing(true); try { const result = await window.kite.chooseBackgroundFiles(); if (result.ok) setFiles(result.files); else setError(result.error); } catch { setError('Files could not be selected.'); } finally { setChoosing(false); } };
  const base = { runId: run.id, requestId: request.id, expectedRevision: run.revision };
  return <section className="agents-request" aria-label="Your input"><h3>{request.kind === 'approval' ? 'Your approval' : 'Add your text'}</h3><p>{request.message}</p>
    {request.kind === 'input' ? <form onSubmit={e => { e.preventDefault(); void onAnswer({ ...base, ...(text.trim() ? { text } : {}), fileIds: files.map(f => f.id) }); }}><label>Text to convert<textarea value={text} onChange={e => setText(e.target.value)} rows={5} maxLength={backgroundLimits.textChars} /></label><div className="agents-actions"><button type="button" disabled={choosing || busy} onClick={() => { void choose(); }}>Choose text files</button><span>{files.map(f => f.name).join(', ')}</span></div>{error && <p role="alert">{error}</p>}<button disabled={busy || choosing || (!text.trim() && !files.length)}>Continue run</button></form> : <>
      <p>{run.inputs.join(', ')} · local output · no external upload</p><div className="agents-actions"><button disabled={busy} onClick={() => { void onAnswer({ ...base, approved: true }); }}>Approve these PDFs</button><button disabled={busy} className="ghost" onClick={() => { void onAnswer({ ...base, approved: false }); }}>Decline</button></div>
      {request.expiresAt && <small>Review by {new Date(request.expiresAt).toLocaleString()}.</small>}
    </>}
  </section>;
}
