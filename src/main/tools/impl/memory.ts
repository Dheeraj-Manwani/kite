import { z } from 'zod';
import { defineTool } from '../define';
import { preview } from '../types';
import { mask, matchFacts, placeholderLabel, sensitive, slug, type MemoryFact } from '../../../shared/memory';
import type { MemoryStore, SaveResult } from '../../memory/store';
/**
 * Memory in chat (docs/end-to-end-jobs.md §3.4): "What's my pincode?", "Remember that I like chocolate flavour",
 * "Forget my work address". Sensitive values never go back to the model: recall shows them to the user on screen and
 * gives the model only labels, masks and placeholders.
 */
export interface MemoryToolDeps {
  store: MemoryStore;
  /** Show text to the user on the overlay (never sent to a model). */
  show(text: string): void;
  /** A fact was saved: the "Saved · Undo · Edit" notice. */
  saved(result: Extract<SaveResult, { ok: true }>): void;
  /** "From what you said, 1 Oct" */
  source(): string;
}
const about = z.object({ about: z.string().trim().min(1).max(80) }).strict();
const fields = ['name', 'phone', 'email', 'address', 'pincode', 'city', 'state', 'landmark', 'preference'] as const;
export const rememberInput = z.object({
  field: z.enum(fields),
  value: z.string().trim().min(1).max(300),
  /** Which address: "home", "work", "mum's place". */
  place: z.string().trim().min(2).max(20).optional(),
  /** What a preference is about: "protein flavour", "grocery store". */
  topic: z.string().trim().min(2).max(40).optional(),
}).strict();
type RememberInput = z.infer<typeof rememberInput>;
/** The key and label a remembered field is saved under. */
export function keyFor({ field, place, topic }: Pick<RememberInput, 'field' | 'place' | 'topic'>): string {
  if (field === 'preference') return `pref.${slug(topic ?? 'note')}`;
  const where = place ? place.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) : '';
  // A name or phone at an address is that address's contact; otherwise it is the user's own.
  if (field === 'email' || (['name', 'phone'].includes(field) && !where)) return `profile.${field}`;
  return `${where.length >= 2 ? where : 'home'}.${field}`;
}
const said = (f: MemoryFact) => sensitive(f) ? `${f.label}: ${mask(f)}, placeholder {{${f.key}}}` : `${f.label}: ${f.value}`;
export function memoryTools(deps: MemoryToolDeps) {
  const recall = defineTool({
    name: 'recall', kind: 'info', approvalRequired: false, inputSchema: about,
    description: 'Look up what Kite remembers about the user: name, phone, email, addresses, preferences. about: what to look up, such as "pincode", "work address", or "everything". Sensitive values are shown to the user on screen, not given to you.',
    summarize: ({ about }) => `Look up what I remember about “${preview(about, 40)}”.`,
    execute: async ({ about }) => {
      if (!deps.store.enabled()) return { ok: false, message: 'Memory is turned off in Settings, so Kite isn’t using anything it saved.' };
      const facts = matchFacts(deps.store.facts(), about);
      if (!facts.length) return { ok: true, message: `Kite has nothing saved about “${about}”. Say so; the user can tell you to remember it.` };
      const hidden = facts.filter(sensitive);
      if (hidden.length) deps.show(hidden.map(f => `${f.label}: ${f.value}`).join('\n'));
      return { ok: true, message: `${hidden.length ? 'Kite is showing the saved values to the user on screen. Do not guess or repeat them; say they are on screen. ' : ''}Saved: ${facts.map(said).join('; ')}.` };
    },
  });
  const remember = defineTool<RememberInput>({
    name: 'remember', kind: 'info', approvalRequired: false, inputSchema: rememberInput,
    description: 'Save a fact the user asked you to remember, or corrected: their name, phone, email, an address (place: "home", "work"), a pincode or city, or a preference (topic: what it is about). Kite never saves passwords, card, bank, Aadhaar or PAN numbers, or codes, and says so.',
    summarize: input => `Remember your ${placeholderLabel(keyFor(input)).toLowerCase()}.`,
    execute: async input => {
      const key = keyFor(input), kind = key.startsWith('profile.') ? 'profile' as const : key.startsWith('pref.') ? 'preference' as const : 'address' as const;
      const label = kind === 'preference' ? input.topic ?? 'Note' : placeholderLabel(key);
      const result = deps.store.save({ kind, key, label: label.charAt(0).toUpperCase() + label.slice(1), value: input.value, source: deps.source() });
      if (result.ok === false) return { ok: false, message: result.reason };
      if (result.token) deps.saved(result);
      return { ok: true, message: `Saved ${result.fact.label}${sensitive(result.fact) ? ` as {{${key}}}` : ''}. Kite shows the user a notice with Undo; confirm in a few words.` };
    },
  });
  const forget = defineTool({
    name: 'forget', kind: 'action', inputSchema: about,
    description: 'Delete what Kite remembers about something the user names ("my work address", "my phone", "everything"). The user confirms first.',
    summarize: ({ about }) => /^(everything|all|all of it|everything about me)$/i.test(about.trim()) ? 'Forget everything I remember about you?' : `Forget what I remember about “${preview(about, 40)}”?`,
    execute: async ({ about }) => {
      const facts = matchFacts(deps.store.facts(), about);
      if (!facts.length) return { ok: true, message: `Nothing saved matches “${about}”.` };
      for (const f of facts) deps.store.forget(f.id);
      return { ok: true, message: `Forgot ${facts.map(f => f.label).join(', ')}. Old conversations in History still contain what was said; the user can delete them there.` };
    },
  });
  return [recall, remember, forget];
}
