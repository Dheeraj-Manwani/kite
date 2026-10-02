// Repeat orders and learning (docs/end-to-end-jobs.md phase 5): the order history read back, "order my protein again" with
// one question, the price check, and "stop asking?" after three yeses. Scripted, through the real broker, tool session and
// TaskSession on Kite Test Mart's pages.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { orderValue, parseOrder, pastOrders, findOrder, lastOrderOf, sameItems, repeatTolerance } = require('../src/shared/orders.ts');
const { countYes, defaultPermissions } = require('../src/shared/permissions.ts');
const { reorder, reorderSummary } = require('../src/main/tools/impl/reorder.ts');
const { ApprovalBroker } = require('../src/main/tools/approval.ts');
const { ToolSession } = require('../src/main/tools/registry.ts');
const { TaskSession } = require('../src/main/agent/session.ts');
const { pages, harness, fullOrder } = require('./fixtures/checkout.cjs');

const whey = 'Sunfold Whey Protein, 60 sachets, Unflavoured';
const fact = (key, value, updated = 1) => ({ id: 1, kind: 'order', key, label: 'x', value, source: 'test', created: updated, updated, used: null });
const history = () => pastOrders([
  fact('order.a', orderValue({ items: ['VoltCell AA Batteries, Pack of 10'], total: '₹280', site: 'shop.example.in', payment: 'UPI', number: 'KTM-482800', when: 'tomorrow' }), 1),
  fact('order.b', orderValue({ items: [whey], total: '₹2,169', site: 'shop.example.in', payment: 'Cash on delivery', number: 'KTM-482901', when: 'in 3 days' }), 2),
]);

test('the order history is one readable line per order, read back by code', () => {
  const line = orderValue({ items: [whey, '2 × Sunfold Protein Bar, Pack of 6, Chocolate'], total: '₹2,889', site: 'shop.example.in', payment: 'UPI', number: 'KTM-1', when: 'in 3 days' });
  assert.equal(line, `${whey}; 2 × Sunfold Protein Bar, Pack of 6, Chocolate · ₹2,889 · shop.example.in · paid by UPI · order KTM-1 · arriving in 3 days`);
  assert.deepEqual(parseOrder(fact('order.x', line, 5)), { key: 'order.x', items: [whey, '2 × Sunfold Protein Bar, Pack of 6, Chocolate'], total: 2889, site: 'shop.example.in', payment: 'UPI', number: 'KTM-1', when: 'in 3 days', at: 5 });
  // Phase 4 wrote orders without the payment; they still read.
  assert.deepEqual(parseOrder(fact('order.y', `${whey} · ₹2,169 · 127.0.0.1:4410 · order KTM-482901 · arriving in 3 days`)).payment, null);
  assert.equal(parseOrder({ ...fact('order.z', 'nonsense'), kind: 'order' }), null); assert.equal(parseOrder({ ...fact('x', 'a · b.com'), kind: 'preference' }), null);
});

test('finding the order a phrase is about; the same item ignoring quantity; the same cart', () => {
  const orders = history();
  assert.equal(orders[0].key, 'order.b', 'newest first');
  assert.equal(findOrder(orders, 'my protein').key, 'order.b'); assert.equal(findOrder(orders, 'the batteries again').key, 'order.a');
  assert.equal(findOrder(orders, 'again').key, 'order.b', '"again" alone is the newest'); assert.equal(findOrder(orders, 'the usual').key, 'order.b');
  assert.equal(findOrder(orders, 'a birthday cake'), null); assert.equal(findOrder([], 'protein'), null);
  assert.equal(lastOrderOf(orders, whey).key, 'order.b'); assert.equal(lastOrderOf(orders, 'Sunfold Whey Protein, 30 sachets, Unflavoured'), null, 'another pack size is another item');
  assert.ok(sameItems([`1 × ${whey}`.replace('1 × ', '')], [whey])); assert.ok(!sameItems([whey, 'Butter'], [whey]));
  assert.equal(repeatTolerance(2169), 2169 * 1.1); assert.equal(repeatTolerance(280), 330, 'a small order tolerates a delivery fee');
});

test('the reorder card says what, how much, where, and how Kite will check out, in words written by code', () => {
  const o = history()[0];
  assert.equal(reorderSummary(o, false, 'your Home address'), `Same as last time: ${whey}, about ₹2,169, from shop.example.in, to your Home address? I’ll check out like last time, paying by Cash on delivery, and ask again only if the cart or the price has changed.`);
  assert.equal(reorderSummary(o, true, null), `Same as last time: ${whey}, about ₹2,169, from shop.example.in? I’ll add it to your cart and leave checkout to you.`);
  const started = [], tool = reorder({ orders: history, handsOver: () => false, address: () => null, start: (order, scope) => { started.push([order.key, scope]); return { ok: true, message: 'running' }; } });
  assert.equal(tool.approvalRequired, true);
  assert.equal(tool.summarize({ about: 'cake' }), 'I don’t have a past order for “cake”. Nothing will be ordered.');
  return tool.execute({ about: 'cake' }, { dryRun: false, signal: new AbortController().signal }).then(r => { assert.equal(r.ok, false); assert.match(r.message, /do_task/); assert.deepEqual(started, []); });
});

test('"stop asking?" is offered once, after the third yes for the same kind of step on the same site', () => {
  let records = [], offers = [];
  for (let i = 0; i < 5; i++) { const r = countYes(records, 'submit', 'shop.example.in'); records = r.records; offers.push(r.offer); }
  assert.deepEqual(offers, [false, false, true, false, false]);
  assert.equal(countYes(records, 'submit', 'other.example').offer, false, 'per site');
  assert.equal(countYes(records, 'send', 'shop.example.in').offer, false, 'per kind of step');
});

test('exit: "order my protein again" takes one question, on the card, then checks out and orders with no other', async () => {
  // The one question: the reorder card, through the real broker. The job it starts runs to the order with no other question.
  let h;
  const tool = reorder({ orders: history, handsOver: () => false, address: () => 'your Home address',
    start: order => {
      h = harness({ steps: fullOrder('Cash on delivery'), repeat: { site: order.site, items: order.items, total: order.total, payment: order.payment }, orders: history() });
      h.session.start(); return { ok: true, message: 'running' };
    } });
  const cards = [];
  const broker = new ApprovalBroker(card => { cards.push(card); setTimeout(() => broker.decide(card.approvalId, true)); }, () => {});
  const session = new ToolSession({ definitions: [tool], broker, audit: { beginTool: () => 1, finishTool: () => {}, recentTools: () => [] }, messageId: 1,
    context: { dryRun: false, signal: new AbortController().signal }, activity() {}, changed() {}, event() {} });
  assert.equal(await session.approve('c1', 'reorder', { about: 'my protein' }, true), true);
  await session.tools().reorder.execute({ about: 'my protein' }, { toolCallId: 'c1', messages: [] });
  assert.equal(cards.length, 1); assert.match(cards[0].summary, /^Same as last time: Sunfold Whey Protein, 60 sachets, Unflavoured, about ₹2,169/);
  await h.until(() => h.ended.length, 'ordered');
  assert.deepEqual(h.statuses().filter(s => s === 'asking' || s === 'approval'), [], 'no question in the job');
  assert.equal(h.ended[0].message, 'Ordered. Order number KTM-482901, ₹2,169, arriving in 3 days.');
  assert.ok(h.said.some(t => /Checking out like last time\.$/.test(t))); assert.ok(h.said.includes('Placing the order for ₹2,169, as you said.'));
  assert.equal(h.prompts[0].job.plan.site, 'shop.example.in');
});

// The review page at another price, with the same controls (so the scripted click's ref still points at Place order).
const pricier = total => () => pages.review('Cash on delivery', `₹${total.toLocaleString('en-IN')}`);

test('a repeat whose price moved asks again on the order card, saying by how much', async () => {
  const o = history()[0];
  const h = harness({ steps: fullOrder('Cash on delivery'), repeat: { site: o.site, items: o.items, total: o.total, payment: o.payment }, orders: history(), overrides: { review: pricier(2799) } });
  h.session.start();
  await h.until(() => h.view?.status === 'approval', 'asks');
  assert.equal(h.view.message, 'That’s ₹2,799; you said yes to about ₹2,169. Place the order for ₹2,799?');
  assert.ok(!h.statuses().includes('asking'), 'the checkout question was still covered');
  h.session.control('stop'); await h.until(() => h.ended.length, 'stops');
});

test('a repeat whose cart differs asks who checks out, as a new order would', async () => {
  const h = harness({ steps: fullOrder(), repeat: { site: 'shop.example.in', items: ['VoltCell AA Batteries, Pack of 10'], total: 280, payment: 'UPI' } });
  h.session.start();
  await h.until(() => h.view?.status === 'asking', 'asks');
  assert.match(h.view.message, /Do you want to check out yourself, or should I\?$/);
  h.session.choose(0); await h.until(() => h.ended.length, 'hands over');
});

test('the price check: far above the last order of the same item asks, even hands-off within the limit', async () => {
  const cheap = pastOrders([fact('order.c', orderValue({ items: [whey], total: '₹1,000', site: 'shop.example.in', number: 'KTM-1' }))]);
  const h = harness({ steps: fullOrder('Cash on delivery'), scope: 'handsOff', permissions: { ...defaultPermissions, spendLimit: 5000 }, orders: cheap });
  h.session.start();
  await h.until(() => h.view?.status === 'approval', 'asks');
  assert.equal(h.view.message, 'That’s ₹2,169, more than 1.5 times last time (₹1,000). Place the order for ₹2,169?');
  h.session.control('allow'); await h.until(() => h.ended.length, 'ordered');
  assert.match(h.ended[0].message, /^Ordered\./);
  const near = harness({ steps: fullOrder('Cash on delivery'), scope: 'handsOff', permissions: { ...defaultPermissions, spendLimit: 5000 }, orders: history() });
  near.session.start(); await near.until(() => near.ended.length, 'ordered');
  assert.ok(!near.statuses().includes('approval'), 'the same price as last time doesn’t ask');
});

test('in a task: after the third yes to the same kind of step there, Kite offers once to stop asking, and "yes" saves the rule', async () => {
  const app = { seq: 1, window: { hwnd: 3, title: 'Form - Microsoft Edge', process: 'msedge', pid: 4, rect: { x: 0, y: 0, width: 800, height: 600 }, foreground: true },
    layers: [{ layer: 1, title: 'Form', main: true }], elements: [{ ref: 0, name: 'Submit', role: 'Button', automationId: '', help: '', enabled: true, layer: 1, rect: { x: 0, y: 0, width: 40, height: 20 }, patterns: ['invoke'] }] };
  let records = []; const offered = [], remembered = [], views = [], ended = [];
  const queue = Array.from({ length: 4 }, () => ({ type: 'click', ref: 0 }));
  const session = new TaskSession(1, 'Submit it four times', 'Microsoft Edge', 'task', {
    windows: async () => [app.window], snapshot: async () => ({ ...app }), act: async () => ({ ok: true }), keys: async () => ({ ok: true }), launch: async () => false,
    decide: async () => queue.shift() ?? { type: 'done', summary: 'ok' }, displayOf: () => app.window.rect,
    emit: v => { views.push(v); if (v?.status === 'approval') setTimeout(() => session.control('allow')); }, say: () => {}, audit: () => {}, finished: (m, s) => ended.push(s),
    remember: (...a) => remembered.push(a),
    nudge: { yes: (c, place) => { const r = countYes(records, c, place); records = r.records; return r.offer; }, offered: (...a) => offered.push(a) },
  }, false, 15, { pointMs: 0, settleMs: 0, retryMs: 1, launchMs: 3000, wallMs: 60000, lingerMs: 5, rateRetries: 4, rateMaxMs: 5 });
  session.start();
  for (let i = 0; i < 400 && !ended.length; i++) await new Promise(r => setTimeout(r, 5));
  const asked = [...new Set(views.filter(v => v?.status === 'approval').map(v => v.message))];
  assert.deepEqual(asked.filter(m => /Stop asking/.test(m)), ['That’s 3 times you’ve said yes to “Submit” on msedge. Stop asking about those there?']);
  assert.deepEqual(remembered, [['submit', 'allow', 'app:msedge']]); assert.deepEqual(offered, [['submit', 'app:msedge', true]]);
});
