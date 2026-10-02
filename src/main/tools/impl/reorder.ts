import { z } from 'zod';
import { defineTool } from '../define';
import { preview, type ToolResult } from '../types';
import { findOrder, type PastOrder } from '../../../shared/orders';
import { rupees } from '../../../shared/permissions';
import type { TaskScope } from '../../../shared/agent';
/**
 * Repeat orders (docs/end-to-end-jobs.md phase 5): "order my protein again". The approval card is the one question, written
 * by code from the saved order: what, about how much, where, and how Kite will check out. Approving starts a job that
 * needs no other question unless the cart or the price differs from what was confirmed.
 */
export interface ReorderDeps {
  orders(): PastOrder[];
  /** Kite won't check out on this site (Spend money is Don't allow there): it stops at the cart. */
  handsOver(site: string): boolean;
  /** "your Home address", when one is saved. */
  address(): string | null;
  start(order: PastOrder, scope: TaskScope): ToolResult;
}
export const reorderInput = z.object({ about: z.string().trim().min(1).max(80) }).strict();
/** The order's spoken summary, as the card says it. */
export function reorderSummary(order: PastOrder, handsOver: boolean, address: string | null) {
  const what = order.items.length > 2 ? `${order.items.slice(0, 2).join('; ')} and ${order.items.length - 2} more` : order.items.join(' and ');
  return `Same as last time: ${what}${order.total ? `, about ${rupees(order.total)}` : ''}, from ${order.site}${address ? `, to ${address}` : ''}? `
    + (handsOver ? 'I’ll add it to your cart and leave checkout to you.' : `I’ll check out like last time${order.payment ? `, paying by ${order.payment}` : ''}, and ask again only if the cart or the price has changed.`);
}
export function reorder(deps: ReorderDeps) {
  const find = (about: string) => findOrder(deps.orders(), about);
  return defineTool({
    name: 'reorder', kind: 'action', approvalRequired: true, inputSchema: reorderInput,
    description: 'Repeat an order Kite placed before, when the user says "again", "the usual", "same as last time" or "reorder" ("order my protein again"). about: what to reorder, in the user\'s words ("protein", "batteries"), or "last order". The user confirms on a card that names the order and its price. If no past order matches, the result says so: then start a new errand with do_task.',
    summarize: ({ about }) => { const o = find(about); return o ? reorderSummary(o, deps.handsOver(o.site), deps.address()) : `I don’t have a past order for “${preview(about, 40)}”. Nothing will be ordered.`; },
    execute: async ({ about }, ctx) => {
      ctx.signal.throwIfAborted();
      const o = find(about);
      if (!o) return { ok: false, message: `Kite has no past order matching “${about}”. Offer to buy it as a new errand with do_task.` };
      return deps.start(o, ctx.scope ?? 'task');
    },
  });
}
