import type { MemoryFact } from './memory';
/**
 * Order history and repeat orders (docs/end-to-end-jobs.md phase 5). An order is saved to memory as one readable line,
 * "items · total · site · paid by … · order number · arriving …", which code reads back here. Pure and shared.
 */
export interface PastOrder {
  key: string;
  /** "Sunfold Whey Protein, 60 sachets, Unflavoured", or "2 × …" for a quantity. */
  items: string[];
  /** Rupees, as the order page showed it. */
  total: number | null;
  site: string;
  payment: string | null;
  number: string | null;
  when: string | null;
  /** When it was saved. */
  at: number;
}
const rupeesIn = (text: string) => { const m = text.match(/₹\s?([\d,]+(?:\.\d{1,2})?)/); return m ? Number(m[1].replace(/,/g, '')) : null; };
/** The memory line for a confirmed order. */
export function orderValue(order: { items: string[]; total: string | null; site: string; payment?: string | null; number: string; when?: string | null }): string {
  return [order.items.join('; ') || 'Order', order.total, order.site, order.payment && `paid by ${order.payment}`, `order ${order.number}`, order.when && `arriving ${order.when}`]
    .filter(Boolean).join(' · ');
}
/** An order fact read back; null when the line isn't one Kite wrote. */
export function parseOrder(fact: Pick<MemoryFact, 'key' | 'value' | 'updated' | 'kind'>): PastOrder | null {
  if (fact.kind !== 'order') return null;
  const parts = fact.value.split(' · ').map(p => p.trim());
  const site = parts.find(p => /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?$/i.test(p));
  if (!parts[0] || !site) return null;
  const rest = parts.slice(1);
  return { key: fact.key, items: parts[0].split('; ').filter(Boolean), total: rupeesIn(rest.find(p => /^₹/.test(p)) ?? ''), site,
    payment: rest.find(p => p.startsWith('paid by '))?.slice(8) ?? null, number: rest.find(p => p.startsWith('order '))?.slice(6) ?? null,
    when: rest.find(p => p.startsWith('arriving '))?.slice(9) ?? null, at: fact.updated };
}
export const pastOrders = (facts: MemoryFact[]) => facts.map(parseOrder).filter((o): o is PastOrder => !!o).sort((a, b) => b.at - a.at);

const words = (text: string) => text.toLowerCase().replace(/^\d+\s*×\s*/, '').split(/[^a-z0-9]+/).filter(w => w.length > 1 || /\d/.test(w)).map(w => w.replace(/(?<=[a-z]{3})s$/, ''));
const generic = new Set(['order', 'again', 'my', 'the', 'same', 'last', 'time', 'reorder', 'buy', 'get', 'me', 'usual', 'one', 'it', 'that', 'some', 'more', 'please', 'from', 'pack']);
/**
 * The past order a phrase is about ("my protein", "the usual", "the batteries from Kite Test Mart"): the newest order whose
 * items or site share the most words with it. "Again" alone, or nothing specific, is the newest order.
 */
export function findOrder(orders: PastOrder[], about: string): PastOrder | null {
  const asked = words(about).filter(w => !generic.has(w));
  if (!orders.length) return null;
  if (!asked.length) return orders[0];
  const scored = orders.map(o => { const have = new Set([...o.items.flatMap(words), ...words(o.site)]); return { o, n: asked.filter(w => have.has(w)).length }; });
  const best = Math.max(...scored.map(x => x.n));
  return best > 0 ? scored.find(x => x.n === best).o : null;
}
/** The newest past order with this item: the same product words, ignoring quantity. */
export function lastOrderOf(orders: PastOrder[], item: string): PastOrder | null {
  const want = new Set(words(item));
  return orders.find(o => o.items.some(i => { const have = words(i); return have.length > 0 && have.every(w => want.has(w)) && [...want].every(w => have.includes(w)); })) ?? null;
}
/** A cart holds exactly the order's items (names compared word for word, quantities aside). */
export function sameItems(cart: string[], items: string[]): boolean {
  const key = (s: string) => words(s).sort().join(' ');
  const a = cart.map(key).sort(), b = items.map(key).sort();
  return a.length === b.length && a.every((k, i) => k === b[i]);
}
/** A repeat job: the order the user confirmed again, and how far its total may move before Kite asks once more. */
export interface RepeatOrder { site: string; items: string[]; total: number | null; payment: string | null }
/** The confirmed amount covers a small change (a delivery fee); more than this asks again. */
export const repeatTolerance = (total: number) => Math.max(total * 1.1, total + 50);
/** A price far above the last order of the same thing asks before ordering, in every mode. */
export const priceJump = 1.5;
