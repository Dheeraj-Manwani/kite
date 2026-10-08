import { useCallback, useEffect, useRef, useState } from 'react';
import { backgroundLimits, finishedRun, statusLabels, workflowLabels, type DocumentWorkflow, type AgentDraft, type BackgroundAgent, type BackgroundDetail, type BackgroundFile, type BackgroundHealth, type BackgroundResult, type BackgroundRun, type BackgroundSnapshot } from '../../shared/background';
import { SailMark } from '../kite/SailMark';

type Filter = 'active' | 'needs' | 'completed' | 'agents';
const bytes = (n: number) => n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`;
const matches = (r: BackgroundRun, f: Filter) => f === 'needs' ? r.status === 'waiting_user' : f === 'completed' ? finishedRun(r.status) : !finishedRun(r.status);
const accepts = (file: BackgroundFile, workflow: DocumentWorkflow) => workflow === 'pdf_optimize' ? file.kind === 'pdf' : workflow === 'text_pdf' ? !file.kind || file.kind === 'text' : file.kind !== 'pdf';
const target = (mb: string) => mb ? Math.round(Number(mb) * 1024 * 1024) : undefined;

function SelectedFiles({ files, onRemove }: { files: BackgroundFile[]; onRemove(id: string): void }) {
  return <ul className="agents-chosen-files">{files.map(file => <li key={file.id}><span>{file.name} <small>{bytes(file.bytes)}</small></span><button type="button" aria-label={`Remove ${file.name}`} onClick={() => onRemove(file.id)}>Remove</button></li>)}</ul>;
}

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
      <p>Choose a name, save its brief, and select conversion or PDF optimization. Each run keeps the version it started with.</p>
      {editing && <AgentEditor key={editing === 'new' ? 'new' : editing.id} agent={editing === 'new' ? null : editing} busy={busy} onClose={() => setEditing(null)} onSave={async input => { const result = await perform(() => window.kite.saveBackgroundAgent(input)); if (result?.ok) setEditing(null); }} />}
      {snapshot?.agents.length ? snapshot.agents.map(agent => <article className="agents-saved" key={agent.id}><SailMark size={22} /><div><h3>{agent.name}</h3><p>{agent.instructions || 'A reusable document helper.'}</p><small>{workflowLabels[agent.workflow]} · {agent.workflow === 'pdf_optimize' ? agent.targetBytes ? `target ${bytes(agent.targetBytes)}` : 'no size target' : `${agent.style} layout`} · revision {agent.revision}</small></div><button onClick={() => { setEditing(agent); }}>Edit</button><button className="ghost" disabled={busy} onClick={() => { void perform(() => window.kite.archiveBackgroundAgent(agent.id, agent.revision)); }}>Archive</button></article>) : <p className="agents-empty">Save your first helper to reuse its document settings.</p>}
    </section> : <div className="agents-layout">
      <section className="agents-list" aria-label="Runs">{snapshot?.runs.filter(r => matches(r, filter)).length ? snapshot.runs.filter(r => matches(r, filter)).map(r => <button className={`agents-run-item${r.id === selected ? ' selected' : ''}`} key={r.id} aria-pressed={r.id === selected} onClick={() => { setSelected(r.id); setError(''); }}><strong>{r.title}</strong><span>{r.agentName} · {statusLabels[r.status]}</span><small>{r.total ? `${r.completed} of ${r.total} PDFs` : 'Waiting for input'} · On this PC</small></button>) : <div className="agents-empty"><SailMark size={36} /><p>{filter === 'needs' ? 'No runs need your input.' : filter === 'completed' ? 'Finished runs and their files will appear here.' : 'Start with a PDF. Convert text or images, or optimize a PDF. Kite saves a new copy.'}</p></div>}</section>
      <section className="agents-detail" aria-label="Selected run">{run ? <>
        <header><span className="agents-status" data-status={run.status}>{statusLabels[run.status]}</span><h2>{run.title}</h2><p>{run.agentName} · {workflowLabels[run.workflow ?? 'text_pdf']} · revision {run.agentRevision} · On this PC</p></header>
        <p role="status">{run.message}</p>
        <div className="agents-actions">{!finishedRun(run.status) ? <>
          <button disabled={busy} onClick={() => { void perform(() => window.kite.controlBackgroundRun({ runId: run.id, expectedRevision: run.revision, action: run.status === 'paused' ? 'resume' : 'pause' })); }}>{run.status === 'paused' ? 'Resume' : 'Pause'}</button>
          <button className="danger" disabled={busy} onClick={() => { void perform(() => window.kite.controlBackgroundRun({ runId: run.id, expectedRevision: run.revision, action: 'cancel' })); }}>Cancel run</button>
        </> : <button disabled={busy} onClick={() => { void perform(() => window.kite.controlBackgroundRun({ runId: run.id, expectedRevision: run.revision, action: 'retry' })); }}>Run again</button>}</div>
        {run.status === 'waiting_user' && run.request && <RunRequest key={run.request.id} run={run} busy={busy} onAnswer={async answer => { await perform(() => window.kite.answerBackgroundRun(answer)); }} />}
        {run.inputs.length > 0 && <section className="agents-inputs"><h3>Inputs</h3><ul>{run.inputs.map((name, i) => <li key={i}>{name}</li>)}</ul><small>Documents stay on this PC. Originals are never overwritten. Markdown notation is preserved as source text.</small></section>}
        {run.artifacts.length > 0 && <section><h3>Files</h3>{run.artifacts.map(artifact => <div className="agents-artifact" key={artifact.id}><div><strong>{artifact.name}</strong><small>{bytes(artifact.bytes)} · {artifact.pages} {artifact.pages === 1 ? 'page' : 'pages'} · checked</small>{artifact.optimization && <p className="agents-size-report">{bytes(artifact.optimization.inputBytes)} → {bytes(artifact.bytes)}<br />{artifact.optimization.changed ? `Saved ${bytes(artifact.optimization.savedBytes)} (${Math.round(100 * artifact.optimization.savedBytes / artifact.optimization.inputBytes)}%). Text and images preserved.` : 'No smaller lossless rewrite. Saved an unchanged copy.'}{artifact.optimization.targetBytes && <><br /><strong>{artifact.optimization.targetMet ? 'Target met' : 'Target not met'}: {bytes(artifact.optimization.targetBytes)}</strong></>}</p>}</div>{(['preview', 'open', 'reveal', 'save'] as const).map(action => <button key={action} disabled={busy} onClick={() => { void perform(() => window.kite.backgroundArtifact({ runId: run.id, artifactId: artifact.id, action })); }}>{({ preview: 'Preview', open: 'Open', reveal: 'Show in folder', save: 'Save a copy' })[action]}</button>)}</div>)}</section>}
        <section className="agents-activity"><h3>Activity</h3><ol>{detail.events.map(event => <li key={event.sequence}><time dateTime={new Date(event.at).toISOString()}>{new Date(event.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><span>{event.message}</span></li>)}</ol></section>
        <small className="agents-run-meta">Started {new Date(run.createdAt).toLocaleString()} · {run.modelCalls} model calls · {run.attempts} execution attempts</small>
      </> : <div className="agents-empty"><h2>Your work has a home.</h2><p>Select a run to see its progress, answer a question, or open its files. You can close this window while Kite keeps working.</p></div>}</section>
    </div>}
    {health && <details className="agents-access"><summary>Capabilities and access</summary><p>Text and Markdown source to PDF: {health.pdf.engine} {health.pdf.version}. Work runs locally while Kite is running.</p>{health.documents && <p>{health.documents.engine} {health.documents.version}: {health.documents.message}</p>}<p>{health.office.message} Mail, browser automation, lossy compression, and schedules are planned.</p><p>Saved briefs describe an agent’s purpose; each deterministic workflow uses the supplied input and selected settings. It does not execute instructions as code or call a model.</p></details>}
  </main>;
}

function RunComposer({ agents, busy, onClose, onStart, onError }: { agents: BackgroundAgent[]; busy: boolean; onClose(): void; onStart(input: import('../../shared/background').StartRunInput): Promise<void>; onError(message: string): void }) {
  const [title, setTitle] = useState('My document'), [text, setText] = useState(''), [agentId, setAgentId] = useState(''), [workflow, setWorkflow] = useState<DocumentWorkflow>('document_pdf'), [targetMb, setTargetMb] = useState(''), [files, setFiles] = useState<BackgroundFile[]>([]), [choosing, setChoosing] = useState(false);
  const agent = agents.find(a => a.id === agentId), selectedWorkflow = agent?.workflow ?? workflow;
  const requestId = useRef(crypto.randomUUID());
  const choose = async () => { setChoosing(true); try { const result = await window.kite.chooseBackgroundFiles(); if (result.ok) setFiles(result.files); else onError(result.error); } catch { onError('Files could not be selected.'); } finally { setChoosing(false); } };
  return <form className="agents-composer" onSubmit={e => { e.preventDefault(); void onStart({ requestId: requestId.current, title, ...(agentId ? { agentId } : { workflow, ...(workflow === 'pdf_optimize' && targetMb ? { targetBytes: target(targetMb) } : {}) }), ...(selectedWorkflow !== 'pdf_optimize' && text.trim() ? { text } : {}), fileIds: files.map(f => f.id) }); }}>
    <div className="agents-section-title"><h2>New PDF run</h2><button type="button" className="ghost" onClick={onClose}>Close</button></div>
    <div className="agents-form-row"><label>Run name<input autoFocus value={title} onChange={e => { setTitle(e.target.value); requestId.current = crypto.randomUUID(); }} maxLength={120} required /></label><label>Agent<select value={agentId} onChange={e => { setAgentId(e.target.value); requestId.current = crypto.randomUUID(); }}><option value="">One-off document run</option>{agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label></div>
    {!agent && <div className="agents-form-row"><label>Task<select aria-label="Document task" value={workflow} onChange={e => { setWorkflow(e.target.value as DocumentWorkflow); requestId.current = crypto.randomUUID(); }}><option value="document_pdf">Convert text or images to PDF</option><option value="pdf_optimize">Optimize PDF (lossless)</option></select></label>{workflow === 'pdf_optimize' && <label>Target size per PDF (MB, optional)<input type="number" min="0.0009765625" max="20" step="any" value={targetMb} onChange={e => { setTargetMb(e.target.value); requestId.current = crypto.randomUUID(); }} placeholder="No target" /></label>}</div>}
    {agent && <p className="agents-help">{workflowLabels[agent.workflow]}{agent.targetBytes ? ` · target ${bytes(agent.targetBytes)} per PDF` : ''}</p>}
    {selectedWorkflow !== 'pdf_optimize' && <label>Text or Markdown source<textarea value={text} onChange={e => { setText(e.target.value); requestId.current = crypto.randomUUID(); }} maxLength={backgroundLimits.textChars} rows={6} placeholder="Paste text or choose text/image files below. Markdown is preserved as source text." /></label>}
    <div className="agents-actions"><button type="button" disabled={choosing || busy} onClick={() => { void choose(); requestId.current = crypto.randomUUID(); }}>{choosing ? 'Checking files…' : 'Choose files'}</button></div>
    <SelectedFiles files={files} onRemove={id => { setFiles(files.filter(f => f.id !== id)); requestId.current = crypto.randomUUID(); }} />
    <p className="agents-help">{selectedWorkflow === 'pdf_optimize' ? 'Choose plain PDFs. No image downsampling or text changes. If a rewrite is larger, Kite saves an unchanged copy. A size target is a goal, not a guarantee.' : selectedWorkflow === 'text_pdf' ? 'Choose UTF-8 .txt or .md files.' : 'Choose UTF-8 .txt/.md or supported PNG/JPEG images. Each input becomes a separate PDF.'} Originals stay untouched. Without input, the run waits for you.</p>
    {files.some(f => !accepts(f, selectedWorkflow)) && <p role="alert">Remove files that do not match this task, or change the task.</p>}
    <button type="submit" disabled={busy || choosing || !title.trim() || files.some(f => !accepts(f, selectedWorkflow))}>{busy ? 'Starting…' : 'Start run'}</button>
  </form>;
}

function AgentEditor({ agent, busy, onSave, onClose }: { agent: BackgroundAgent | null; busy: boolean; onSave(input: AgentDraft): Promise<void>; onClose(): void }) {
  const [name, setName] = useState(agent?.name ?? ''), [instructions, setInstructions] = useState(agent?.instructions ?? ''), [style, setStyle] = useState(agent?.style ?? 'readable'), [workflow, setWorkflow] = useState<DocumentWorkflow>(agent?.workflow ?? 'document_pdf'), [targetMb, setTargetMb] = useState(agent?.targetBytes ? String(agent.targetBytes / (1024 * 1024)) : '');
  return <form className="agents-composer" key={agent?.id ?? 'new'} onSubmit={e => { e.preventDefault(); void onSave({ name, instructions, workflow, style, ...(workflow === 'pdf_optimize' && targetMb ? { targetBytes: target(targetMb) } : {}), ...(agent ? { id: agent.id, expectedRevision: agent.revision } : {}) }); }}>
    <h3>{agent ? 'Edit agent' : 'Create agent'}</h3><label>Name<input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={80} required /></label>
    <label>Brief<textarea value={instructions} onChange={e => setInstructions(e.target.value)} maxLength={2000} rows={3} placeholder="What will you use this helper for?" /></label>
    <label>Task<select value={workflow} onChange={e => setWorkflow(e.target.value as DocumentWorkflow)}>{Object.entries(workflowLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    {workflow === 'pdf_optimize' ? <label>Target size per PDF (MB, optional)<input type="number" min="0.0009765625" max="20" step="any" value={targetMb} onChange={e => setTargetMb(e.target.value)} /></label> : <label>Text PDF layout<select value={style} onChange={e => setStyle(e.target.value as typeof style)}><option value="readable">Readable — 12 pt</option><option value="compact">Compact — 10 pt</option></select></label>}
    <p className="agents-help">The brief describes this helper’s purpose. Its selected task and settings control the deterministic work.</p>
    <div className="agents-actions"><button disabled={busy || !name.trim()} type="submit">Save agent</button><button type="button" className="ghost" onClick={onClose}>Cancel</button></div>
  </form>;
}

function RunRequest({ run, busy, onAnswer }: { run: BackgroundRun; busy: boolean; onAnswer(input: import('../../shared/background').RunAnswer): Promise<void> }) {
  const [text, setText] = useState(''), [files, setFiles] = useState<BackgroundFile[]>([]), [choosing, setChoosing] = useState(false), [error, setError] = useState(''), request = run.request;
  const choose = async () => { setChoosing(true); try { const result = await window.kite.chooseBackgroundFiles(); if (result.ok) setFiles(result.files); else setError(result.error); } catch { setError('Files could not be selected.'); } finally { setChoosing(false); } };
  const base = { runId: run.id, requestId: request.id, expectedRevision: run.revision };
  return <section className="agents-request" aria-label="Your input"><h3>{request.kind === 'approval' ? 'Your approval' : 'Add input'}</h3><p>{request.message}</p>
    {request.kind === 'input' ? <form onSubmit={e => { e.preventDefault(); void onAnswer({ ...base, ...(run.workflow !== 'pdf_optimize' && text.trim() ? { text } : {}), fileIds: files.map(f => f.id) }); }}>{run.workflow !== 'pdf_optimize' && <label>Text to convert<textarea value={text} onChange={e => setText(e.target.value)} rows={5} maxLength={backgroundLimits.textChars} /></label>}<div className="agents-actions"><button type="button" disabled={choosing || busy} onClick={() => { void choose(); }}>{choosing ? 'Checking files…' : 'Choose files'}</button></div><SelectedFiles files={files} onRemove={id => setFiles(files.filter(f => f.id !== id))} />{error && <p role="alert">{error}</p>}{files.some(f => !accepts(f, run.workflow ?? 'text_pdf')) && <p role="alert">Choose files that match this task.</p>}<button disabled={busy || choosing || (!text.trim() && !files.length) || files.some(f => !accepts(f, run.workflow ?? 'text_pdf'))}>Continue run</button></form> : <>
      <p>{run.inputs.join(', ')} · local output · no external upload</p><div className="agents-actions"><button disabled={busy} onClick={() => { void onAnswer({ ...base, approved: true }); }}>Approve these PDFs</button><button disabled={busy} className="ghost" onClick={() => { void onAnswer({ ...base, approved: false }); }}>Decline</button></div>
      {request.expiresAt && <small>Review by {new Date(request.expiresAt).toLocaleString()}.</small>}
    </>}
  </section>;
}
