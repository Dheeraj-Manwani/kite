import Database from 'better-sqlite3';
import type { Timing, ModelSelection, ToolAudit, ToolDecision, Reminder } from '../../shared/types';
import { modelIds } from '../ai/models';
const migrations = [
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
];
export function openDatabase(filename: string) {
  const db = new Database(filename);
  db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON');
  const version = db.pragma('user_version', { simple: true }) as number;
  if (version > migrations.length) { db.close(); throw new Error('Kite database is newer than this app.'); }
  db.transaction(() => {
    for (let i = version; i < migrations.length; i++) {
      db.exec(migrations[i]); db.pragma(`user_version = ${i + 1}`);
    }
  })();
  const conversation = db.prepare('INSERT OR IGNORE INTO conversations(id, started_at) VALUES (?, ?)');
  const insert = db.prepare(`INSERT INTO messages(conversation_id, role, content, provider, model, created_at, transcribe_ms, first_token_ms, total_ms, interrupted, tts_first_audio_ms, voice_to_voice_ms)
    VALUES (@conversationId, @role, @content, @provider, @model, @createdAt, @transcribeMs, @firstTokenMs, @totalMs, @interrupted, @ttsFirstAudioMs, @voiceToVoiceMs)`);
  return {
    createConversation(id: string, now: number) { conversation.run(id, now); },
    addMessage(conversationId: string, role: 'user' | 'assistant', content: string, timing: Timing, model?: ModelSelection, interrupted = false) {
      const row = insert.run({ conversationId, role, content, provider: model?.provider ?? (role === 'user' ? 'groq' : 'moonshot'),
        model: model?.id ?? (role === 'user' ? modelIds.transcription : modelIds.chat), createdAt: Date.now(), ...timing, interrupted: Number(interrupted), ttsFirstAudioMs: timing.ttsFirstAudioMs ?? null, voiceToVoiceMs: timing.voiceToVoiceMs ?? null });
      return Number(row.lastInsertRowid);
    },
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
    close() { db.close(); },
  };
}
