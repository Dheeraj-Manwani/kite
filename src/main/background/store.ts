import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { SecretCipher } from '../settings/secretsCore';
import type { BoundMailOptions, InboxBriefing } from '../../shared/mail';
import type { CareerShortlist, JobApplication } from '../../shared/career';
import type { AgentSchedule, ScheduledOccurrence, DelegationBudget, ScheduleHistory } from '../../shared/schedules';
import type { BackgroundAgent, BackgroundArtifact, BackgroundEvent, BackgroundRun, BackgroundRequest, DocumentKind, DocumentWorkflow, OptimizationReport, PdfStyle, RunStatus } from '../../shared/background';

export interface RunInput { name: string; text?: string; kind?: DocumentKind; sourceId?: string; hash?: string; bytes?: number }
export interface FrozenSource { id: string; bytes: Uint8Array }
export interface RunRecord {
  id: string; requestId: string; inputHash: string; agent: BackgroundAgent; title: string; inputs: RunInput[];
  status: RunStatus; revision: number; generation: number; createdAt: number; updatedAt: number;
  message: string; completed: number; attempts: number; recoveryCount?: number; request: BackgroundRequest | null;
  approvedBinding: string | null; artifacts: BackgroundArtifact[]; parentId: string | null;
  mail?: BoundMailOptions; briefing?: InboxBriefing;
  shortlist?: CareerShortlist; application?: JobApplication;
  schedule?: ScheduledOccurrence; fingerprint?: string; unchanged?: boolean; delegation?: DelegationBudget;
}
export interface ScheduleRecord extends AgentSchedule { agent: BackgroundAgent; mail?: BoundMailOptions; consentId: string; policyHash: string; draftHash: string; lastFingerprint?: string }
export const publicSchedule = (s: ScheduleRecord): AgentSchedule => ({ id: s.id, revision: s.revision, agentId: s.agentId, agentName: s.agentName, agentRevision: s.agentRevision, recurrence: s.recurrence, state: s.state, nextAt: s.nextAt, createdAt: s.createdAt, lastRunId: s.lastRunId, message: s.message, ...(s.mail ? { mail: s.mail } : {}), ...(s.agent.career ? { career: s.agent.career } : {}) });
export interface OperationRecord { id: string; runId: string; generation: number; index: number; inputHash: string; style: PdfStyle; state: 'intent' | 'prepared' | 'committed'; hash?: string; bytes?: number; pages?: number; optimization?: OptimizationReport; mediaType?: BackgroundArtifact['mediaType'] }
export const publicRun = (r: RunRecord): BackgroundRun => ({ id: r.id, agentId: r.agent.id === 'builtin' ? null : r.agent.id, agentName: r.agent.name, agentRevision: r.agent.revision, workflow: r.agent.workflow, targetBytes: r.agent.targetBytes, ...(r.mail ? { mail: r.mail } : {}), title: r.title, status: r.status, revision: r.revision, generation: r.generation, createdAt: r.createdAt, updatedAt: r.updatedAt, message: r.message, inputs: r.inputs.map(i => i.name), completed: r.completed, total: ['career_scout','job_application'].includes(r.agent.workflow) ? 1 : r.agent.workflow === 'inbox_briefing' ? 1 + (r.briefing?.selectedAttachments.length ?? 0) : r.inputs.length, attempts: r.attempts, request: r.request, artifacts: r.artifacts, modelCalls: 0, parentId: r.parentId, ...(r.schedule ? { schedule: r.schedule } : {}), ...(r.unchanged ? { unchanged: true } : {}), ...(r.delegation ? { delegation: r.delegation } : {}) });

/** Separate from voice history: deleting a conversation cannot delete an active run. Payloads use OS encryption. */
export class BackgroundStore {
  private db: Database.Database;
  constructor(filename: string, private cipher: SecretCipher) {
    if (!cipher.isEncryptionAvailable()) throw new Error('Background agents need OS encryption to save their work.');
    this.db = new Database(filename);
    this.db.pragma('journal_mode = WAL'); this.db.pragma('foreign_keys = ON'); this.db.pragma('secure_delete = ON'); this.db.pragma('busy_timeout = 5000');
    const version = this.db.pragma('user_version', { simple: true }) as number;
    if (version > 3) { this.db.close(); throw new Error('Background database needs a newer Kite version.'); }
    if (version === 0) this.db.transaction(() => {
      this.db.exec(`CREATE TABLE agent_definitions (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, archived INTEGER NOT NULL, payload BLOB NOT NULL);
        CREATE TABLE agent_revisions (id TEXT NOT NULL, revision INTEGER NOT NULL, payload BLOB NOT NULL, PRIMARY KEY(id,revision));
        CREATE TABLE agent_runs (id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, status TEXT NOT NULL, revision INTEGER NOT NULL, created_at INTEGER NOT NULL, payload BLOB NOT NULL);
        CREATE TABLE agent_events (run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE, sequence INTEGER NOT NULL, at INTEGER NOT NULL, payload BLOB NOT NULL, PRIMARY KEY(run_id,sequence));
        CREATE TABLE agent_operations (id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE, payload BLOB NOT NULL);
        CREATE INDEX runs_status ON agent_runs(status,created_at);`);
      this.db.pragma('user_version = 1');
    })();
    if (version < 2) this.db.transaction(() => {
      this.db.exec('CREATE TABLE agent_sources (id TEXT PRIMARY KEY, payload BLOB NOT NULL)');
      this.db.pragma('user_version = 2');
    })();
    if (version < 3) this.db.transaction(() => {
      this.db.exec(`CREATE TABLE agent_schedules (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, payload BLOB NOT NULL);
        CREATE TABLE agent_dispatches (schedule_id TEXT NOT NULL REFERENCES agent_schedules(id), occurrence INTEGER NOT NULL, run_id TEXT NOT NULL UNIQUE REFERENCES agent_runs(id), PRIMARY KEY(schedule_id,occurrence));
        CREATE INDEX dispatch_history ON agent_dispatches(schedule_id,run_id);`);
      this.db.pragma('user_version = 3');
    })();
  }
  private encode(value: unknown) { return this.cipher.encryptString(JSON.stringify(value)); }
  private decode<T>(row: unknown): T | null { return row ? JSON.parse(this.cipher.decryptString((row as { payload: Buffer }).payload)) as T : null; }
  agents() { return this.db.prepare('SELECT payload FROM agent_definitions WHERE archived=0 ORDER BY rowid').all().map(r => this.decode<BackgroundAgent>(r)); }
  agent(id: string) { return this.decode<BackgroundAgent>(this.db.prepare('SELECT payload FROM agent_definitions WHERE id=?').get(id)); }
  saveAgent(agent: BackgroundAgent, expected?: number) {
    this.db.transaction(() => {
      const previous = this.agent(agent.id);
      if (previous && previous.revision !== expected) throw new Error('This agent changed. Refresh it before saving.');
      if (!previous && expected !== undefined) throw new Error('This agent no longer exists.');
      this.db.prepare('INSERT INTO agent_revisions VALUES(?,?,?)').run(agent.id, agent.revision, this.encode(agent));
      this.db.prepare(`INSERT INTO agent_definitions VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,archived=excluded.archived,payload=excluded.payload`).run(agent.id, agent.revision, Number(agent.archived), this.encode(agent));
    })();
  }
  get(id: string) { return this.decode<RunRecord>(this.db.prepare('SELECT payload FROM agent_runs WHERE id=?').get(id)); }
  byRequest(id: string) { return this.decode<RunRecord>(this.db.prepare('SELECT payload FROM agent_runs WHERE request_id=?').get(id)); }
  runs() { return this.db.prepare("SELECT payload FROM agent_runs ORDER BY CASE WHEN status IN ('queued','running','verifying','waiting_user','paused') THEN 0 ELSE 1 END, created_at DESC LIMIT 200").all().map(r => this.decode<RunRecord>(r)); }
  active() { return this.db.prepare("SELECT payload FROM agent_runs WHERE status IN ('queued','running','verifying','waiting_user','paused') ORDER BY created_at").all().map(r => this.decode<RunRecord>(r)); }
  private saveSources(sources: FrozenSource[]) { for (const source of sources) this.db.prepare('INSERT OR IGNORE INTO agent_sources VALUES(?,?)').run(source.id, this.encode(Buffer.from(source.bytes).toString('base64'))); }
  source(id: string): Uint8Array | null { const encoded = this.decode<string>(this.db.prepare('SELECT payload FROM agent_sources WHERE id=?').get(id)); return encoded === null ? null : Buffer.from(encoded, 'base64'); }
  insert(run: RunRecord, message: string, sources: FrozenSource[] = []) {
    this.db.transaction(() => {
      this.saveSources(sources);
      this.db.prepare('INSERT INTO agent_runs VALUES(?,?,?,?,?,?)').run(run.id, run.requestId, run.status, run.revision, run.createdAt, this.encode(run));
      this.event(run.id, 'created', message);
    })();
  }
  save(run: RunRecord, previousRevision: number, type: string, message: string, sources: FrozenSource[] = []) {
    this.db.transaction(() => {
      this.saveSources(sources);
      if (!this.db.prepare('UPDATE agent_runs SET status=?,revision=?,payload=? WHERE id=? AND revision=?').run(run.status, run.revision, this.encode(run), run.id, previousRevision).changes) throw new Error('This run changed. Refresh it before continuing.');
      this.event(run.id, type, message);
    })();
  }
  private event(runId: string, type: string, message: string) {
    const sequence = (this.db.prepare('SELECT COALESCE(MAX(sequence),0)+1 AS n FROM agent_events WHERE run_id=?').get(runId) as { n: number }).n;
    const at = Date.now(); this.db.prepare('INSERT INTO agent_events VALUES(?,?,?,?)').run(runId, sequence, at, this.encode({ sequence, at, type, message }));
  }
  events(runId: string, after = 0) { return this.db.prepare('SELECT payload FROM agent_events WHERE run_id=? AND sequence>? ORDER BY sequence LIMIT 1000').all(runId, after).map(r => this.decode<BackgroundEvent>(r)); }
  operation(id: string) { return this.decode<OperationRecord>(this.db.prepare('SELECT payload FROM agent_operations WHERE id=?').get(id)); }
  saveOperation(op: OperationRecord) { this.db.prepare('INSERT INTO agent_operations VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(op.id, op.runId, this.encode(op)); }
  commitOutput(run: RunRecord, revision: number, op: OperationRecord) {
    this.db.transaction(() => { this.saveOperation({ ...op, state: 'committed' }); this.save(run, revision, 'artifact', 'PDF checked and saved.'); })();
  }
  schedules() { return this.db.prepare('SELECT payload FROM agent_schedules ORDER BY rowid').all().map(r => this.decode<ScheduleRecord>(r)); }
  schedule(id: string) { return this.decode<ScheduleRecord>(this.db.prepare('SELECT payload FROM agent_schedules WHERE id=?').get(id)); }
  saveSchedule(s: ScheduleRecord, expected?: number) {
    if (expected === undefined) this.db.prepare('INSERT INTO agent_schedules VALUES(?,?,?)').run(s.id, s.revision, this.encode(s));
    else if (!this.db.prepare('UPDATE agent_schedules SET revision=?,payload=? WHERE id=? AND revision=?').run(s.revision, this.encode(s), s.id, expected).changes) throw new Error('This schedule changed. Refresh before continuing.');
  }
  dispatch(s: ScheduleRecord, previous: number, run: RunRecord) {
    this.db.transaction(() => {
      this.insert(run, run.message);
      this.db.prepare('INSERT INTO agent_dispatches VALUES(?,?,?)').run(s.id, run.schedule.at, run.id);
      this.saveSchedule(s, previous);
    })();
  }
  saveWithSchedule(run: RunRecord, revision: number, type: string, message: string, schedule?: ScheduleRecord, expected?: number, sources: FrozenSource[] = []) {
    this.db.transaction(() => { this.save(run, revision, type, message, sources); if (schedule) this.saveSchedule(schedule, expected); })();
  }
  scheduleHistory(id: string, before = Number.MAX_SAFE_INTEGER): ScheduleHistory {
    const rows = this.db.prepare('SELECT r.rowid AS cursor,r.payload FROM agent_runs r JOIN agent_dispatches d ON d.run_id=r.id WHERE d.schedule_id=? AND r.rowid<? ORDER BY r.rowid DESC LIMIT 51').all(id, before) as { cursor: number; payload: Buffer }[];
    return { runs: rows.slice(0,50).map(row => publicRun(this.decode<RunRecord>(row))), nextCursor: rows.length > 50 ? rows[49].cursor : null };
  }
  close() { this.db.pragma('wal_checkpoint(TRUNCATE)'); this.db.close(); }
}
export const defaultPdfAgent = (workflow: DocumentWorkflow = 'document_pdf', targetBytes?: number): BackgroundAgent => ({ id: 'builtin', revision: 1, name: workflow === 'pdf_optimize' ? 'PDF Optimizer' : 'Document Helper', instructions: workflow === 'pdf_optimize' ? 'Optimize ordinary PDFs without downsampling images or changing text.' : 'Turn supplied text, Markdown source, or PNG/JPEG images into PDFs.', workflow, style: 'readable', ...(targetBytes ? { targetBytes } : {}), archived: false, createdAt: 0, updatedAt: 0 });
export const newRunId = () => randomUUID();
