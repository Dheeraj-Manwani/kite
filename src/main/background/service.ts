import { randomUUID } from 'node:crypto';
import { open, readFile } from 'node:fs/promises';
import path from 'node:path';
import { agentDraftSchema, answerRunSchema, backgroundLimits, finishedRun, runControlSchema, startRunSchema, type BackgroundAgent, type BackgroundArtifact, type BackgroundDetail, type BackgroundFile, type BackgroundResult, type BackgroundSnapshot, type PdfStyle } from '../../shared/background';
import { defaultPermissions, resolve, type PermissionSettings } from '../../shared/permissions';
import { BackgroundStore, defaultPdfAgent, publicRun, type FrozenSource, type RunInput, type RunRecord, type OperationRecord } from './store';
import { hashOf, inspectPdf, publishPdf, safeArtifact } from './artifacts';
import { safeFilename } from '../tools/impl/create_note';
import { DocumentFailure, type DocumentMetadata, type DocumentOutput } from './executors/documentTypes';

export interface BackgroundDeps {
  store: BackgroundStore; root: string;
  convert(input: RunInput, style: PdfStyle, signal: AbortSignal, agent?: BackgroundAgent): Promise<Uint8Array | DocumentOutput>;
  inspect?(input: RunInput, bytes: Uint8Array): Promise<DocumentMetadata>;
  changed(runId?: string): void;
  notice?(run: ReturnType<typeof publicRun>): void;
}
const invalid = (error: string): BackgroundResult => ({ ok: false, error });
const aborted = () => new DOMException('Aborted', 'AbortError');

/** App-owned and renderer-independent. Only registered deterministic document workflows can execute. */
export class BackgroundRunService {
  private active = new Map<string, { controller: AbortController; promise: Promise<void> }>();
  private blocked = new Set<string>();
  private stopping = false;
  private grants = new Map<string, { input: RunInput; bytes: number; binary?: Uint8Array; expiresAt: number }>();
  private settings = () => ({ permissions: defaultPermissions, dryRun: false });
  constructor(private deps: BackgroundDeps) {
    for (const run of deps.store.active()) if (['running', 'verifying'].includes(run.status)) {
      const recoveryCount = (run.recoveryCount ?? 0) + 1;
      const exhausted = recoveryCount >= backgroundLimits.attempts;
      this.change(run, { status: exhausted ? 'failed' : 'queued', recoveryCount, generation: run.generation + 1 }, 'recovery', exhausted ? 'Recovery limit reached after repeated interruptions. Retry to start a new run.' : 'Recovered after interruption; checking saved output before retrying.');
    }
  }
  setSettings(get: () => { permissions: PermissionSettings; dryRun: boolean }) { this.settings = get; }
  get paused() { return this.blocked.size > 0; }
  snapshot(): BackgroundSnapshot { return { agents: this.deps.store.agents(), runs: this.deps.store.runs().map(publicRun), paused: this.paused }; }
  detail(id: string, after = 0): BackgroundDetail | null { const run = this.deps.store.get(id); return run ? { run: publicRun(run), events: this.deps.store.events(id, after) } : null; }
  start() { this.pump(); }
  saveAgent(value: unknown): BackgroundResult {
    const parsed = agentDraftSchema.safeParse(value); if (!parsed.success) return invalid('Enter a name, brief, and valid PDF layout.');
    const draft = parsed.data, previous = draft.id ? this.deps.store.agent(draft.id) : null;
    if (draft.id && !previous) return invalid('This agent no longer exists.');
    if (previous?.archived) return invalid('This agent is archived.');
    if (previous && draft.expectedRevision !== previous.revision) return invalid('This agent changed. Refresh before saving.');
    const at = Date.now(), id = previous?.id ?? randomUUID();
    this.deps.store.saveAgent({ id, revision: (previous?.revision ?? 0) + 1, name: draft.name, instructions: draft.instructions, workflow: draft.workflow, style: draft.style, ...(draft.targetBytes ? { targetBytes: draft.targetBytes } : {}), archived: false, createdAt: previous?.createdAt ?? at, updatedAt: at }, draft.expectedRevision);
    this.deps.changed(); return { ok: true, agentId: id };
  }
  archiveAgent(id: string, revision: number): BackgroundResult {
    const agent = this.deps.store.agent(id); if (!agent || agent.revision !== revision) return invalid('This agent changed. Refresh before archiving.');
    this.deps.store.saveAgent({ ...agent, archived: true, revision: agent.revision + 1, updatedAt: Date.now() }, revision);
    this.deps.changed(); return { ok: true };
  }
  /** Native selection freezes bytes. Binary blobs are encrypted once when a run accepts them, not inside every event. */
  async attachFiles(filenames: string[]): Promise<BackgroundFile[]> {
    if (filenames.length > backgroundLimits.files) throw new Error('Choose at most eight files.');
    for (const [id, grant] of this.grants) if (grant.expiresAt <= Date.now()) this.grants.delete(id);
    if (this.grants.size + filenames.length > 32) throw new Error('Start a run with your selected files before choosing more.');
    const attached: { id: string; input: RunInput; bytes: number; binary?: Uint8Array }[] = [];
    let batchBytes = 0;
    for (const filename of filenames) {
      const extension = path.extname(filename).toLowerCase(), kind = extension === '.pdf' ? 'pdf' : extension === '.png' ? 'png' : ['.jpg', '.jpeg'].includes(extension) ? 'jpeg' : ['.txt', '.md'].includes(extension) ? 'text' : null;
      if (!kind) throw new Error('Choose .txt, .md, .png, .jpg, .jpeg, or .pdf files. Office conversion is not available yet.');
      const limit = kind === 'text' ? backgroundLimits.inputBytes : backgroundLimits.binaryBytes;
      const file = await open(filename, 'r');
      try {
        const stat = await file.stat(); if (!stat.isFile() || stat.size > limit) throw new Error('Choose text files up to 2 MB or PDF/images up to 5 MB.');
        batchBytes += stat.size;
        if (batchBytes > backgroundLimits.batchBytes || [...this.grants.values()].reduce((n, g) => n + g.bytes, 0) + batchBytes > backgroundLimits.grantBytes) throw new Error('Choose up to 16 MB per batch. Start your selected runs before adding more files.');
        const buffer = Buffer.alloc(Math.min(stat.size + 1, limit + 1));
        const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
        if (bytesRead !== stat.size) throw new Error('The file changed while it was being selected. Choose it again.');
        const id = randomUUID(), name = path.basename(filename).slice(0, 120), bytes = buffer.subarray(0, bytesRead);
        if (kind === 'text') {
          const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
          if (!text.trim() || text.length > backgroundLimits.textChars || text.includes('\0')) throw new Error('Choose a nonempty UTF-8 file with at most 100,000 characters.');
          attached.push({ id, input: { name, text, kind, bytes: bytesRead }, bytes: bytesRead });
        } else {
          if (!this.deps.inspect) throw new DocumentFailure('worker');
          await this.deps.inspect({ name, kind }, bytes);
          attached.push({ id, input: { name, kind, sourceId: id, hash: hashOf(bytes), bytes: bytesRead }, bytes: bytesRead, binary: bytes });
        }
      } finally { await file.close(); }
    }
    if (this.stopping) throw new DocumentFailure('worker');
    // Other picker requests can finish while binary admission awaits its worker.
    if (this.grants.size + attached.length > 32 || [...this.grants.values()].reduce((n, g) => n + g.bytes, 0) + batchBytes > backgroundLimits.grantBytes) throw new Error('Start your selected runs before adding more files.');
    for (const file of attached) this.grants.set(file.id, { input: file.input, bytes: file.bytes, binary: file.binary, expiresAt: Date.now() + 30 * 60_000 });
    return attached.map(({ id, input, bytes }) => ({ id, name: input.name, bytes, kind: input.kind }));
  }
  enqueue(value: unknown): BackgroundResult {
    if (this.stopping) return invalid('Kite is shutting down. Try again after restart.');
    const parsed = startRunSchema.safeParse(value); if (!parsed.success) return invalid('The run request is invalid.');
    const input = parsed.data, inputHash = hashOf(JSON.stringify(input));
    const existing = this.deps.store.byRequest(input.requestId);
    if (existing) return existing.inputHash === inputHash ? { ok: true, runId: existing.id } : invalid('This request ID was already used for different work.');
    if (this.deps.store.active().length >= 50) return invalid('Finish or cancel queued runs before starting more.');
    if (this.settings().dryRun) return invalid('Turn off Preview actions in Settings before starting background work.');
    if (this.permission() === 'never') return invalid('Add or save is not allowed in Settings → Permissions.');
    const agent = input.agentId ? this.deps.store.agent(input.agentId) : defaultPdfAgent(input.workflow, input.targetBytes);
    if (!agent || agent.archived) return invalid('Choose an available agent.');
    if (input.agentId && ((input.workflow && input.workflow !== agent.workflow) || input.targetBytes !== undefined)) return invalid('Saved helpers use their saved workflow and size target. Edit the helper or start a one-off run.');
    const inputs: RunInput[] = input.text?.trim() ? [{ name: `${input.title}.txt`, text: input.text }] : [];
    for (const id of input.fileIds ?? []) {
      const grant = this.grants.get(id); if (!grant || grant.expiresAt <= Date.now()) return invalid('Choose the files again; their access grant expired.');
      inputs.push({ ...grant.input });
    }
    if (inputs.length > backgroundLimits.files) return invalid('A run can convert at most eight inputs.');
    const issue = this.inputIssue(inputs, agent); if (issue) return invalid(issue);
    const at = Date.now(), run: RunRecord = { id: randomUUID(), requestId: input.requestId, inputHash, agent: structuredClone(agent), title: input.title, inputs, status: inputs.length ? 'queued' : 'waiting_user', revision: 1, generation: 1, createdAt: at, updatedAt: at, message: inputs.length ? 'Ready to process on this PC.' : agent.workflow === 'pdf_optimize' ? 'Choose plain PDFs to optimize without changing their text or images.' : 'Add text or choose text/image files to turn into PDFs.', completed: 0, attempts: 0, request: null, approvedBinding: null, artifacts: [], parentId: null };
    if (!inputs.length) run.request = { id: randomUUID(), kind: 'input', message: run.message, binding: this.binding(run), expiresAt: null };
    this.deps.store.insert(run, run.message, this.sources(inputs)); this.deps.changed(run.id); this.pump();
    return { ok: true, runId: run.id };
  }
  answer(value: unknown): BackgroundResult {
    const parsed = answerRunSchema.safeParse(value); if (!parsed.success) return invalid('The answer is invalid.');
    const answer = parsed.data, run = this.deps.store.get(answer.runId), request = run?.request;
    if (!run || run.revision !== answer.expectedRevision || run.status !== 'waiting_user' || !request || request.id !== answer.requestId) return invalid('This request changed. Refresh before answering.');
    if (request.binding !== this.binding(run)) return invalid('The requested action changed. Start a new run.');
    if (request.kind === 'input') {
      const inputs: RunInput[] = answer.text?.trim() ? [{ name: `${run.title}.txt`, text: answer.text }] : [];
      for (const id of answer.fileIds ?? []) {
        const grant = this.grants.get(id); if (!grant || grant.expiresAt <= Date.now()) return invalid('Choose the files again; their access grant expired.');
        inputs.push({ ...grant.input });
      }
      if (!inputs.length || inputs.length > backgroundLimits.files) return invalid('Add input or choose up to eight supported files.');
      const issue = this.inputIssue(inputs, run.agent); if (issue) return invalid(issue);
      this.change(run, { inputs, status: 'queued', request: null, approvedBinding: null }, 'answer', 'Input supplied; queued for processing.', this.sources(inputs));
    } else {
      if (answer.approved !== true) { this.change(run, { status: 'cancelled', request: null, generation: run.generation + 1 }, 'denied', 'Conversion was not approved.'); return { ok: true }; }
      if (request.expiresAt <= Date.now()) {
        this.change(run, { status: 'queued', request: null, approvedBinding: null }, 'expired', 'The approval expired. A fresh confirmation is needed.'); this.pump(); return invalid('The approval expired; review the new request.');
      }
      if (this.permission() === 'never' || this.settings().dryRun) return invalid('Your settings no longer allow this work.');
      this.change(run, { status: 'queued', request: null, approvedBinding: request.binding }, 'approved', 'Approved these inputs and this PDF layout.');
    }
    this.pump(); return { ok: true };
  }
  control(value: unknown): BackgroundResult {
    const parsed = runControlSchema.safeParse(value); if (!parsed.success) return invalid('The run control is invalid.');
    const { runId, expectedRevision, action } = parsed.data, run = this.deps.store.get(runId);
    if (!run || run.revision !== expectedRevision) return invalid('This run changed. Refresh before continuing.');
    if (action === 'retry') {
      if (!finishedRun(run.status)) return invalid('Only a finished run can be retried.');
      const at = Date.now(), retry: RunRecord = { ...structuredClone(run), id: randomUUID(), requestId: randomUUID(), inputHash: randomUUID(), status: run.inputs.length ? 'queued' : 'waiting_user', revision: 1, generation: 1, createdAt: at, updatedAt: at, completed: 0, attempts: 0, recoveryCount: 0, artifacts: [], approvedBinding: null, parentId: run.id, request: null, message: 'Retry queued with the original input snapshot.' };
      if (!retry.inputs.length) retry.request = { id: randomUUID(), kind: 'input', message: 'Add the text to convert.', binding: this.binding(retry), expiresAt: null };
      if (this.deps.store.active().length >= 50) return invalid('Finish queued work before retrying.');
      this.deps.store.insert(retry, retry.message); this.deps.changed(retry.id); this.pump(); return { ok: true, runId: retry.id };
    }
    if (finishedRun(run.status)) return invalid('This run has already finished.');
    if (action === 'resume') {
      if (run.status !== 'paused') return invalid('This run is not paused.');
      this.change(run, { status: run.request ? 'waiting_user' : 'queued' }, 'resumed', 'Resumed from the saved checkpoint.');
    } else {
      this.change(run, { status: action === 'cancel' ? 'cancelled' : 'paused', generation: run.generation + 1, ...(action === 'cancel' ? { request: null } : {}) }, action, action === 'cancel' ? 'Cancelled; no further outputs will be published.' : 'Paused at the current checkpoint.');
      this.active.get(runId)?.controller.abort();
    }
    this.pump(); return { ok: true };
  }
  setPaused(paused: boolean, source = 'kite') {
    if (paused) this.blocked.add(source); else this.blocked.delete(source);
    if (paused) for (const [id, active] of this.active) {
      const run = this.deps.store.get(id);
      if (run && ['running', 'verifying'].includes(run.status)) this.change(run, { status: 'queued', generation: run.generation + 1 }, 'suspended', 'Kite paused; work is saved for later.');
      active.controller.abort();
    }
    this.deps.changed(); this.pump();
  }
  private inputIssue(inputs: RunInput[], agent: BackgroundAgent) {
    if (inputs.reduce((n, i) => n + (i.bytes ?? Buffer.byteLength(i.text ?? '')), 0) > backgroundLimits.batchBytes) return 'A run can process at most 16 MB of input.';
    if (agent.workflow === 'pdf_optimize' && inputs.some(i => i.kind !== 'pdf')) return 'PDF optimization accepts only plain .pdf files; choose Convert to PDF for text or images.';
    if (agent.workflow !== 'pdf_optimize' && inputs.some(i => i.kind === 'pdf')) return 'Choose Optimize PDF to reduce a PDF; conversion accepts text or images.';
    if (agent.workflow === 'text_pdf' && inputs.some(i => i.kind && i.kind !== 'text')) return 'This saved helper accepts text only. Choose Document Helper for images.';
    return null;
  }
  private sources(inputs: RunInput[]): FrozenSource[] { return inputs.flatMap(input => input.sourceId ? [{ id: input.sourceId, bytes: this.grants.get(input.sourceId).binary }] : []); }
  private binding(run: RunRecord) { return hashOf(JSON.stringify({ id: run.id, revision: run.agent.revision, style: run.agent.style, inputs: run.inputs, ...(run.agent.workflow !== 'text_pdf' ? { workflow: run.agent.workflow, targetBytes: run.agent.targetBytes } : {}) })); }
  private permission() { return resolve({ category: 'add', reason: '' }, this.settings().permissions, { place: 'app:kite-pdf' }).permission; }
  private change(run: RunRecord, patch: Partial<RunRecord>, type: string, message: string, sources: FrozenSource[] = []) {
    const next = { ...run, ...patch, revision: run.revision + 1, updatedAt: Date.now(), message };
    this.deps.store.save(next, run.revision, type, message, sources); this.deps.changed(next.id);
    if ((next.status === 'waiting_user' || finishedRun(next.status)) && next.status !== 'cancelled') this.deps.notice?.(publicRun(next));
    return next;
  }
  private pump() {
    if (this.stopping || this.paused) return;
    for (const run of this.deps.store.active()) {
      if (this.active.size >= backgroundLimits.activeRuns) break;
      if (run.status !== 'queued' || this.active.has(run.id)) continue;
      const controller = new AbortController();
      // Defer execution until the slot is registered; an executor can resolve synchronously in tests.
      const promise = Promise.resolve().then(() => this.execute(run.id, controller.signal)).finally(() => { this.active.delete(run.id); this.pump(); });
      this.active.set(run.id, { controller, promise });
    }
  }
  private async execute(id: string, signal: AbortSignal) {
    let run = this.deps.store.get(id); if (!run || signal.aborted || run.status !== 'queued') return;
    const generation = run.generation;
    const current = () => { const r = this.deps.store.get(id); return !signal.aborted && !this.stopping && r?.generation === generation && ['running', 'verifying'].includes(r.status); };
    let timeout: ReturnType<typeof setTimeout>;
    try {
      if (this.settings().dryRun || this.permission() === 'never') { this.change(run, { status: 'failed' }, 'blocked', 'Settings do not allow saving this PDF.'); return; }
      if (this.permission() === 'ask' && run.approvedBinding !== this.binding(run)) {
        const message = run.agent.workflow === 'pdf_optimize' ? `Optimize ${run.inputs.length} PDF${run.inputs.length === 1 ? '' : 's'} losslessly and save new copies${run.agent.targetBytes ? `, aiming for at most ${run.agent.targetBytes} bytes each` : ''}?` : `Save ${run.inputs.length} PDF${run.inputs.length === 1 ? '' : 's'} from these inputs in Kite, using ${run.agent.style} layout for text?`;
        this.change(run, { status: 'waiting_user', request: { id: randomUUID(), kind: 'approval', binding: this.binding(run), message, expiresAt: Date.now() + 24 * 60 * 60_000 } }, 'approval', message); return;
      }
      if ((run.recoveryCount ?? 0) >= backgroundLimits.attempts) { this.change(run, { status: 'failed' }, 'budget', 'Recovery limit reached. Retry to start a new run.'); return; }
      run = this.change(run, { status: 'running', attempts: run.attempts + 1 }, 'started', 'Processing on this PC; document contents stay local.');
      timeout = setTimeout(() => {
        if (!current()) return;
        const latest = this.deps.store.get(id); this.change(latest, { status: 'failed', generation: latest.generation + 1 }, 'timeout', 'Conversion exceeded its two-minute limit.'); this.active.get(id)?.controller.abort();
      }, backgroundLimits.wallMs);
      for (let index = run.completed; index < run.inputs.length; index++) {
        if (!current()) throw aborted();
        const input = run.inputs[index], operationId = `${id}:pdf:${index}`;
        const inputDigest = input.hash ?? hashOf(input.text ?? '');
        let operation: OperationRecord = this.deps.store.operation(operationId) ?? { id: operationId, runId: id, generation, index, inputHash: inputDigest, style: run.agent.style, state: 'intent' };
        if (operation.inputHash !== inputDigest || operation.style !== run.agent.style) throw new Error('Recovery input did not match the saved operation.');
        let output = operation.state !== 'intent' ? await safeArtifact(this.deps.root, id, index, operation.pages) : null;
        if (output && (output.hash !== operation.hash || output.bytes !== operation.bytes)) throw new Error('The saved output changed after conversion.');
        if (!output) {
          operation = { ...operation, generation, state: 'intent' }; this.deps.store.saveOperation(operation);
          const result = await this.deps.convert(input, run.agent.style, signal, run.agent);
          const bytes = result instanceof Uint8Array ? result : result.bytes;
          if (!current()) throw aborted();
          const checked = inspectPdf(bytes, result instanceof Uint8Array ? undefined : result.pages);
          operation = { ...operation, state: 'prepared', ...checked, ...(result instanceof Uint8Array ? {} : { optimization: result.optimization }) }; this.deps.store.saveOperation(operation);
          if (this.settings().dryRun || this.permission() === 'never' || (this.permission() === 'ask' && run.approvedBinding !== this.binding(run))) throw new Error('Permissions changed before the PDF could be saved.');
          await publishPdf(this.deps.root, id, index, generation, bytes, current);
          output = { filename: '', ...checked };
        }
        if (!current()) throw aborted();
        const latest = this.deps.store.get(id);
        if (this.settings().dryRun || this.permission() === 'never' || (this.permission() === 'ask' && run.approvedBinding !== this.binding(run))) throw new Error('Permissions changed before the PDF could be saved.');
        const artifact: BackgroundArtifact = { id: `${id}:${index}`, name: `${safeFilename(input.name.replace(/\.(txt|md|png|jpe?g|pdf)$/i, ''))}${run.agent.workflow === 'pdf_optimize' ? '-optimized' : ''}.pdf`, mediaType: 'application/pdf', bytes: output.bytes, hash: output.hash, pages: output.pages, ...(operation.optimization ? { optimization: operation.optimization } : {}) };
        run = { ...latest, status: 'verifying', completed: index + 1, artifacts: [...latest.artifacts.filter(a => a.id !== artifact.id), artifact], revision: latest.revision + 1, updatedAt: Date.now(), message: `Checked ${index + 1} of ${latest.inputs.length} PDFs.` };
        this.deps.store.commitOutput(run, latest.revision, operation); this.deps.changed(id);
      }
      if (current()) {
        const unmet = run.artifacts.filter(a => a.optimization?.targetMet === false).length;
        const unchanged = run.artifacts.filter(a => a.optimization && !a.optimization.changed).length;
        this.change(this.deps.store.get(id), { status: 'succeeded', request: null }, 'completed', `Saved ${run.artifacts.length} checked PDF${run.artifacts.length === 1 ? '' : 's'}.${unmet ? ` ${unmet} size target${unmet === 1 ? '' : 's'} not met.` : ''}${unchanged ? ` ${unchanged} had no smaller lossless rewrite; saved unchanged copies.` : ''}`);
      }
    } catch (error) {
      if (current()) this.change(this.deps.store.get(id), { status: 'failed' }, 'failed', error instanceof DocumentFailure ? error.message : error instanceof Error && error.message.startsWith('Permissions changed') ? error.message : 'Document processing could not finish. Your inputs and checked outputs are saved; you can retry.');
    } finally { clearTimeout(timeout); }
  }
  async artifactPath(runId: string, artifactId: string) {
    const run = this.deps.store.get(runId), index = run?.artifacts.findIndex(a => a.id === artifactId);
    if (!run || index === undefined || index < 0) return null;
    const recorded = run.artifacts[index], result = await safeArtifact(this.deps.root, runId, Number(artifactId.split(':').at(-1)), recorded.pages);
    return result?.hash === recorded.hash ? result.filename : null;
  }
  async artifactBytes(runId: string, artifactId: string) {
    const recorded = this.deps.store.get(runId)?.artifacts.find(a => a.id === artifactId);
    const filename = await this.artifactPath(runId, artifactId); if (!filename || !recorded) return null;
    try { const bytes = await readFile(filename); return hashOf(bytes) === recorded.hash ? bytes : null; } catch { return null; }
  }
  async shutdown() {
    this.stopping = true; this.setPaused(true, 'shutdown');
    await Promise.allSettled([...this.active.values()].map(a => a.promise)); this.grants.clear();
  }
}
