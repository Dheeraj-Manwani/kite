import { randomUUID } from 'node:crypto';
import { open, readFile } from 'node:fs/promises';
import path from 'node:path';
import { agentDraftSchema, answerRunSchema, backgroundLimits, finishedRun, runControlSchema, startRunSchema, type BackgroundAgent, type BackgroundArtifact, type BackgroundDetail, type BackgroundFile, type BackgroundResult, type BackgroundSnapshot, type PdfStyle } from '../../shared/background';
import { defaultPermissions, resolve, type PermissionSettings } from '../../shared/permissions';
import { BackgroundStore, defaultPdfAgent, publicRun, publicSchedule, type ScheduleRecord, type FrozenSource, type RunInput, type RunRecord, type OperationRecord } from './store';
import { hashOf, inspectPdf, publishPdf, safeArtifact, inspectAttachment } from './artifacts';
import { safeFilename } from '../tools/impl/create_note';
import { DocumentFailure, type DocumentMetadata, type DocumentOutput } from './executors/documentTypes';
import type { MailConnector } from '../connectors/mail/gmail';
import type { MailOptions, BoundMailOptions } from '../../shared/mail';
import { MailFailure } from '../connectors/mail/errors';
import { briefingText } from '../connectors/mail/content';
import { CareerDiscovery, CareerFailure, shortlistText, boardsFromAlerts } from './career/discovery';
import { CareerBrowser } from './career/browser';
import { scheduleDraftSchema, scheduleControlSchema, scheduleHistorySchema } from '../../shared/schedules';
import { firstOccurrence, dueOccurrence, resultFingerprint } from './scheduling';

export interface BackgroundDeps {
  store: BackgroundStore; root: string;
  convert(input: RunInput, style: PdfStyle, signal: AbortSignal, agent?: BackgroundAgent): Promise<Uint8Array | DocumentOutput>;
  inspect?(input: RunInput, bytes: Uint8Array): Promise<DocumentMetadata>;
  mail?: MailConnector;
  career?: CareerDiscovery;
  browser?: CareerBrowser;
  changed(runId?: string): void;
  notice?(run: ReturnType<typeof publicRun>): void;
}
const invalid = (error: string): BackgroundResult => ({ ok: false, error });
const aborted = () => new DOMException('Aborted', 'AbortError');

/** App-owned and renderer-independent. Only registered, bounded workflows can execute. */
export class BackgroundRunService {
  private active = new Map<string, { controller: AbortController; promise: Promise<void> }>();
  private blocked = new Set<string>();
  private stopping = false;
  private scheduleTimer: ReturnType<typeof setInterval>;
  private grants = new Map<string, { input: RunInput; bytes: number; binary?: Uint8Array; expiresAt: number }>();
  private settings = () => ({ permissions: defaultPermissions, dryRun: false });
  constructor(private deps: BackgroundDeps) {
    for (const run of deps.store.active()) if (run.application && !run.application.mutation && deps.store.operation(`application:${hashOf(run.application.job.key)}`)) {
      this.change(run, { application: { ...run.application, mutation: { at: Date.now(), destination: run.application.job.url }, outcome: 'uncertain' }, status: 'waiting_user', approvedBinding: null, request: { id: randomUUID(), kind: 'application_takeover', binding: this.binding(run), expiresAt: null, message: 'An interrupted external intent has an uncertain outcome. Check employer confirmation; this application will never be replayed.' } }, 'uncertain_recovery', 'Recovered an external intent without an outcome; application replay is blocked.');
    }
    for (const run of deps.store.active()) if (['running', 'verifying'].includes(run.status)) {
      const recoveryCount = (run.recoveryCount ?? 0) + 1;
      const exhausted = recoveryCount >= backgroundLimits.attempts;
      this.change(run, { status: exhausted ? 'failed' : 'queued', recoveryCount, generation: run.generation + 1 }, 'recovery', exhausted ? 'Recovery limit reached after repeated interruptions. Retry to start a new run.' : 'Recovered after interruption; checking saved output before retrying.');
    }
  }
  setSettings(get: () => { permissions: PermissionSettings; dryRun: boolean }) { this.settings = get; }
  get paused() { return this.blocked.size > 0; }
  snapshot(): BackgroundSnapshot { return { agents: this.deps.store.agents(), runs: this.deps.store.runs().map(publicRun), paused: this.paused, schedules: this.deps.store.schedules().map(publicSchedule) }; }
  detail(id: string, after = 0): BackgroundDetail | null { const run = this.deps.store.get(id); return run ? { run: publicRun(run), events: this.deps.store.events(id, after), ...(run.briefing ? { briefing: run.briefing } : {}), ...(run.shortlist ? { shortlist: run.shortlist } : {}), ...(run.application ? { application: run.application } : {}) } : null; }
  start() {
    if (this.stopping) return;
    if (!this.scheduleTimer) this.scheduleTimer = setInterval(() => this.tickSchedules(), 15_000);
    this.tickSchedules(); this.pump();
  }
  private policyHash() { return hashOf(JSON.stringify(this.settings())); }
  private scheduleAllowed(s: ScheduleRecord) {
    if (this.settings().dryRun || this.permission() === 'never' || s.policyHash !== this.policyHash() || this.deps.store.agent(s.agentId)?.archived) return false;
    if (s.mail) { const a = this.deps.mail?.account(s.mail.accountId); return this.canReadMail() && a?.status === 'connected' && a.email === s.mail.email && a.revision === s.mail.accountRevision; }
    return s.agent.workflow === 'career_scout' && !!this.deps.career && this.canReadCareer({ agent: s.agent } as RunRecord);
  }
  private recurringAllowed(run: RunRecord) {
    if (!run.schedule) return true;
    const s = this.deps.store.schedule(run.schedule.id);
    return !!s && s.consentId === run.schedule.consentId && this.scheduleAllowed(s);
  }
  saveSchedule(value: unknown): BackgroundResult {
    const parsed = scheduleDraftSchema.safeParse(value); if (!parsed.success) return invalid('Choose a saved helper, valid recurrence, and approve its recurring reads.');
    if (this.stopping) return invalid('Kite is shutting down.');
    const draft = parsed.data, draftHash = hashOf(JSON.stringify(draft)), previous = this.deps.store.schedule(draft.requestId);
    if (previous) return previous.draftHash === draftHash ? { ok: true, scheduleId: previous.id } : invalid('This schedule request ID was used for different settings.');
    if (this.deps.store.schedules().length >= 20) return invalid('This release supports up to 20 schedules.');
    const agent = this.deps.store.agent(draft.agentId);
    if (!agent || agent.archived || agent.revision !== draft.agentRevision || !['inbox_briefing','career_scout'].includes(agent.workflow)) return invalid('Schedule a current saved Inbox Briefing or Career Scout helper.');
    let mail: BoundMailOptions;
    try { if (agent.mail) mail = this.bindMail(agent.mail); } catch { return invalid('Reconnect the selected Gmail account first.'); }
    const at = Date.now(), schedule: ScheduleRecord = { id: draft.requestId, revision: 1, agentId: agent.id, agentName: agent.name, agentRevision: agent.revision, agent: structuredClone(agent), ...(mail ? { mail } : {}), consentId: randomUUID(), policyHash: this.policyHash(), draftHash, recurrence: draft.recurrence, state: 'active', nextAt: firstOccurrence(draft.recurrence, at), createdAt: at, lastRunId: null, message: 'Approved recurring reads of this frozen helper and local results. Unchanged checks stay quiet.' };
    if (!this.scheduleAllowed(schedule)) return invalid('Current settings or account access block recurring reads.');
    this.deps.store.saveSchedule(schedule); this.deps.changed(); return { ok: true, scheduleId: schedule.id };
  }
  controlSchedule(value: unknown): BackgroundResult {
    const parsed = scheduleControlSchema.safeParse(value); if (!parsed.success) return invalid('Invalid schedule control.');
    const { id, revision, action } = parsed.data, s = this.deps.store.schedule(id);
    if (this.stopping || !s || s.revision !== revision) return invalid('This schedule changed. Refresh before continuing.');
    let next = { ...s, revision: s.revision + 1 };
    if (action === 'pause') next = { ...next, state: 'paused', message: 'Future checks paused. An accepted run can still finish; pause or cancel it separately.' };
    else {
      if (action === 'renew') {
        if (s.lastRunId && !finishedRun(this.deps.store.get(s.lastRunId).status)) return invalid('Finish or cancel the outstanding run before renewing recurring access.');
        try { const mail = s.mail ? this.bindMail(s.mail) : undefined; if (mail && mail.email !== s.mail.email) return invalid('Reconnect the same Gmail identity; a schedule cannot switch mailboxes.'); next = { ...next, consentId: randomUUID(), policyHash: this.policyHash(), ...(mail ? { mail } : {}) }; } catch { return invalid('Reconnect the same Gmail account first.'); }
      }
      if (!this.scheduleAllowed(next)) return invalid('Settings or account access changed. Review the frozen helper and renew recurring access.');
      next = { ...next, state: 'active', nextAt: firstOccurrence(s.recurrence, Date.now()), message: 'Recurring checks enabled. Missed checks are coalesced; unchanged results stay quiet.' };
    }
    this.deps.store.saveSchedule(next, revision); this.deps.changed(); return { ok: true };
  }
  scheduleHistory(value: unknown) { const parsed = scheduleHistorySchema.safeParse(value); return parsed.success ? this.deps.store.scheduleHistory(parsed.data.id, parsed.data.before) : null; }
  /** The transaction owns occurrence identity, next cursor, and frozen run together. */
  tickSchedules(now = Date.now()) {
    if (this.stopping || this.paused) return;
    for (const schedule of this.deps.store.schedules()) {
      if (schedule.state !== 'active' || (schedule.lastRunId && !finishedRun(this.deps.store.get(schedule.lastRunId).status))) continue;
      if (this.deps.store.active().length >= 50) break;
      const due = dueOccurrence(schedule.recurrence, schedule.nextAt, now); if (!due) continue;
      const run: RunRecord = { id: randomUUID(), requestId: randomUUID(), inputHash: hashOf(`${schedule.id}:${due.at}`), agent: structuredClone(schedule.agent), ...(schedule.mail ? { mail: schedule.mail } : {}), title: `${schedule.agentName} check`.slice(0,120), inputs: [], status: 'queued', revision: 1, generation: 1, createdAt: now, updatedAt: now, message: 'Scheduled check accepted on this PC.', completed: 0, attempts: 0, approvedBinding: null, request: null, artifacts: [], parentId: null, schedule: { id: schedule.id, consentId: schedule.consentId, at: due.at } };
      if (this.scheduleAllowed(schedule)) run.approvedBinding = this.binding(run);
      this.deps.store.dispatch({ ...schedule, revision: schedule.revision + 1, nextAt: due.nextAt, lastRunId: run.id }, schedule.revision, run);
      this.deps.changed(run.id);
    }
    this.pump();
  }
  saveAgent(value: unknown): BackgroundResult {
    const parsed = agentDraftSchema.safeParse(value); if (!parsed.success) return invalid('Enter a name, brief, and valid PDF layout.');
    const draft = parsed.data, previous = draft.id ? this.deps.store.agent(draft.id) : null;
    if (draft.id && !previous) return invalid('This agent no longer exists.');
    if (previous?.archived) return invalid('This agent is archived.');
    if (previous && draft.expectedRevision !== previous.revision) return invalid('This agent changed. Refresh before saving.');
    const at = Date.now(), id = previous?.id ?? randomUUID();
    if (draft.mail && !this.deps.mail?.account(draft.mail.accountId)) return invalid('Choose an existing mail account.');
    this.deps.store.saveAgent({ id, revision: (previous?.revision ?? 0) + 1, name: draft.name, instructions: draft.instructions, workflow: draft.workflow, style: draft.style, ...(draft.targetBytes ? { targetBytes: draft.targetBytes } : {}), ...(draft.mail ? { mail: draft.mail } : {}), ...(draft.career ? { career: draft.career } : {}), archived: false, createdAt: previous?.createdAt ?? at, updatedAt: at }, draft.expectedRevision);
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
    if (input.workflow === 'job_application') return invalid('Choose a role from a saved shortlist.');
    const existing = this.deps.store.byRequest(input.requestId);
    if (existing) return existing.inputHash === inputHash ? { ok: true, runId: existing.id } : invalid('This request ID was already used for different work.');
    if (this.deps.store.active().length >= 50) return invalid('Finish or cancel queued runs before starting more.');
    if (this.settings().dryRun) return invalid('Turn off Preview actions in Settings before starting background work.');
    if (this.permission() === 'never') return invalid('Add or save is not allowed in Settings → Permissions.');
    const agent = input.agentId ? this.deps.store.agent(input.agentId) : input.workflow === 'career_scout' ? { ...defaultPdfAgent(), workflow: 'career_scout' as const, name: 'Career Scout', instructions: 'Find published jobs using literal filters.', ...(input.career ? { career: input.career } : {}) } : input.workflow === 'inbox_briefing' ? { ...defaultPdfAgent(), workflow: 'inbox_briefing' as const, name: 'Inbox Briefing', instructions: 'Create a local extractive briefing of a bounded Gmail search.', ...(input.mail ? { mail: input.mail } : {}) } : defaultPdfAgent(input.workflow, input.targetBytes);
    if (!agent || agent.archived) return invalid('Choose an available agent.');
    if (input.agentId && ((input.workflow && input.workflow !== agent.workflow) || input.targetBytes !== undefined || input.mail || input.career)) return invalid('Saved helpers use their saved workflow and settings. Edit the helper or start a one-off run.');
    const inputs: RunInput[] = input.text?.trim() ? [{ name: `${input.title}.txt`, text: input.text }] : [];
    for (const id of input.fileIds ?? []) {
      const grant = this.grants.get(id); if (!grant || grant.expiresAt <= Date.now()) return invalid('Choose the files again; their access grant expired.');
      inputs.push({ ...grant.input });
    }
    if (inputs.length > backgroundLimits.files) return invalid('A run can convert at most eight inputs.');
    const issue = this.inputIssue(inputs, agent); if (issue) return invalid(issue);
    const isMail = agent.workflow === 'inbox_briefing';
    if (isMail && !this.deps.mail) return invalid('Mail accounts are unavailable.');
    let bound: BoundMailOptions;
    if (isMail && agent.mail) { try { bound = this.bindMail(agent.mail); } catch { return invalid('Choose an existing mail account.'); } }
    const at = Date.now(), run: RunRecord = { id: randomUUID(), requestId: input.requestId, inputHash, agent: structuredClone(agent), title: input.title, inputs, status: inputs.length ? 'queued' : 'waiting_user', revision: 1, generation: 1, createdAt: at, updatedAt: at, message: inputs.length ? 'Ready to process on this PC.' : agent.workflow === 'pdf_optimize' ? 'Choose plain PDFs to optimize without changing their text or images.' : 'Add text or choose text/image files to turn into PDFs.', completed: 0, attempts: 0, request: null, approvedBinding: null, artifacts: [], parentId: null };
    if (isMail) { run.mail = bound; run.status = bound ? 'queued' : 'waiting_user'; run.message = bound ? 'Ready to prepare a local Inbox Briefing.' : 'Choose a Gmail account and search in Agents.'; }
    if (agent.workflow === 'career_scout') { if (!this.deps.career) return invalid('Career Scout is unavailable.'); run.status = agent.career ? 'queued' : 'waiting_user'; run.message = 'Choose job boards and literal search filters.'; }
    if (run.status === 'waiting_user') run.request = { id: randomUUID(), kind: isMail ? 'mail_input' : agent.workflow === 'career_scout' ? 'career_input' : 'input', message: run.message, binding: this.binding(run), expiresAt: null };
    this.deps.store.insert(run, run.message, this.sources(inputs)); this.deps.changed(run.id); this.pump();
    return { ok: true, runId: run.id };
  }
  answer(value: unknown): BackgroundResult {
    const parsed = answerRunSchema.safeParse(value); if (!parsed.success) return invalid('The answer is invalid.');
    const answer = parsed.data, run = this.deps.store.get(answer.runId), request = run?.request;
    if (!run || run.revision !== answer.expectedRevision || run.status !== 'waiting_user' || !request || request.id !== answer.requestId) return invalid('This request changed. Refresh before answering.');
    if (request.binding !== this.binding(run)) return invalid('The requested action changed. Start a new run.');
    if ((answer.career && request.kind !== 'career_input') || (answer.applicant && request.kind !== 'application_input')) return invalid('Answer only the current request.');
    if (['approval', 'application_review', 'application_takeover'].includes(request.kind) && (answer.mail || answer.text || answer.fileIds?.length || answer.career || answer.applicant)) return invalid('Approval applies to the frozen inputs and destination only.');
    if (request.kind === 'career_input') {
      if (!answer.career || answer.text || answer.mail || answer.applicant || answer.fileIds?.length) return invalid('Choose job boards and filters.');
      this.change(run, { agent: { ...run.agent, career: answer.career }, status: 'queued', request: null, approvedBinding: null }, 'career_input', 'Job board settings selected.');
    } else if (request.kind === 'application_input') {
      if (!answer.applicant || answer.fileIds?.length !== 1 || answer.text || answer.mail || answer.career) return invalid('Choose one supported plain PDF resume and enter your contact details.');
      const grant = this.grants.get(answer.fileIds[0]); if (!grant || grant.expiresAt <= Date.now() || grant.input.kind !== 'pdf') return invalid('Choose a fresh supported PDF resume.');
      this.change(run, { inputs: [{ ...grant.input }], application: { ...run.application, applicant: answer.applicant, resume: {name:grant.input.name,bytes:grant.input.bytes,hash:grant.input.hash} }, status: 'queued', request: null, approvedBinding: null }, 'application_input', 'Resume and contact details frozen for review.', this.sources([grant.input]));
    } else if (request.kind === 'application_review') {
      if (answer.approved !== true) { this.deps.browser?.close(run.id); this.change(run, { status: 'cancelled', request: null }, 'denied', 'Application preparation was not approved.'); return { ok: true }; }
      if (request.expiresAt <= Date.now()) return invalid('This review expired. Open and review a fresh page.');
      this.change(run, { status: 'queued', request: null, approvedBinding: request.binding }, 'approved', 'Approved this role, page, contact details and frozen resume for preparation.');
    } else if (request.kind === 'application_takeover') {
      if (answer.approved !== false || run.application.mutation) return invalid('Check the browser for acknowledgement. An uncertain submission cannot be retried automatically.');
      this.deps.browser?.close(run.id); this.change(run, { status: 'succeeded', completed: 1, request: null }, 'prepared', 'Preparation finished. No application submission was verified.');
    } else if (request.kind === 'mail_input' || request.kind === 'mail_access') {
      if (answer.text || answer.fileIds?.length || (request.kind === 'mail_access' && (answer.mail || answer.approved !== true))) return invalid('Review this mail request using its selected account.');
      let mail: BoundMailOptions;
      try { mail = this.bindMail(request.kind === 'mail_input' ? answer.mail : run.mail); } catch { return invalid('Connect the selected Gmail account first.'); }
      if (this.deps.mail.account(mail.accountId).status !== 'connected' || (run.mail && (run.mail.accountId !== mail.accountId || run.mail.email !== mail.email))) return invalid('Reconnect the same account; this run cannot switch mailboxes.');
      this.change(run, { mail, status: 'queued', request: null, approvedBinding: null }, 'mail_review', 'Mail account and search selected; a fresh read approval is required.');
    } else if (request.kind === 'input') {
      if (answer.mail) return invalid('Mail settings do not apply to this run.');
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
      if (run.application) return invalid('Application runs are never replayed. Check for an existing application before starting from the shortlist again.');
      const at = Date.now(), retry: RunRecord = { ...structuredClone(run), id: randomUUID(), requestId: randomUUID(), inputHash: randomUUID(), status: run.inputs.length || run.mail || run.agent.career ? 'queued' : 'waiting_user', revision: 1, generation: 1, createdAt: at, updatedAt: at, completed: 0, attempts: 0, recoveryCount: 0, artifacts: [], briefing: undefined, shortlist: undefined, schedule: undefined, fingerprint: undefined, unchanged: undefined, delegation: undefined, approvedBinding: null, parentId: run.id, request: null, message: run.agent.workflow === 'inbox_briefing' ? 'New briefing queued; mail will be fetched again after approval.' : 'Retry queued with the original input snapshot.' };
      if (retry.status === 'waiting_user') retry.request = { id: randomUUID(), kind: retry.agent.workflow === 'inbox_briefing' ? 'mail_input' : 'input', message: 'Add input for this run.', binding: this.binding(retry), expiresAt: null };
      if (this.deps.store.active().length >= 50) return invalid('Finish queued work before retrying.');
      this.deps.store.insert(retry, retry.message); this.deps.changed(retry.id); this.pump(); return { ok: true, runId: retry.id };
    }
    if (finishedRun(run.status)) return invalid('This run has already finished.');
    if (action === 'resume') {
      if (run.status !== 'paused') return invalid('This run is not paused.');
      this.change(run, { status: run.request ? 'waiting_user' : 'queued' }, 'resumed', 'Resumed from the saved checkpoint.');
    } else {
      this.deps.browser?.close(run.id);
      this.change(run, { status: action === 'cancel' ? 'cancelled' : 'paused', generation: run.generation + 1, ...(action === 'cancel' ? { request: null } : {}) }, action, action === 'cancel' ? 'Cancelled; no further outputs will be published.' : 'Paused at the current checkpoint.');
      this.active.get(runId)?.controller.abort();
    }
    this.pump(); return { ok: true };
  }
  setPaused(paused: boolean, source = 'kite') {
    if (paused) this.blocked.add(source); else this.blocked.delete(source);
    if (paused) this.deps.browser?.closeAll();
    if (paused) for (const [id, active] of this.active) {
      const run = this.deps.store.get(id);
      if (run && ['running', 'verifying'].includes(run.status)) this.change(run, { status: 'queued', generation: run.generation + 1 }, 'suspended', 'Kite paused; work is saved for later.');
      active.controller.abort();
    }
    this.deps.changed(); if (!paused) this.tickSchedules(); this.pump();
  }
  private inputIssue(inputs: RunInput[], agent: BackgroundAgent) {
    if (agent.workflow === 'career_scout') return inputs.length ? 'Career Scout uses job boards and filters, not document inputs.' : null;
    if (agent.workflow === 'inbox_briefing') return inputs.length ? 'Inbox Briefing reads the selected account; it does not accept pasted text or file inputs.' : null;
    if (inputs.reduce((n, i) => n + (i.bytes ?? Buffer.byteLength(i.text ?? '')), 0) > backgroundLimits.batchBytes) return 'A run can process at most 16 MB of input.';
    if (agent.workflow === 'pdf_optimize' && inputs.some(i => i.kind !== 'pdf')) return 'PDF optimization accepts only plain .pdf files; choose Convert to PDF for text or images.';
    if (agent.workflow !== 'pdf_optimize' && inputs.some(i => i.kind === 'pdf')) return 'Choose Optimize PDF to reduce a PDF; conversion accepts text or images.';
    if (agent.workflow === 'text_pdf' && inputs.some(i => i.kind && i.kind !== 'text')) return 'This saved helper accepts text only. Choose Document Helper for images.';
    return null;
  }
  private sources(inputs: RunInput[]): FrozenSource[] { return inputs.flatMap(input => input.sourceId ? [{ id: input.sourceId, bytes: this.grants.get(input.sourceId).binary }] : []); }
  private binding(run: RunRecord) { return hashOf(JSON.stringify({ id: run.id, revision: run.agent.revision, style: run.agent.style, inputs: run.inputs, ...(run.agent.workflow !== 'text_pdf' ? { workflow: run.agent.workflow, targetBytes: run.agent.targetBytes, ...(run.mail ? { mail: run.mail } : {}), ...(run.agent.career ? { career: run.agent.career } : {}), ...(run.application ? { job: run.application.job, applicant: run.application.applicant, page: run.application.observation?.fingerprint } : {}) } : {}) })); }
  private bindMail(options: MailOptions) { const account = options && this.deps.mail?.account(options.accountId); if (!account) throw new MailFailure('access'); return { ...options, email: account.email, accountRevision: account.revision }; }
  mailChanged(id: string) {
    if (this.stopping) return;
    for (const run of this.deps.store.active()) if (run.mail?.accountId === id) {
      const account = this.deps.mail?.account(id);
      if (!account || account.status !== 'connected' || account.revision !== run.mail.accountRevision) this.parkMail(run, 'Gmail access changed. Reconnect the same account, then review and resume.');
    }
  }
  private parkMail(run: RunRecord, message: string) {
    const next = this.change(run, { status: run.status === 'paused' ? 'paused' : 'waiting_user', generation: run.generation + 1, approvedBinding: null, request: { id: randomUUID(), kind: 'mail_access', message, binding: this.binding(run), expiresAt: null } }, 'mail_access', message);
    this.active.get(next.id)?.controller.abort(); return next;
  }
  private canReadMail() { return resolve({ category: 'look', reason: '' }, this.settings().permissions, { place: 'mail.google.com' }).permission !== 'never'; }
  private permission() { return resolve({ category: 'add', reason: '' }, this.settings().permissions, { place: 'app:kite-pdf' }).permission; }
  private change(run: RunRecord, patch: Partial<RunRecord>, type: string, message: string, sources: FrozenSource[] = []) {
    const next = { ...run, ...patch, revision: run.revision + 1, updatedAt: Date.now(), message };
    const s = next.schedule ? this.deps.store.schedule(next.schedule.id) : null;
    const terminal = finishedRun(next.status) && !finishedRun(run.status);
    const schedule = terminal && s && s.consentId === next.schedule?.consentId ? { ...s, revision: s.revision + 1, ...(next.status === 'succeeded' && next.fingerprint ? { lastFingerprint: next.fingerprint } : {}), ...(next.status === 'failed' ? { state: 'blocked' as const, message: 'A check failed. Review its run and renew recurring access before further checks.' } : {}) } : undefined;
    this.deps.store.saveWithSchedule(next, run.revision, type, message, schedule, s?.revision, sources); this.deps.changed(next.id);
    if (!next.unchanged && (next.status !== run.status || (next.status === 'waiting_user' && next.request?.kind !== run.request?.kind)) && (next.status === 'waiting_user' || finishedRun(next.status)) && next.status !== 'cancelled') this.deps.notice?.(publicRun(next));
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
      if (!this.recurringAllowed(run)) { this.change(run, { status: 'failed' }, 'schedule_access', 'Recurring access changed. Review this schedule and renew access; no new read was made.'); return; }
      if (this.settings().dryRun || this.permission() === 'never') { this.change(run, { status: 'failed' }, 'blocked', 'Settings do not allow saving this PDF.'); return; }
      if (run.agent.workflow === 'career_scout' || run.agent.workflow === 'job_application') { await this.executeCareerRun(run, signal, current); return; }
      const isMail = run.agent.workflow === 'inbox_briefing';
      if (isMail) {
        if (!this.canReadMail()) { this.change(run, { status: 'failed' }, 'blocked', 'Settings do not allow reading Gmail.'); return; }
        const account = run.mail && this.deps.mail?.account(run.mail.accountId);
        if (!account || account.status !== 'connected' || account.revision !== run.mail.accountRevision || account.email !== run.mail.email) { this.parkMail(run, 'Reconnect the selected Gmail account, then review and resume this briefing.'); return; }
      }
      if ((isMail || this.permission() === 'ask') && run.approvedBinding !== this.binding(run)) {
        const message = isMail ? `Read up to ${run.mail.maxMessages} messages from ${run.mail.email} matching “${run.mail.query}” and save a local briefing${run.mail.includeAttachments ? ', plus up to 8 supported attachments (5 MB each, 16 MB total)' : ''}? No message changes or external model sharing.` : run.agent.workflow === 'pdf_optimize' ? `Optimize ${run.inputs.length} PDF${run.inputs.length === 1 ? '' : 's'} losslessly and save new copies${run.agent.targetBytes ? `, aiming for at most ${run.agent.targetBytes} bytes each` : ''}?` : `Save ${run.inputs.length} PDF${run.inputs.length === 1 ? '' : 's'} from these inputs in Kite, using ${run.agent.style} layout for text?`;
        this.change(run, { status: 'waiting_user', request: { id: randomUUID(), kind: 'approval', binding: this.binding(run), message, expiresAt: Date.now() + 24 * 60 * 60_000 } }, 'approval', message); return;
      }
      if ((run.recoveryCount ?? 0) >= backgroundLimits.attempts) { this.change(run, { status: 'failed' }, 'budget', 'Recovery limit reached. Retry to start a new run.'); return; }
      run = this.change(run, { status: 'running', attempts: run.attempts + 1 }, 'started', isMail ? 'Reading the approved Gmail search. Extracts stay on this PC; no model calls.' : 'Processing on this PC; document contents stay local.');
      timeout = setTimeout(() => {
        if (!current()) return;
        const latest = this.deps.store.get(id); this.change(latest, { status: 'failed', generation: latest.generation + 1 }, 'timeout', 'Conversion exceeded its two-minute limit.'); this.active.get(id)?.controller.abort();
      }, backgroundLimits.wallMs);
      if (isMail) { await this.executeMail(run, signal, current); return; }
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
      if (run.application) this.deps.browser?.close(id);
      if (current() && error instanceof MailFailure && ['access', 'account', 'rate', 'network'].includes(error.code)) { this.parkMail(this.deps.store.get(id), error.message); return; }
      if (current()) this.change(this.deps.store.get(id), { status: 'failed' }, 'failed', error instanceof DocumentFailure || error instanceof MailFailure || error instanceof CareerFailure ? error.message : error instanceof Error && error.message.startsWith('Permissions changed') ? error.message : 'Processing could not finish. Your inputs and checked outputs are saved; you can retry.');
    } finally { clearTimeout(timeout); }
  }
  private async executeMail(run: RunRecord, signal: AbortSignal, current: () => boolean) {
    const check = () => {
      if (!current()) throw aborted();
      const account = this.deps.mail.account(run.mail.accountId);
      if (!account || account.status !== 'connected' || account.revision !== run.mail.accountRevision || account.email !== run.mail.email) throw new MailFailure('access');
      if (!this.recurringAllowed(run) || this.settings().dryRun || this.permission() === 'never' || !this.canReadMail() || run.approvedBinding !== this.binding(run)) throw new Error('Permissions changed before the briefing could be saved.');
    };
    check();
    if (!run.briefing) {
      const briefing = await this.deps.mail.brief(run.mail, signal); check();
      if (briefing.accountId !== run.mail.accountId || briefing.email !== run.mail.email || briefing.query !== run.mail.query) throw new MailFailure('account');
      run = this.change(this.deps.store.get(run.id), { briefing }, 'mail_snapshot', 'Bounded mail snapshot saved locally.');
    }
    if (this.quietResult(run, run.briefing)) return;
    const brief = run.briefing, outputs = [{ name: 'Inbox Briefing.pdf', mediaType: 'application/pdf' as const }, ...brief.selectedAttachments.map(a => ({ name: a.filename, mediaType: 'application/octet-stream' as const }))];
    const inputHash = hashOf(JSON.stringify(brief));
    for (let index = run.completed; index < outputs.length; index++) {
      check(); const attachment = index > 0, outputInfo = outputs[index], operationId = `${run.id}:mail:${index}`;
      let op: OperationRecord = this.deps.store.operation(operationId) ?? { id: operationId, runId: run.id, generation: run.generation, index, inputHash, style: run.agent.style, mediaType: outputInfo.mediaType, state: 'intent' };
      if (op.inputHash !== inputHash || op.mediaType !== outputInfo.mediaType) throw new MailFailure('invalid');
      let output = op.state !== 'intent' ? await safeArtifact(this.deps.root, run.id, index, op.pages, attachment) : null;
      if (output && (output.hash !== op.hash || output.bytes !== op.bytes)) throw new MailFailure('invalid');
      if (!output) {
        op = { ...op, generation: run.generation, state: 'intent' }; this.deps.store.saveOperation(op);
        const result = attachment ? await this.deps.mail.attachment(run.mail, brief.selectedAttachments[index - 1], signal) : await this.deps.convert({ name: 'Inbox Briefing', text: briefingText(brief), kind: 'text' }, run.agent.style, signal, run.agent);
        const bytes = result instanceof Uint8Array ? result : result.bytes; check();
        const checked = attachment ? inspectAttachment(bytes) : inspectPdf(bytes, result instanceof Uint8Array ? undefined : result.pages);
        op = { ...op, ...checked, state: 'prepared' }; this.deps.store.saveOperation(op); check();
        await publishPdf(this.deps.root, run.id, index, run.generation, bytes, current, attachment); output = { filename: '', ...checked };
      }
      check(); const latest = this.deps.store.get(run.id);
      const artifact: BackgroundArtifact = { id: `${run.id}:${index}`, ...outputInfo, bytes: output.bytes, hash: output.hash, ...(!attachment ? { pages: op.pages } : {}) };
      run = { ...latest, status: 'verifying', completed: index + 1, artifacts: [...latest.artifacts.filter(a => a.id !== artifact.id), artifact], revision: latest.revision + 1, updatedAt: Date.now(), message: `Checked ${index + 1} of ${outputs.length} local outputs.` };
      this.deps.store.commitOutput(run, latest.revision, op); this.deps.changed(run.id);
    }
    check(); this.change(this.deps.store.get(run.id), { status: 'succeeded', request: null }, 'completed', `Saved a local briefing of ${brief.messages.length} messages and ${brief.selectedAttachments.length} attachments. ${brief.skippedAttachments} attachments skipped${brief.moreMatches ? '; more search matches exist' : ''}.`);
  }
  private quietResult(run: RunRecord, result: Parameters<typeof resultFingerprint>[0]) {
    if (!run.schedule) return false;
    const fingerprint = resultFingerprint(result), s = this.deps.store.schedule(run.schedule.id);
    if (!this.recurringAllowed(run)) throw new Error('Permissions changed before the scheduled result could be saved.');
    const unchanged = s.lastFingerprint === fingerprint;
    const latest = this.deps.store.get(run.id);
    this.change(latest, { fingerprint, ...(unchanged ? { status: 'succeeded' as const, unchanged: true, completed: 0, request: null } : {}) }, unchanged ? 'unchanged' : 'result_changed', unchanged ? 'No changes since the previous successful check. No new files or notification.' : 'New or changed result; preparing local output.');
    return unchanged;
  }
  private canReadCareer(run: RunRecord) {
    const sites = run.application ? [new URL(run.application.job.url).hostname] : run.agent.career.boards.map(b => b.provider === 'greenhouse' ? 'boards-api.greenhouse.io' : `api.${b.region === 'eu' ? 'eu.' : ''}lever.co`);
    return sites.every(place => resolve({ category: 'look', reason: '' }, this.settings().permissions, { place }).permission !== 'never');
  }
  private canPrepareApplication(run: RunRecord) { return !this.settings().dryRun && this.permission() !== 'never' && this.canReadCareer(run) && resolve({ category: 'send', reason: '' }, this.settings().permissions, { place: new URL(run.application.job.url).hostname }).permission !== 'never'; }
  private applicationRequest(run: RunRecord, message: string, kind: 'application_review' | 'application_takeover') {
    return this.change(run, { status: 'waiting_user', request: { id: randomUUID(), kind, message, binding: this.binding(run), expiresAt: kind === 'application_review' ? Date.now() + 30 * 60_000 : null } }, kind, message);
  }
  scoutMailBriefing(sourceId: string, revision: number): BackgroundResult {
    const source = this.deps.store.get(sourceId); if (!source?.briefing || source.revision !== revision || source.status !== 'succeeded') return invalid('Choose a current completed Inbox Briefing.');
    const boards = boardsFromAlerts(source.briefing.messages.map(m=>m.excerpt).join('\n'));
    if (!boards.length) return invalid('No direct Greenhouse/Lever job URLs were found in these saved excerpts. Tracking links and arbitrary sites are not followed.');
    const result = this.enqueue({requestId:randomUUID(),title:'Jobs from Inbox Briefing',workflow:'career_scout',career:{boards,keywords:'',location:'',maxJobs:10}});
    if (result.ok) this.change(this.deps.store.get(result.runId), {parentId:sourceId}, 'alert_source', 'Job board tokens extracted from a saved Inbox Briefing. Review the boards before discovery; no new mailbox read.');
    return result;
  }
  createApplication(sourceId: string, revision: number, jobKey: string): BackgroundResult {
    if (this.stopping || !this.deps.browser || this.settings().dryRun || this.permission() === 'never') return invalid('Application preparation is unavailable or blocked by settings.');
    const source = this.deps.store.get(sourceId), job = source?.shortlist?.jobs.find(j => j.key === jobKey);
    if (!source || source.revision !== revision || source.status !== 'succeeded' || !job) return invalid('Choose a current saved shortlist job.');
    if (this.deps.store.active().length >= 50) return invalid('Finish queued work before preparing another application.');
    const duplicate = this.deps.store.active().find(r => r.application?.job.key === job.key);
    if (this.deps.store.operation(`application:${hashOf(job.key)}`)) return invalid('This role has a recorded potential submission. Check employer confirmation before any new application.');
    if (duplicate) return invalid('This role already has a pending or potentially submitted application. Check that run first.');
    const at = Date.now(), run: RunRecord = { id: randomUUID(), requestId: randomUUID(), inputHash: hashOf(job.key), agent: { ...defaultPdfAgent(), workflow: 'job_application', name: 'Application preparation' }, title: job.title.slice(0,120), inputs: [], status: 'waiting_user', revision: 1, generation: 1, createdAt: at, updatedAt: at, message: 'Choose a PDF resume and your exact contact details.', completed: 0, attempts: 0, request: null, approvedBinding: null, artifacts: [], parentId: sourceId, application: { job: structuredClone(job) } };
    run.request = { id: randomUUID(), kind: 'application_input', message: run.message, binding: this.binding(run), expiresAt: null };
    this.deps.store.insert(run, run.message); this.deps.changed(run.id); return { ok: true, runId: run.id };
  }
  applicationMutation(id: string, destination: string) {
    const run = this.deps.store.get(id); if (this.stopping || this.paused || !run?.application?.preparedAt || run.status !== 'waiting_user' || run.request?.kind !== 'application_takeover' || !this.canPrepareApplication(run)) return false;
    if (!run.application.mutation) {
      this.deps.store.saveOperation({ id: `application:${hashOf(run.application.job.key)}`, runId: run.id, generation: run.generation, index: 0, inputHash: this.binding(run), style: run.agent.style, state: 'intent' });
      this.change(run, { application: { ...run.application, mutation: { at: Date.now(), destination }, outcome: 'uncertain' } }, 'external_intent', 'The handed-off browser attempted an external write. Outcome is uncertain until a fresh acknowledgement is observed.');
    }
    return true;
  }
  private browserBusy = new Set<string>();
  async applicationBrowserAction(id: string, revision: number, action: 'open' | 'check'): Promise<BackgroundResult> {
    let run = this.deps.store.get(id); if (this.browserBusy.has(id) || this.stopping || this.paused || !run?.application || run.revision !== revision || run.status !== 'waiting_user' || !['application_review', 'application_takeover'].includes(run.request?.kind) || !this.canPrepareApplication(run)) return invalid('This application changed or settings block browser access.');
    this.browserBusy.add(id); const generation = run.generation, requestId = run.request.id;
    const current = () => { const latest = this.deps.store.get(id); return !this.stopping && !this.paused && latest?.generation === generation && latest.status === 'waiting_user' && latest.request?.id === requestId; };
    try {
      const browser = this.deps.browser;
      if (!browser.has(id)) {
        if (run.application.mutation) return invalid('Submission outcome is uncertain. Check your email or the employer portal; Kite will not reopen or replay this application.');
        const observed = await browser.load(id, run.application.job, new AbortController().signal); if (!current()) { browser.close(id); return invalid('This application was stopped.'); }
        run = this.change(this.deps.store.get(id), { application: { ...run.application, observation: observed, preparedAt: undefined, outcome: undefined }, approvedBinding: null }, 'fresh_page', 'The browser restarted; personal-input approval must be renewed.');
        run = this.applicationRequest(run, 'Review the fresh page before sharing your contact details and frozen resume.', 'application_review');
        if (action === 'check') return { ok: true };
      }
      if (action === 'open') { browser.show(id, !!run.application.preparedAt); return { ok: true }; }
      browser.hide(id); const observed = await browser.observe(id); if (!current()) return invalid('This application changed.'); run = this.deps.store.get(id);
      if (run.application.mutation) {
        if (!observed.receipt) return invalid('No acknowledgement was observed. Check the employer portal or email before any new application.');
        this.change(run, { application: { ...run.application, outcome: 'acknowledged', receipt: { at: Date.now(), url: observed.url, title: observed.title } }, status: 'succeeded', completed: 1, request: null }, 'acknowledgement', 'Observed an acknowledgement in the handed-off browser. This is page evidence, not independent employer confirmation.'); browser.close(id); return { ok: true };
      }
      run = this.change(run, { application: { ...run.application, observation: observed, preparedAt: undefined, outcome: undefined }, approvedBinding: null }, 'page_review', 'Current page captured for a fresh review.');
      this.applicationRequest(run, 'Review this current page, exact contact details and frozen resume before preparation.', 'application_review'); return { ok: true };
    } catch (error) { return invalid(error instanceof CareerFailure ? error.message : 'The application browser could not finish. Review the saved run before continuing.'); }
    finally { this.browserBusy.delete(id); }
  }
  private async executeCareerRun(run: RunRecord, signal: AbortSignal, current: () => boolean) {
    if (!this.canReadCareer(run)) { this.change(run, { status: 'failed' }, 'blocked', 'Settings block these job boards.'); return; }
    if (!run.application && run.approvedBinding !== this.binding(run)) {
      const message = `Read published jobs from ${run.agent.career.boards.map(b => `${b.provider}/${b.board}`).join(', ')} and save up to ${run.agent.career.maxJobs} literal matches? No resume or contact details will be shared.`;
      this.change(run, { status: 'waiting_user', request: { id: randomUUID(), kind: 'approval', message, binding: this.binding(run), expiresAt: Date.now()+24*60*60_000 } }, 'approval', message); return;
    }
    run = this.change(run, { status: 'running', attempts: run.attempts+1 }, 'started', run.application ? 'Checking the owned application browser.' : 'Reading published jobs using the approved literal filters.');
    const careerDeadline = run.delegation?.deadline ?? Date.now() + backgroundLimits.wallMs;
    const timer = setTimeout(() => { if (current()) { const latest = this.deps.store.get(run.id); this.change(latest, { status: 'failed', generation: latest.generation+1 }, 'timeout', 'Career work exceeded its two-minute limit.'); this.active.get(run.id)?.controller.abort(); this.deps.browser?.close(run.id); } }, Math.max(1, careerDeadline - Date.now()));
    try {
      if (Date.now() >= careerDeadline) throw new CareerFailure('The shared discovery deadline is exhausted. Start a new reviewed run.');
      if (run.application) {
        if (run.application.mutation || this.deps.store.operation(`application:${hashOf(run.application.job.key)}`)) { this.applicationRequest(run, 'Submission outcome is uncertain. Check employer confirmation; this application will never be replayed.', 'application_takeover'); return; }
        if (!this.canPrepareApplication(run)) throw new CareerFailure('Settings do not allow sharing application details.');
        const browser = this.deps.browser, existing = browser.has(run.id), observed = existing ? await browser.observe(run.id) : await browser.load(run.id, run.application.job, signal);
        if (!current()) throw aborted();
        const oldFingerprint = run.application.observation?.fingerprint;
        if (!existing || oldFingerprint !== observed.fingerprint || run.approvedBinding !== this.binding(run)) {
          run = this.change(run, { application: { ...run.application, observation: observed }, approvedBinding: null }, 'page_snapshot', 'Current application page captured.');
          this.applicationRequest(run, observed.supported ? 'Approve sharing these exact contact details and this frozen PDF resume with the selected application page. Other required answers and submission need your review.' : 'This page needs manual preparation or login/CAPTCHA. Approve manual handoff for this role; Kite will not fill unsupported fields.', 'application_review'); return;
        }
        if (observed.supported) {
          const input = run.inputs[0], bytes = this.deps.store.source(input.sourceId); if (!bytes || hashOf(bytes) !== input.hash) throw new CareerFailure('The frozen resume is unavailable or changed.');
          await browser.prepare(run.id, observed, run.application.applicant, bytes, input.name, signal); if (!current() || !this.canPrepareApplication(run)) throw aborted();
        }
        run = this.change(run, { application: { ...run.application, preparedAt: Date.now(), outcome: 'prepared' } }, 'prepared', observed.supported ? 'Contact fields and resume staged. Review all remaining fields in the browser; Kite has not submitted.' : 'Manual handoff approved. This page was not filled automatically.');
        this.applicationRequest(run, 'Open the application browser to review, sign in, handle CAPTCHA and submit yourself. Check acknowledgement afterward. Any attempted external write is recorded as uncertain until checked.', 'application_takeover'); return;
      }
      if (!run.shortlist) {
        const budget = run.delegation ?? { maxChildren: run.agent.career.boards.length, concurrency: 2, maxBytes: 32 * 1024 * 1024, bytes: 0, deadline: careerDeadline, modelCalls: 0 as const, children: [] };
        run = this.change(run, { delegation: budget }, 'delegation', 'Board reads share one deadline and byte budget; at most two children work at once.');
        const check = () => { if (!current() || Date.now() >= careerDeadline || !this.recurringAllowed(run) || !this.canReadCareer(run) || this.permission() === 'never' || this.settings().dryRun) throw new Error('Permissions changed before board discovery could finish.'); };
        const shortlist = await this.deps.career.discover(run.agent.career, signal, { budget, check, progress: next => { check(); this.change(this.deps.store.get(run.id), { delegation: next }, 'child_progress', 'Bounded board task checkpoint saved.'); } });
        check(); run = this.change(this.deps.store.get(run.id), { shortlist }, 'shortlist', 'Bounded shortlist saved locally.');
      }
      if (Date.now() >= careerDeadline) throw new CareerFailure('The shared discovery deadline is exhausted. Start a new reviewed run.');
      if (this.quietResult(run, run.shortlist)) return;
      const text = shortlistText(run.shortlist), inputHash = hashOf(text), opId = `${run.id}:career:0`;
      let op: OperationRecord = this.deps.store.operation(opId) ?? { id: opId, runId: run.id, generation: run.generation, index: 0, inputHash, style: run.agent.style, state: 'intent' };
      if (op.inputHash !== inputHash) throw new CareerFailure('Shortlist recovery content changed.');
      let output = op.state !== 'intent' ? await safeArtifact(this.deps.root, run.id, 0, op.pages) : null;
      if (output && output.hash !== op.hash) throw new CareerFailure('The saved shortlist changed.');
      if (!output) {
        this.deps.store.saveOperation(op); const result = await this.deps.convert({ name: 'Career shortlist', text, kind: 'text' }, run.agent.style, signal, run.agent); const bytes = result instanceof Uint8Array ? result : result.bytes;
        if (!current() || Date.now() >= careerDeadline || !this.recurringAllowed(run) || this.permission() === 'never' || !this.canReadCareer(run) || this.settings().dryRun) throw aborted();
        const checked = inspectPdf(bytes, result instanceof Uint8Array ? undefined : result.pages); op = { ...op, ...checked, state: 'prepared' }; this.deps.store.saveOperation(op); await publishPdf(this.deps.root, run.id, 0, run.generation, bytes, current); output = { filename: '', ...checked };
      }
      if (!current() || Date.now() >= careerDeadline || !this.recurringAllowed(run) || !this.canReadCareer(run) || this.permission() === 'never' || this.settings().dryRun) throw new Error('Permissions changed before the shortlist could be saved.'); const latest = this.deps.store.get(run.id), artifact: BackgroundArtifact = { id: `${run.id}:0`, name: 'Career shortlist.pdf', mediaType: 'application/pdf', hash: output.hash, bytes: output.bytes, pages: op.pages };
      run = { ...latest, status: 'verifying', completed: 1, artifacts: [artifact], revision: latest.revision+1, updatedAt: Date.now(), message: 'Shortlist PDF checked.' }; this.deps.store.commitOutput(run, latest.revision, op); this.deps.changed(run.id);
      this.change(run, { status: 'succeeded', request: null }, 'completed', `Saved ${run.shortlist.jobs.length} matching jobs and a checked shortlist PDF. No applications were submitted.`);
    } finally { clearTimeout(timer); }
  }
  async artifactPath(runId: string, artifactId: string) {
    const run = this.deps.store.get(runId), index = run?.artifacts.findIndex(a => a.id === artifactId);
    if (!run || index === undefined || index < 0) return null;
    const recorded = run.artifacts[index], result = await safeArtifact(this.deps.root, runId, Number(artifactId.split(':').at(-1)), recorded.pages, recorded.mediaType === 'application/octet-stream');
    return result?.hash === recorded.hash ? result.filename : null;
  }
  async artifactBytes(runId: string, artifactId: string) {
    const recorded = this.deps.store.get(runId)?.artifacts.find(a => a.id === artifactId);
    const filename = await this.artifactPath(runId, artifactId); if (!filename || !recorded) return null;
    try { const bytes = await readFile(filename); return hashOf(bytes) === recorded.hash ? bytes : null; } catch { return null; }
  }
  async shutdown() {
    clearInterval(this.scheduleTimer); this.stopping = true; this.setPaused(true, 'shutdown');
    this.deps.browser?.closeAll();
    await Promise.allSettled([...this.active.values()].map(a => a.promise)); this.grants.clear();
  }
}
