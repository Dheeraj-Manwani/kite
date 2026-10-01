import type { AgentElement, AgentSnapshot } from './agent';
/**
 * Jobs: errands in a browser ("buy me 60 sachets of protein"), done as a task with a plan (docs/end-to-end-jobs.md).
 * The plan's phases carry their own step budgets; the site is the job's scope; the facts the user hears at the end
 * (what is in the cart) are read by code from the page, never taken from the model. Pure and shared.
 */
export type JobKind = 'store' | 'form';
export interface JobPhase {
  id: string; title: string;
  /** Steps this phase usually needs; past it Kite asks whether to keep going. */
  budget: number;
  /** False for the user's own steps (checkout, payment): shown on the checklist, never done by Kite. */
  kite: boolean;
}
export interface JobPlan {
  kind: JobKind;
  /** The store or website's domain, e.g. "shop.example.com"; null when the planner could not name one. */
  site: string | null;
  /** What to search for on the site, when it has a search box. */
  search: string | null;
  /** Where the job starts: the site's home page, opened in a new tab. */
  start: string | null;
  /** Domains Kite may visit without asking. */
  scope: string[];
  phases: JobPhase[];
}
export type PhaseState = 'done' | 'active' | 'pending' | 'yours';
export interface ChoiceOption { label: string; detail?: string; ref?: number }
/** What the task card shows for a job, beside the usual task view. */
export interface JobView { phases: { id: string; title: string; state: PhaseState }[]; url: string | null; choices: ChoiceOption[] | null }

/** A whole job, however its phases go: about 45 model decisions and 20 minutes (a first order is 25–45). */
export const jobLimits = { steps: 45, wallMs: 20 * 60_000 } as const;
const templates: Record<JobKind, JobPhase[]> = {
  store: [{ id: 'find', title: 'Find it', budget: 12, kite: true }, { id: 'choose', title: 'Choose', budget: 6, kite: true },
    { id: 'cart', title: 'Add to cart', budget: 6, kite: true }, { id: 'checkout', title: 'Check out', budget: 0, kite: false }, { id: 'pay', title: 'Pay', budget: 0, kite: false }],
  form: [{ id: 'open', title: 'Open the form', budget: 8, kite: true }, { id: 'fill', title: 'Fill it in', budget: 15, kite: true },
    { id: 'review', title: 'Check it', budget: 4, kite: true }, { id: 'submit', title: 'Submit', budget: 0, kite: false }],
};
export const browserApp = /\b(edge|chrome|firefox|brave|opera|vivaldi|browser)\b/i;

/** A domain from what a model wrote: "Shop.Example.com", "https://www.example.in/x" → "example.in"-style host. */
export function siteOf(text: string | null | undefined): string | null {
  const raw = (text ?? '').trim().toLowerCase();
  if (!raw) return null;
  const host = hostOf(/^[a-z][a-z0-9+.-]*:\/\//.test(raw) ? raw : `https://${raw}`);
  return host && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}
export function buildPlan(kind: JobKind, site: string | null, search: string | null): JobPlan {
  const domain = siteOf(site);
  return { kind, site: domain, search: search?.trim().slice(0, 120) || null, start: domain ? `https://${domain}` : null, scope: domain ? [domain] : [], phases: templates[kind].map(p => ({ ...p })) };
}
/** The host of an http(s) URL, without "www."; null for anything else. */
export function hostOf(url: string | null | undefined): string | null {
  try { const u = new URL(String(url)); return /^https?:$/.test(u.protocol) && u.hostname ? u.hostname.toLowerCase().replace(/^www\./, '') : null; }
  catch { return null; }
}
/** True when host is a scope domain or one of its subdomains. An empty scope allows nothing. */
export function inScope(host: string | null, scope: string[]): boolean {
  if (!host) return false;
  return scope.some(domain => { const d = domain.replace(/^www\./, ''); return host === d || host.endsWith('.' + d); });
}
const mainOf = (snapshot: AgentSnapshot) => snapshot.layers.find(l => l.main)?.layer;
/** The page's URL: the page document's value, else the browser's address bar. */
export function pageUrl(snapshot: AgentSnapshot): string | null {
  const main = mainOf(snapshot), http = (v?: string) => !!v && /^https?:\/\//i.test(v.trim());
  const doc = snapshot.elements.find(e => e.layer === main && e.role === 'Document' && http(e.value));
  if (doc) return doc.value.trim();
  const bar = snapshot.elements.find(e => e.role === 'Edit' && /address|location|url/i.test(e.name) && e.value);
  if (!bar) return null;
  const value = bar.value.trim();
  return http(value) ? value : /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(value) ? `https://${value}` : null;
}
/** Controls inside the visible page (not the browser's own toolbar and tabs), in tree order. */
export function pageElements(snapshot: AgentSnapshot): AgentElement[] {
  const main = mainOf(snapshot);
  const doc = snapshot.elements.find(e => e.layer === main && e.role === 'Document' && e.rect.height > 100);
  if (!doc) return snapshot.elements.filter(e => e.layer === main);
  const r = doc.rect;
  return snapshot.elements.filter(e => e !== doc && e.layer === main && e.rect.x >= r.x - 1 && e.rect.y >= r.y - 1 && e.rect.x + e.rect.width <= r.x + r.width + 1 && e.rect.y + e.rect.height <= r.y + r.height + 1);
}

const priceText = /(?:₹|rs\.?|inr)\s?\d[\d,]*(?:\.\d{1,2})?/i;
export const priceOf = (text: string) => { const m = text.match(priceText); return m ? m[0].replace(/\s+/g, '') : null; };
const amount = (price: string | null) => price ? Number(price.replace(/[^\d.]/g, '')) : NaN;
export interface CartLine { name: string; price: string | null; quantity: number | null }
export interface CartSummary { lines: CartLine[]; total: string | null }
const notItem = /^(cart|shopping cart|your cart|remove|delete|save for later|move to wishlist|proceed to (checkout|buy)|checkout|check out|continue shopping|sign in|home|deliver to.*|.*subtotal.*|.*total.*|see more|change|apply|qty|quantity)$/i;
/**
 * What is in the cart, read from the page by code: item names with their price and quantity, and the subtotal.
 * Null when this does not look like a cart page. Store layouts differ; this reads the common shape (an item link,
 * then its price and quantity, then a subtotal) and returns nothing rather than guessing.
 */
export function readCart(snapshot: AgentSnapshot): CartSummary | null {
  const url = pageUrl(snapshot) ?? '', page = pageElements(snapshot);
  const named = (e: AgentElement) => (e.name || e.value || '').replace(/\s+/g, ' ').trim();
  const cartish = /\/(cart|basket|bag|viewcart)\b|cart\.|[?&]cart\b/i.test(url) || page.some(e => /^(shopping )?(cart|basket|bag)\b/i.test(named(e)) && e.role === 'Text');
  if (!cartish) return null;
  const totalAt = page.findIndex(e => /sub-?total|order total|cart total|^total\b/i.test(named(e)));
  const scan = totalAt >= 0 ? page.slice(0, totalAt) : page;
  const lines: CartLine[] = [];
  for (let i = 0; i < scan.length; i++) {
    const e = scan[i], name = named(e);
    if (e.role !== 'Hyperlink' || name.length < 8 || priceOf(name) || notItem.test(name) || lines.some(l => l.name === name)) continue;
    // The price and quantity that follow this link, before the next item's link.
    const next = scan.findIndex((n, j) => j > i && n.role === 'Hyperlink' && named(n) !== name && named(n).length >= 8 && !priceOf(named(n)));
    const near = scan.slice(i + 1, Math.min(i + 9, next < 0 ? scan.length : next));
    const priced = near.find(n => priceOf(named(n)) && !/m\.?r\.?p|was|save|off\b/i.test(named(n)));
    if (!priced) continue;
    const quantityField = near.find(n => /qty|quantity/i.test(`${n.name} ${n.value ?? ''}`) && /\d/.test(`${n.value ?? ''}${n.name}`));
    const quantity = Number(quantityField?.value?.match(/\d+/)?.[0] ?? quantityField?.name.match(/(?:qty|quantity)\D*(\d+)/i)?.[1] ?? NaN);
    lines.push({ name: name.slice(0, 120), price: priceOf(named(priced)), quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : null });
  }
  let total: string | null = null;
  if (totalAt >= 0) for (const e of page.slice(totalAt, totalAt + 3)) { total = priceOf(named(e)); if (total) break; }
  return lines.length || total ? { lines, total } : null;
}
/** The cart in words for the user, written by code. */
export function cartSentence(cart: CartSummary): string {
  const items = cart.lines.map(l => `${l.quantity && l.quantity > 1 ? `${l.quantity} × ` : ''}${l.name}${l.price ? `, ${l.price}` : ''}`);
  const list = items.length > 1 ? `${items.slice(0, -1).join('; ')}; and ${items.at(-1)}` : items[0];
  return `${list ? `It’s in your cart: ${list}.` : 'Your cart is ready.'}${cart.total ? ` The subtotal is ${cart.total}.` : ''}`;
}

export const addToCart = /^(add to (cart|bag|basket|trolley)|buy now|add)$/i;
const tokens = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 1 || /\d/.test(t)).map(t => t.replace(/(?<=[a-z]{3})s$/, ''));
/**
 * Before something goes in the cart: a group of options on the page (pack size, flavour, colour as radio buttons) whose
 * selected option the user never named. A page's default is not the user's choice, so Kite asks. A group is a run of
 * radio buttons with nothing between them but their own label text (as Edge lists a fieldset); the text just before
 * it, such as "Flavour", is its title. Groups already asked about are skipped.
 */
export function unconfirmedVariant(snapshot: AgentSnapshot, goal: string, asked: Set<string>): { options: AgentElement[]; selected: number; key: string; wanted: number | null; title: string | null } | null {
  const said = new Set(tokens(goal));
  const named = (e: AgentElement) => { const words = tokens(e.name); return words.length > 0 && words.every(w => said.has(w)); };
  const groups: { options: AgentElement[]; title: string | null }[] = [];
  let current: AgentElement[] | null = null, before: AgentElement | null = null;
  for (const e of pageElements(snapshot)) {
    if (e.role === 'RadioButton' && e.name.trim() && e.enabled) {
      if (!current) { current = []; groups.push({ options: current, title: before?.role === 'Text' && before.name.trim().length <= 40 ? before.name.trim() : null }); }
      current.push(e);
    } else if (!(current && e.role === 'Text' && e.name.trim() === current[current.length - 1].name.trim())) { current = null; before = e; }
  }
  for (const { options, title } of groups) {
    const selected = options.findIndex(e => e.selected);
    const key = options.map(e => e.name.trim()).join('|');
    if (options.length < 2 || selected < 0 || asked.has(key) || named(options[selected])) continue;
    // The user named another option: no question, it just has to be selected first.
    const wanted = options.findIndex(named);
    return { options, selected, key, wanted: wanted >= 0 ? wanted : null, title };
  }
  return null;
}
const ordinals: Record<string, number> = { first: 0, '1st': 0, second: 1, '2nd': 1, third: 2, '3rd': 2, fourth: 3, '4th': 3 };
const counted: Record<string, number> = { one: 0, '1': 0, two: 1, '2': 1, three: 2, '3': 2, four: 3, '4': 3 };
/**
 * Which option a spoken answer picks: an index, "none" for neither, or null when code can't tell (the model then
 * gets the answer as words). Options are matched in the order the card shows them.
 */
export function matchChoice(text: string, options: ChoiceOption[]): number | 'none' | null {
  const s = text.toLowerCase().replace(/’/g, "'").replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^(um+|uh+|ok(ay)?|yeah|so|hmm+|kite)\s+/, '').replace(/\s+please$/, '');
  const pick = (i: number) => i >= 0 && i < options.length ? i : null;
  if (/^(neither|none|none of (these|them|those)|no|nope|not those|neither of (these|them|those)|something else|none of the above)( (one|ones))?$/.test(s)) return 'none';
  for (const [word, i] of Object.entries(ordinals)) if (new RegExp(`\\b(the )?${word}\\b`).test(s)) return pick(i);
  if (/\b(the )?last( one)?\b/.test(s)) return pick(options.length - 1);
  const numbered = s.match(/^(?:(?:option|number|choice) )?(one|two|three|four|1|2|3|4)(?: one)?$/) ?? s.match(/\b(?:option|number|choice) (one|two|three|four|1|2|3|4)\b/);
  if (numbered) return pick(counted[numbered[1]]);
  const prices = options.map(o => amount(priceOf(`${o.label} ${o.detail ?? ''}`)));
  if (prices.every(Number.isFinite)) {
    if (/\b(cheap(er|est)?|lowest|least expensive|less expensive|lower price|inexpensive)\b/.test(s)) return prices.indexOf(Math.min(...prices));
    if (/\b(expensive|pric(ier|iest)|costl(ier|iest)|dearer|highest)\b/.test(s)) return prices.indexOf(Math.max(...prices));
  }
  // Content words and numbers ("the 60 one", "chocolate"): one option must match more than any other.
  const words = s.split(' ').filter(w => /\d/.test(w) || (w.length > 2 && !/^(the|one|that|this|with|and|for|pack|please|want|take|get|pick|choose|i'll|ill|lets|let's)$/.test(w)));
  if (!words.length) return null;
  const scores = options.map(o => { const tokens = `${o.label} ${o.detail ?? ''}`.toLowerCase().split(/[^a-z0-9]+/); return words.filter(w => tokens.includes(w.replace(/[^a-z0-9]/g, ''))).length; });
  const best = Math.max(...scores);
  return best > 0 && scores.filter(x => x === best).length === 1 ? scores.indexOf(best) : null;
}
