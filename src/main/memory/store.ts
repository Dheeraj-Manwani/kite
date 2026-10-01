import { randomUUID } from 'node:crypto';
import type { MemoryRow } from '../storage/database';
import type { SecretCipher } from '../settings/secretsCore';
import { fillPlaceholders, kindOf, memoryContext, memoryKinds, neverSave, redactor, validKey, type MemoryFact, type MemoryKind, type NewFact } from '../../shared/memory';
export interface MemoryTable {
  list(): MemoryRow[];
  put(row: Omit<MemoryRow, 'id' | 'used_at'>): number;
  remove(id: number): boolean;
  removeAll(): number;
  touch(id: number, at: number): void;
}
export type SaveResult = { ok: true; fact: MemoryFact; token: string; updated: boolean } | { ok: false; reason: string };
/**
 * The memory store (docs/end-to-end-jobs.md §3.4): facts in SQLite, each value encrypted with the OS (safeStorage, as API
 * keys are). Saving refuses payment and ID numbers, passwords and codes. Every save can be undone once, by its token.
 * While memory is off nothing is saved or used, but saved values are still kept out of prompts.
 */
export function createMemory(table: MemoryTable, cipher: SecretCipher, options: { enabled(): boolean; changed?(): void; now?(): number }) {
  const now = options.now ?? Date.now;
  const undo = new Map<string, { key: string; previous: MemoryFact | null }>();
  let cache: MemoryFact[] | null = null, redact: ((text: string) => string) | null = null;
  const encrypt = (value: string) => { if (!cipher.isEncryptionAvailable()) throw new Error('OS encryption is unavailable, so Kite won’t save this.'); return cipher.encryptString(value).toString('base64'); };
  const facts = (): MemoryFact[] => {
    if (cache) return cache;
    const out: MemoryFact[] = [];
    for (const row of table.list()) {
      if (!memoryKinds.includes(row.kind as MemoryKind)) continue;
      // A value that can't be decrypted (another Windows account, a reset profile) is skipped, never shown as ciphertext.
      try { out.push({ id: row.id, kind: row.kind as MemoryKind, key: row.key, label: row.label, value: cipher.decryptString(Buffer.from(row.value, 'base64')), source: row.source, created: row.created_at, updated: row.updated_at, used: row.used_at }); }
      catch { /* skipped */ }
    }
    return (cache = out);
  };
  const changed = () => { cache = null; redact = null; options.changed?.(); };
  function write(fact: NewFact): SaveResult {
    const value = fact.value.trim().slice(0, 500), label = fact.label.trim().slice(0, 80) || fact.key;
    if (!validKey(fact.key) || kindOf(fact.key) !== fact.kind || !value) return { ok: false, reason: 'That isn’t something I can save.' };
    const refused = neverSave(value, `${label} ${fact.key}`);
    if (refused) return { ok: false, reason: refused };
    const previous = store.find(fact.key);
    if (previous && previous.value === value) return { ok: true, fact: previous, token: '', updated: false };
    const at = now();
    const id = table.put({ kind: fact.kind, key: fact.key, label, value: encrypt(value), source: fact.source.slice(0, 120), created_at: previous?.created ?? at, updated_at: at });
    changed();
    const token = randomUUID(); undo.set(token, { key: fact.key, previous });
    if (undo.size > 20) undo.delete(undo.keys().next().value);
    return { ok: true, fact: store.find(fact.key) ?? { ...fact, id, value, label, created: at, updated: at, used: null }, token, updated: !!previous };
  }
  const store = {
    enabled: () => options.enabled(),
    facts,
    find: (key: string) => facts().find(f => f.key === key) ?? null,
    save(fact: NewFact): SaveResult { return options.enabled() ? write(fact) : { ok: false, reason: 'Memory is off in Settings.' }; },
    /** Undo one save: the previous value comes back, or the new fact goes. */
    undo(token: string) {
      const change = undo.get(token); if (!change) return false;
      undo.delete(token);
      const current = store.find(change.key);
      if (change.previous) table.put({ kind: change.previous.kind, key: change.previous.key, label: change.previous.label, value: encrypt(change.previous.value), source: change.previous.source, created_at: change.previous.created, updated_at: now() });
      else if (current) table.remove(current.id);
      changed(); return true;
    },
    /** An edit from Settings: a new value or label for an existing fact. Works while memory is off. */
    edit(id: number, patch: { label?: string; value?: string }): SaveResult {
      const fact = facts().find(f => f.id === id); if (!fact) return { ok: false, reason: 'That fact is gone.' };
      return write({ kind: fact.kind, key: fact.key, label: patch.label ?? fact.label, value: patch.value ?? fact.value, source: fact.source });
    },
    forget(id: number) { const ok = table.remove(id); if (ok) changed(); return ok; },
    forgetAll() { const n = table.removeAll(); undo.clear(); changed(); return n; },
    /** The value for a placeholder while a step runs; null when it isn't saved or memory is off. */
    lookup(key: string) {
      if (!options.enabled()) return null;
      const fact = store.find(key); if (!fact) return null;
      table.touch(fact.id, now()); return fact.value;
    },
    fill(text: string) { return fillPlaceholders(text, store.lookup); },
    /** Saved values in text, replaced by their placeholders: applied to everything a model is sent. */
    redact(text: string) { return (redact ??= redactor(facts()))(text); },
    /** What the model is told it remembers; empty while memory is off. */
    context() { return options.enabled() ? memoryContext(facts()) : ''; },
  };
  return store;
}
export type MemoryStore = ReturnType<typeof createMemory>;
