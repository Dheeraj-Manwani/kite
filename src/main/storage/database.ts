import Database from 'better-sqlite3';
import type { Timing, ModelSelection, ToolAudit, ToolDecision, Reminder } from '../../shared/types';
import { modelIds } from '../ai/models';
export const migrations = [
  `CREATE TABLE conversations (id TEXT PRIMARY KEY, started_at INTEGER NOT NULL);
   CREATE TABLE messages (
     id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id TEXT NOT NULL REFERENCES conversations(id),
     role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL,
     provider TEXT NOT NULL, model TEXT NOT NULL, created_at INTEGER NOT NULL,
     transcribe_ms REAL, first_token_ms REAL, total_ms REAL);
   CREATE INDEX messages_conversation ON messages(conversation_id, id);`,
  `ALTER TABLE messages ADD COLUMN interrupted INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE messages ADD COLUMN tts_first_audio_ms REAL;
   ALTER TABLE messages ADD COLUMN voice_to_voice_ms REAL;`,
  `CREATE TABLE tool_calls (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id INTEGER REFERENCES messages(id), tool TEXT NOT NULL,
    input_json TEXT NOT NULL, summary TEXT NOT NULL, decision TEXT NOT NULL CHECK(decision IN ('approved','denied','timeout','auto')),
    result_json TEXT, error TEXT, dry_run INTEGER NOT NULL DEFAULT 0, duration_ms REAL NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
   CREATE TABLE reminders (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, label TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','fired','cancelled')));
   CREATE INDEX reminders_due ON reminders(status, at);`,
  `ALTER TABLE messages ADD COLUMN annotation_json TEXT;
   ALTER TABLE messages ADD COLUMN capture_ms REAL;
   CREATE TABLE attachments (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id INTEGER NOT NULL REFERENCES messages(id),
     path TEXT NOT NULL, media_type TEXT NOT NULL, created_at INTEGER NOT NULL);`,
  `CREATE VIRTUAL TABLE messages_fts USING fts5(content, content='messages', content_rowid='id');
   INSERT INTO messages_fts(messages_fts) VALUES ('rebuild');
   CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN INSERT INTO messages_fts(rowid,content) VALUES(new.id,new.content); END;
   CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN INSERT INTO messages_fts(messages_fts,rowid,content) VALUES('delete',old.id,old.content); END;
   CREATE TRIGGER messages_au AFTER UPDATE OF content ON messages BEGIN
     INSERT INTO messages_fts(messages_fts,rowid,content) VALUES('delete',old.id,old.content);
     INSERT INTO messages_fts(rowid,content) VALUES(new.id,new.content); END;`,
];
export function openDatabase(filename: string) {
  const db = new Database(filename);
  db.pragma('secure_delete = ON');
  db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON');
  const version = db.pragma('user_version', { simple: true }) as number;
  if (version > migrations.length) { db.close(); throw new Error('Kite database is newer than this app.'); }
  db.transaction(() => {
    for (let i = version; i < migrations.length; i++) {
      db.exec(migrations[i]); db.pragma(`user_version = ${i + 1}`);
    }
  })();
  db.exec("INSERT INTO messages_fts(messages_fts,rank) VALUES('secure-delete',1)");
  const conversation = db.prepare('INSERT OR IGNORE INTO conversations(id, started_at) VALUES (?, ?)');
  const insert = db.prepare(`INSERT INTO messages(conversation_id, role, content, provider, model, created_at, transcribe_ms, first_token_ms, total_ms, interrupted, tts_first_audio_ms, voice_to_voice_ms)
    VALUES (@conversationId, @role, @content, @provider, @model, @createdAt, @transcribeMs, @firstTokenMs, @totalMs, @interrupted, @ttsFirstAudioMs, @voiceToVoiceMs)`);
  return {
    createConversation(id: string, now: number) { conversation.run(id, now); },
    addMessage(conversationId: string, role: 'user' | 'assistant', content: string, timing: Timing, model?: ModelSelection, interrupted = false) {
      const row = insert.run({ conversationId, role, content, provider: model?.provider ?? (role === 'user' ? 'groq' : 'moonshot'),
        model: model?.id ?? (role === 'user' ? modelIds.transcription : modelIds.chat), createdAt: Date.now(), ...timing, interrupted: Number(interrupted), ttsFirstAudioMs: timing.ttsFirstAudioMs ?? null, voiceToVoiceMs: timing.voiceToVoiceMs ?? null });
      if (timing.captureMs !== undefined) db.prepare('UPDATE messages SET capture_ms=? WHERE id=?').run(timing.captureMs, row.lastInsertRowid);
      return Number(row.lastInsertRowid);
    },
    annotate(id: number, metadata: unknown, captureMs: number) { db.prepare('UPDATE messages SET annotation_json=COALESCE(annotation_json,?), capture_ms=? WHERE id=?').run(JSON.stringify(metadata), captureMs, id); },
    attach(id: number, filename: string) { db.prepare("INSERT INTO attachments(message_id,path,media_type,created_at) VALUES(?,?,'image/jpeg',?)").run(id, filename, Date.now()); },
    updateMessage(id: number, timing: Timing, interrupted: boolean) {
      db.prepare('UPDATE messages SET interrupted=?, tts_first_audio_ms=?, voice_to_voice_ms=?, total_ms=? WHERE id=?')
        .run(Number(interrupted), timing.ttsFirstAudioMs ?? null, timing.voiceToVoiceMs ?? null, timing.totalMs, id);
    },
    voiceAverage() { return (db.prepare('SELECT AVG(voice_to_voice_ms) AS average FROM (SELECT voice_to_voice_ms FROM messages WHERE voice_to_voice_ms IS NOT NULL ORDER BY id DESC LIMIT 20)').get() as { average: number | null }).average ?? undefined; },
    beginTool(messageId: number | null, tool: string, input: unknown, summary: string, dryRun: boolean) {
      return Number(db.prepare("INSERT INTO tool_calls(message_id,tool,input_json,summary,decision,dry_run,created_at,error) VALUES(?,?,?,?,'denied',?,?,'Pending; no execution authorized')")
        .run(messageId, tool, JSON.stringify(input) ?? 'null', summary, Number(dryRun), Date.now()).lastInsertRowid);
    },
    finishTool(id: number, decision: ToolDecision, result: unknown, error: string | null, durationMs: number) {
      db.prepare('UPDATE tool_calls SET decision=?, result_json=?, error=?, duration_ms=? WHERE id=?').run(decision, result == null ? null : JSON.stringify(result), error, durationMs, id);
    },
    recentTools() { return db.prepare('SELECT * FROM tool_calls ORDER BY id DESC LIMIT 20').all() as ToolAudit[]; },
    addReminder(at: number, label: string) { return Number(db.prepare('INSERT INTO reminders(at,label) VALUES(?,?)').run(at, label).lastInsertRowid); },
    listReminders() { return db.prepare("SELECT * FROM reminders WHERE status='pending' ORDER BY at").all() as Reminder[]; },
    cancelReminder(id: number) { return !!db.prepare("UPDATE reminders SET status='cancelled' WHERE id=? AND status='pending'").run(id).changes; },
    claimReminder(id: number) { return !!db.prepare("UPDATE reminders SET status='fired' WHERE id=? AND status='pending'").run(id).changes; },
    recent() { return db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT 10').all().reverse(); },
    listConversations(query = '') {
      const match = query.trim().split(/\s+/).filter(Boolean).map(s => '"' + s.replace(/"/g, '""') + '"').join(' AND ');
      return db.prepare(`SELECT c.id,c.started_at,
        (SELECT content FROM messages WHERE conversation_id=c.id ORDER BY id LIMIT 1) AS preview,
        (SELECT group_concat(DISTINCT model) FROM messages WHERE conversation_id=c.id AND role='assistant') AS models,
        (SELECT COUNT(*) FROM messages WHERE conversation_id=c.id) AS count FROM conversations c
        ${match ? 'WHERE c.id IN (SELECT m.conversation_id FROM messages_fts f JOIN messages m ON m.id=f.rowid WHERE messages_fts MATCH ?)' : ''}
        ORDER BY c.started_at DESC LIMIT 300`).all(...(match ? [match] : [])) as import('../../shared/release').ConversationSummary[];
    },
    detail(id: string): import('../../shared/release').HistoryDetail {
      return { messages: db.prepare('SELECT * FROM messages WHERE conversation_id=? ORDER BY id').all(id) as import('../../shared/release').HistoryMessage[],
        tools: db.prepare('SELECT t.* FROM tool_calls t JOIN messages m ON m.id=t.message_id WHERE m.conversation_id=? ORDER BY t.id').all(id) as ToolAudit[] };
    },
    deleteHistory(id: string | null) {
      const filter = id === null ? '' : ' WHERE conversation_id=?', args = id === null ? [] : [id];
      const ids = `SELECT id FROM messages${filter}`;
      const files = db.prepare(`SELECT path FROM attachments WHERE message_id IN (${ids})`).all(...args) as { path: string }[];
      db.transaction(() => {
        db.prepare(`DELETE FROM attachments WHERE message_id IN (${ids})`).run(...args);
        db.prepare(`DELETE FROM tool_calls WHERE message_id IN (${ids})`).run(...args);
        if (id === null) db.prepare('DELETE FROM tool_calls WHERE message_id IS NULL').run();
        db.prepare(`DELETE FROM messages${filter}`).run(...args);
        db.prepare(`DELETE FROM conversations${id === null ? '' : ' WHERE id=?'}`).run(...args);
      })();
      db.exec("INSERT INTO messages_fts(messages_fts) VALUES('optimize')");
      db.pragma('wal_checkpoint(TRUNCATE)'); return files.map(f => f.path);
    },
    voiceStats() {
      const values = (db.prepare('SELECT voice_to_voice_ms AS value FROM messages WHERE role=\'assistant\' AND voice_to_voice_ms IS NOT NULL AND interrupted=0 ORDER BY voice_to_voice_ms').all() as {value:number}[]).map(r=>r.value);
      const n=values.length; return { voiceSamples:n, voiceMedianMs:n ? (values[Math.floor((n-1)/2)]+values[Math.floor(n/2)])/2 : null };
    },
    close() { db.close(); },
  };
}
