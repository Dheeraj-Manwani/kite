import Database from 'better-sqlite3';
import type { SecretCipher } from '../../settings/secretsCore';
import type { MailAccount } from '../../../shared/mail';

export interface GoogleClient { clientId: string; clientSecret?: string }
export interface StoredMailAccount extends MailAccount { client: GoogleClient; refreshToken?: string; createdAt: number }
export const publicAccount = (a: StoredMailAccount): MailAccount => ({ id: a.id, provider: a.provider, email: a.email, revision: a.revision, status: a.status });

/** Tokens/client credentials are OS-encrypted, separate from run payloads, and never returned by IPC. */
export class MailStore {
  private db: Database.Database;
  constructor(filename: string, private cipher: SecretCipher) {
    if (!cipher.isEncryptionAvailable()) throw new MailStoreError();
    this.db = new Database(filename); this.db.pragma('journal_mode = WAL'); this.db.pragma('secure_delete = ON'); this.db.pragma('busy_timeout = 5000');
    const version = this.db.pragma('user_version', { simple: true }) as number;
    if (version > 1) { this.db.close(); throw new Error('Mail database needs a newer Kite version.'); }
    if (!version) this.db.transaction(() => { this.db.exec('CREATE TABLE mail_config (id INTEGER PRIMARY KEY, payload BLOB NOT NULL); CREATE TABLE mail_accounts (id TEXT PRIMARY KEY, payload BLOB NOT NULL)'); this.db.pragma('user_version = 1'); })();
  }
  private encode(value: unknown) { return this.cipher.encryptString(JSON.stringify(value)); }
  private decode<T>(row: unknown): T | null { return row ? JSON.parse(this.cipher.decryptString((row as { payload: Buffer }).payload)) as T : null; }
  client() { return this.decode<GoogleClient>(this.db.prepare('SELECT payload FROM mail_config WHERE id=1').get()); }
  configure(client: GoogleClient) { this.db.prepare('INSERT INTO mail_config VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(this.encode(client)); }
  accounts() { return this.db.prepare('SELECT payload FROM mail_accounts ORDER BY rowid').all().map(r => this.decode<StoredMailAccount>(r)); }
  account(id: string) { return this.decode<StoredMailAccount>(this.db.prepare('SELECT payload FROM mail_accounts WHERE id=?').get(id)); }
  save(account: StoredMailAccount) { this.db.prepare('INSERT INTO mail_accounts VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(account.id, this.encode(account)); }
  close() { this.db.pragma('wal_checkpoint(TRUNCATE)'); this.db.close(); }
}
class MailStoreError extends Error { constructor() { super('Mail accounts require OS encryption; no plaintext fallback is used.'); } }
