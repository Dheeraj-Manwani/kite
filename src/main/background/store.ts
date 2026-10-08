import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { SecretCipher } from '../settings/secretsCore';
import type { BackgroundAgent, BackgroundArtifact, BackgroundEvent, BackgroundRun, BackgroundRequest, PdfStyle, RunStatus } from '../../shared/background';

export interface RunInput { name: string; text: string }
export interface RunRecord {
  id: string; requestId: string; inputHash: string; agent: BackgroundAgent; title: string; inputs: RunInput[];
  status: RunStatus; revision: number; generation: number; createdAt: number; updatedAt: number;
  message: string; completed: number; attempts: number; recoveryCount?: number; request: BackgroundRequest | null;
  approvedBinding: string | null; artifacts: BackgroundArtifact[]; parentId: string | null;
}
export interface OperationRecord { id: string; runId: string; generation: number; index: number; inputHash: string; style: PdfStyle; state: 'intent' | 'prepared' | 'committed'; hash?: string; bytes?: number; pages?: number }
export const publicRun = (r: RunRecord): BackgroundRun => ({ id: r.id, agentId: r.agent.id === 'builtin' ? null : r.agent.id, agentName: r.agent.name, agentRevision: r.agent.revision, title: r.title, status: r.status, revision: r.revision, generation: r.generation, createdAt: r.createdAt, updatedAt: r.updatedAt, message: r.message, inputs: r.inputs.map(i => i.name), completed: r.completed, total: r.inputs.length, attempts: r.attempts, request: r.request, artifacts: r.artifacts, modelCalls: 0, parentId: r.parentId });

/** Separate from voice history: deleting a conversation cannot delete an active run. Payloads use OS encryption. */
export class BackgroundStore {
  private db: Database.Database;
  constructor(filename: string, private cipher: SecretCipher) {
    if (!cipher.isEncryptionAvailable()) throw new Error('Background agents need OS encryption to save their work.');
    this.db = new Database(filename);
    this.db.pragma('journal_mode = WAL'); this.db.pragma('foreign_keys = ON'); this.db.pragma('secure_delete = ON'); this.db.pragma('busy_timeout = 5000');
    const version = this.db.pragma('user_version', { simple: true }) as number;
    if (version > 1) { this.db.close(); throw new Error('Background database needs a newer Kite version.'); }
    if (version === 0) this.db.transaction(() => {
      this.db.exec(`CREATE TABLE agent_definitions (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, archived INTEGER NOT NULL, payload BLOB NOT NULL);
        CREATE TABLE agent_revisions (id TEXT NOT NULL, revision INTEGER NOT NULL, payload BLOB NOT NULL, PRIMARY KEY(id,revision));
        CREATE TABLE agent_runs (id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, status TEXT NOT NULL, revision INTEGER NOT NULL, created_at INTEGER NOT NULL, payload BLOB NOT NULL);
        CREATE TABLE agent_events (run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE, sequence INTEGER NOT NULL, at INTEGER NOT NULL, payload BLOB NOT NULL, PRIMARY KEY(run_id,sequence));
        CREATE TABLE agent_operations (id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE, payload BLOB NOT NULL);
        CREATE INDEX runs_status ON agent_runs(status,created_at);`);
      this.db.pragma('user_version = 1');
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
  insert(run: RunRecord, message: string) {
    this.db.transaction(() => {
      this.db.prepare('INSERT INTO agent_runs VALUES(?,?,?,?,?,?)').run(run.id, run.requestId, run.status, run.revision, run.createdAt, this.encode(run));
      this.event(run.id, 'created', message);
    })();
  }
  save(run: RunRecord, previousRevision: number, type: string, message: string) {
    this.db.transaction(() => {
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
  close() { this.db.pragma('wal_checkpoint(TRUNCATE)'); this.db.close(); }
}
export const defaultPdfAgent = (): BackgroundAgent => ({ id: 'builtin', revision: 1, name: 'Document Helper', instructions: 'Turn supplied text or Markdown source into a readable PDF.', workflow: 'text_pdf', style: 'readable', archived: false, createdAt: 0, updatedAt: 0 });
export const newRunId = () => randomUUID();
