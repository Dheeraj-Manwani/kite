// Kite Test Mart's checkout pages as the task sidecar lists them, and a scripted TaskSession that walks them: shared by
// the checkout (phase 4) and repeat-order (phase 5) tests.
const assert = require('node:assert/strict');
const { buildPlan } = require('../../src/shared/job.ts');
const { defaultPermissions } = require('../../src/shared/permissions.ts');
const { TaskSession } = require('../../src/main/agent/session.ts');

let nextRef = 0;
const at = (y, name, role, extra = {}) => ({ ref: nextRef++, name, role, automationId: '', help: '', enabled: true, layer: 1, rect: { x: 60, y, width: 300, height: 20 }, patterns: ['invoke'], ...extra });
function page(url, items, title) {
  nextRef = 0;
  const elements = [at(48, 'Back', 'Button'), at(88, 'Address and search bar', 'Edit', { value: url.replace(/^https:\/\//, '') }),
    { ...at(120, title, 'Document', { value: url, readOnly: true }), rect: { x: 50, y: 120, width: 1300, height: 860 } }];
  let y = 140;
  for (const [name, role, extra] of items) elements.push(at(y += 22, name, role, extra));
  return { seq: 1, window: { hwnd: 7, title: `${title} - Microsoft Edge`, process: 'msedge', pid: 9, rect: { x: 0, y: 0, width: 1400, height: 1000 }, foreground: true }, layers: [{ layer: 1, title, main: true }], elements };
}
const base = 'https://shop.example.in';
const pages = {
  cart: () => page(`${base}/cart`, [['Shopping cart', 'Text'], ['Sunfold Whey Protein, 60 sachets, Unflavoured', 'Hyperlink'], ['₹2,149', 'Text'], ['Quantity for Sunfold Whey Protein', 'ComboBox', { value: '1' }],
    ['Remove', 'Button'], ['Subtotal (1 item): ', 'Text'], ['₹2,149', 'Text'], ['Proceed to checkout', 'Button']], 'Cart'),
  address: () => page(`${base}/checkout/address`, [['Choose a delivery address', 'Text'], ['Saved addresses', 'Text'], ['Asha K, Flat 12, Baner Road, Pune 411045', 'RadioButton', { selected: true }], ['Deliver to this address', 'Button']], 'Delivery address'),
  delivery: () => page(`${base}/checkout/delivery`, [['Choose a delivery option', 'Text'], ['Standard delivery, arrives in 3 days, free', 'RadioButton', { selected: true }], ['Express delivery, arrives tomorrow, ₹49', 'RadioButton'], ['Continue', 'Button']], 'Delivery'),
  payment: () => page(`${base}/checkout/payment`, [['Select a payment method', 'Text'], ['Order total: ', 'Text'], ['₹2,169', 'Text'], ['UPI', 'RadioButton', { selected: true }], ['Cash on delivery', 'RadioButton'], ['Continue', 'Button']], 'Payment'),
  review: (pay = 'UPI', total = '₹2,169') => page(`${base}/checkout/review`, [['Review your order', 'Text'], ['Sunfold Whey Protein, 60 sachets, Unflavoured', 'Text'], ['Deliver to: Asha K, Flat 12, Baner Road, Pune 411045', 'Text'],
    [`Delivery: Standard delivery · Payment: ${pay}`, 'Text'], ['Items: ₹2,149 · Delivery: free · ', 'Text'], [`Order total: ${total}`, 'Text'], ['Place order', 'Button']], 'Review your order'),
  pending: () => page(`${base}/order/KTM-482901`, [['Complete your payment', 'Text'], ['Approve the payment request in your UPI app. This page updates by itself.', 'Text'], ['Amount: ₹2,169 · Order KTM-482901 is not placed until the payment is approved.', 'Text']], 'Complete your payment'),
  placed: () => page(`${base}/order/KTM-482901`, [['Order placed, thank you!', 'Text'], ['Order number ', 'Text'], ['KTM-482901', 'Text'], ['Arriving in 3 days · Delivering to Asha K, Pune 411045', 'Text'], ['Order total: ', 'Text'], ['₹2,169', 'Text'], ['Your orders', 'Hyperlink']], 'Order placed'),
};
const ref = (p, name) => p.elements.find(e => e.name === name).ref;
const timing = { pointMs: 0, settleMs: 0, retryMs: 1, launchMs: 3000, wallMs: 60000, lingerMs: 5, rateRetries: 4, rateMaxMs: 5, pollMs: 5, payMs: 2000 };

/**
 * A scripted checkout. `steps` are the model's decisions, each with the page it acts on and the page its click leads to.
 * While the pending page shows, it turns into the placed page after `pendingReads` looks (the user approving the payment).
 */
function harness({ steps, scope = 'task', permissions = defaultPermissions, pendingReads = 3, user = () => {}, repeat = null, orders = [], nudge, overrides = {} }) {
  const h = { views: [], said: [], acts: [], audits: [], ended: [], prompts: [], remembered: [], ordered: [], current: 'cart', reads: 0 };
  const queue = [...steps];
  let after = null;
  const deps = {
    windows: async () => [pages.cart().window],
    snapshot: async () => {
      if (h.current === 'pending' && ++h.reads > pendingReads) h.current = 'placed';
      return { ...(overrides[h.current] ?? pages[h.current])(), seq: 1 };
    },
    act: async (s, r, action) => { h.acts.push({ page: h.current, ref: r, action }); if (after) { h.current = after; after = null; } return { ok: true, via: 'invoke' }; },
    keys: async () => ({ ok: true }), launch: async () => false,
    plan: async () => buildPlan('store', 'shop.example.in', 'sunfold whey'),
    decide: async prompt => {
      h.prompts.push(prompt);
      const next = queue.shift(); if (!next) return { type: 'fail', reason: 'out of decisions' };
      if (next.on) h.current = next.on;
      after = next.then ?? null;
      return next.decision;
    },
    displayOf: () => ({ x: 0, y: 0, width: 1920, height: 1080 }),
    emit: v => { h.views.push(v); if (v) user(v, h); }, say: t => h.said.push(t),
    audit: (type, summary, decision, result) => h.audits.push({ type, summary, decision, ok: result.ok }),
    finished: (message, status) => h.ended.push({ message, status }),
    permissions: () => permissions,
    remember: (...args) => h.remembered.push(args),
    memory: { context: () => '', redact: t => t, fill: t => ({ text: t, missing: [] }), learn: () => {}, chose: () => {}, ordered: o => h.ordered.push(o), orders: () => orders },
    repeat, nudge,
  };
  h.session = new TaskSession(1, 'Buy Sunfold Whey Protein, 60 sachets, unflavoured', 'Microsoft Edge', scope, deps, false, 15, timing);
  Object.defineProperty(h, 'view', { get: () => h.views.filter(Boolean).at(-1) });
  h.statuses = () => h.views.filter(Boolean).map(v => v.status);
  h.until = async (predicate, label) => { for (let i = 0; i < 600 && !predicate(); i++) await new Promise(r => setTimeout(r, 5)); assert.ok(predicate(), label + ': ' + JSON.stringify(h.view)); };
  return h;
}
const click = (p, name, then) => ({ on: p, decision: { type: 'click', ref: ref(pages[p](), name) }, then });
const fullOrder = (pay = 'UPI') => [{ on: 'cart', decision: { type: 'done', summary: 'It is in the cart.' } },
  click('cart', 'Proceed to checkout', 'address'), click('address', 'Deliver to this address', 'delivery'), click('delivery', 'Continue', 'payment'),
  click('payment', 'Continue', 'review'), { on: 'review', decision: { type: 'click', ref: ref(pages.review(pay), 'Place order') }, then: pay === 'UPI' ? 'pending' : 'placed' }];

module.exports = { page, pages, ref, timing, harness, click, fullOrder, base };
