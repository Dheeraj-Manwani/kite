// Kite checks out (docs/end-to-end-jobs.md phase 4): who checks out, the checkout steps under "you do it", the Place order
// card with what code read from the page, the payment handoff, and the order confirmation, through a real TaskSession on
// Kite Test Mart's pages, scripted.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { orderSummary, readOrder, paymentPending, matchCheckout, placesOrder } = require('../src/shared/job.ts');
const { classifyStep, classifyTaskCommand } = require('../src/shared/agent.ts');
const { defaultPermissions, resolve, withCategory, jobCategories } = require('../src/shared/permissions.ts');
const { factsFromAnswer } = require('../src/shared/memory.ts');

const { page, pages, ref, harness, fullOrder, base } = require('./fixtures/checkout.cjs');

test('Balanced: "you do it" checks out without a question per step, confirms Place order on its card, waits for the UPI approval, and reads the order back', async () => {
  const h = harness({ steps: fullOrder() });
  h.session.start();
  await h.until(() => h.view?.status === 'asking', 'asks who checks out');
  assert.equal(h.view.message, 'It’s in your cart: Sunfold Whey Protein, 60 sachets, Unflavoured, ₹2,149. The subtotal is ₹2,149. Do you want to check out yourself, or should I?');
  h.session.choose(1, true);
  await h.until(() => h.view?.status === 'approval', 'the order card');
  assert.deepEqual(h.remembered, [['money', 'allow', 'shop.example.in']], '"Remember for this site"');
  assert.equal(h.view.message, 'Place the order for ₹2,169?');
  assert.deepEqual(h.view.job.order, { total: '₹2,169', address: 'Asha K, Flat 12, Baner Road, Pune 411045', payment: 'UPI', delivery: 'Standard delivery' });
  assert.equal(h.said.at(-1), 'Place the order for ₹2,169, paying by UPI? The address is on the card. Say yes or no.', 'the address is shown, not spoken');
  assert.equal(h.view.ask, null, 'no "Always" for placing an order');
  assert.deepEqual(h.acts.map(a => a.page), ['cart', 'address', 'delivery', 'payment'], 'checkout ran without asking');
  assert.equal(h.statuses().filter(s => s === 'approval').length > 0 && new Set(h.views.filter(v => v?.status === 'approval').map(v => v.step)).size, 1, 'one confirmation in all');
  h.session.command('yes');
  await h.until(() => h.view?.status === 'waiting', 'waits for the payment');
  assert.equal(h.view.message, 'Approve the payment request in your UPI app. I’ll wait.');
  const steps = h.view.step;
  await h.until(() => h.ended.length, 'ordered');
  assert.deepEqual(h.ended[0], { message: 'Ordered. Order number KTM-482901, ₹2,169, arriving in 3 days.', status: 'done' });
  assert.equal(h.view.step, steps, 'waiting costs no steps and no model calls'); assert.equal(h.prompts.length, 6);
  assert.deepEqual(h.ordered, [{ number: 'KTM-482901', items: ['Sunfold Whey Protein, 60 sachets, Unflavoured'], total: '₹2,169', site: 'shop.example.in', when: 'in 3 days', payment: 'UPI' }]);
  assert.deepEqual(h.view.job.phases.map(p => p.state), ['done', 'done', 'done', 'done', 'done']);
  assert.match(h.prompts[1].history.join('\n'), /The user asked Kite to check out/); assert.equal(h.prompts[1].job.plan.phases[h.prompts[1].job.phase].id, 'checkout');
  assert.ok(h.audits.some(a => a.summary === 'Click “Place order” button' && a.decision === 'approved'));
});

test('Hands-off under the limit: no question and no card; cash on delivery is ordered at once', async () => {
  const h = harness({ steps: fullOrder('Cash on delivery'), scope: 'handsOff', permissions: { ...defaultPermissions, spendLimit: 5000 } });
  h.session.start(); await h.until(() => h.ended.length, 'ordered');
  assert.ok(!h.statuses().some(s => s === 'approval' || s === 'asking' || s === 'waiting'), JSON.stringify(h.statuses()));
  assert.equal(h.ended[0].message, 'Ordered. Order number KTM-482901, ₹2,169, arriving in 3 days.');
  assert.ok(h.said.some(t => /Checking out now\.$/.test(t))); assert.ok(h.said.includes('Placing the order for ₹2,169.'));
});

test('Hands-off above the limit still shows the order card; "no" leaves the order for the user', async () => {
  const steps = [...fullOrder().slice(0, -1), { on: 'review', decision: { type: 'click', ref: ref(pages.review(), 'Place order') } }, { on: 'review', decision: { type: 'done', summary: 'Left it.' } }];
  const h = harness({ steps, scope: 'handsOff', permissions: { ...defaultPermissions, spendLimit: 1000 } });
  h.session.start();
  await h.until(() => h.view?.status === 'approval', 'the order card');
  assert.equal(h.view.risk, 'This may spend money: the total here is ₹2,169, above your limit of ₹1,000.');
  h.session.control('skip');
  await h.until(() => h.ended.length, 'ends');
  assert.ok(!h.acts.some(a => a.page === 'review'), 'never placed');
  assert.match(h.prompts.at(-1).history.join('\n'), /doesn’t want Kite to place the order\. Call done now/);
  assert.equal(h.ended[0].message, 'I stopped before placing the order. It’s ready for you on screen.');
});

test('who checks out follows the settings: Don’t allow hands over, a site rule of Allow doesn’t ask, "I’ll do it" by voice hands over', async () => {
  const never = harness({ steps: fullOrder(), permissions: withCategory(defaultPermissions, 'money', 'never') });
  never.session.start(); await never.until(() => never.ended.length, 'ends');
  assert.match(never.ended[0].message, /Check out whenever you’re ready; I’ll leave that to you\.$/); assert.ok(!never.statuses().includes('asking'));
  const rule = harness({ steps: fullOrder(), permissions: { ...defaultPermissions, rules: [{ place: 'shop.example.in', category: 'money', permission: 'allow' }] } });
  rule.session.start(); await rule.until(() => rule.view?.status === 'approval', 'goes straight to the order card');
  assert.ok(!rule.statuses().includes('asking')); rule.session.control('stop'); await rule.until(() => rule.ended.length, 'stops');
  assert.equal(rule.ended[0].message, 'Okay, I stopped. Nothing was ordered.');
  const voice = harness({ steps: fullOrder() });
  voice.session.start(); await voice.until(() => voice.view?.status === 'asking', 'asks');
  assert.equal(voice.session.command('I’ll do it myself, always'), 'Okay, it’s all yours.');
  await voice.until(() => voice.ended.length, 'ends');
  assert.deepEqual(voice.remembered, [['money', 'never', 'shop.example.in']]);
  assert.equal(voice.acts.length, 0);
});

test('the payment handoff: "I’ve paid" looks again at once; a payment never approved ends without claiming an order', async () => {
  const h = harness({ steps: fullOrder(), pendingReads: Infinity, user: (v, hh) => { if (v.status === 'asking') setTimeout(() => hh.session.choose(1)); if (v.status === 'approval') setTimeout(() => hh.session.control('allow')); } });
  h.session.start();
  await h.until(() => h.view?.status === 'waiting', 'waits');
  h.session.userTookOver(); assert.equal(h.view.status, 'waiting', 'the user acting is expected now, not a takeover');
  const reads = h.reads;
  assert.equal(h.session.command('I’ve paid'), 'Let me check.');
  await h.until(() => h.said.includes('The page still says the payment is pending. I’ll keep watching.'), 'says it is still pending');
  assert.ok(h.reads > reads);
  await h.until(() => h.ended.length, 'gives up after the wait');
  assert.deepEqual(h.ended[0], { message: 'I couldn’t confirm the order went through. Check your orders page before you pay again.', status: 'failed' });
  assert.deepEqual(h.ordered, []);
});

test('readers: the order summary, the confirmation, a pending payment, the order button, and spoken answers', () => {
  assert.deepEqual(orderSummary(pages.review()), { total: '₹2,169', address: 'Asha K, Flat 12, Baner Road, Pune 411045', payment: 'UPI', delivery: 'Standard delivery' });
  assert.deepEqual(readOrder(pages.placed()), { number: 'KTM-482901', total: '₹2,169', when: 'in 3 days' });
  assert.equal(readOrder(pages.pending()), null, 'a pending payment is never an order');
  assert.equal(readOrder(pages.review()), null);
  const amazon = page('https://www.amazon.in/gp/buy/thankyou', [['Order placed, thanks!', 'Text'], ['Order # 403-1234567-1234567', 'Text'], ['Arriving Friday', 'Text']], 'Thank you');
  assert.deepEqual(readOrder(amazon), { number: '403-1234567-1234567', total: null, when: 'Friday' });
  assert.equal(paymentPending(pages.pending()), 'Approve the payment request in your UPI app. I’ll wait.');
  assert.equal(paymentPending(page(`${base}/order/x`, [['Enter the OTP sent to your phone on your bank’s page to finish paying.', 'Text']], 'Pay')), 'Enter the OTP from your bank on the payment page. I’ll wait.');
  assert.equal(paymentPending(pages.placed()), null);
  for (const label of ['Place order', 'Place your order', 'Pay ₹2,169', 'Pay now', 'Confirm order', 'Click to Pay ₹2,169', 'Buy Now']) assert.ok(placesOrder.test(label), label);
  for (const label of ['Continue', 'Deliver to this address', 'Proceed to checkout', 'Use this payment method', 'Payment options']) assert.ok(!placesOrder.test(label), label);
  for (const [s, who] of [['You do it', 'kite'], ['go ahead', 'kite'], ['yes please', 'kite'], ['I’ll do it', 'me'], ['let me do it myself', 'me'], ['no thanks', 'me']]) assert.equal(matchCheckout(s).who, who, s);
  assert.equal(matchCheckout('hmm'), null); assert.equal(matchCheckout('you do it, always').remember, true);
  for (const s of ['I’ve paid', 'done', 'paid', 'approved']) assert.equal(classifyTaskCommand(s), 'resume', s);
});

test('the corpus rule holds on the fake shop: the payment page’s "Continue" is Spend money and asks, until the user says "you do it"', () => {
  const p = pages.payment(), element = p.elements.find(e => e.name === 'Continue');
  const step = classifyStep({ type: 'click', ref: element.ref }, { element, process: 'msedge', title: '', dialogText: '', url: `${base}/checkout/payment`, phase: 'cart' });
  assert.equal(step.category, 'money');
  for (const mode of ['ask', 'balanced', 'handsOff']) assert.notEqual(resolve(step, { ...defaultPermissions, mode }, { place: 'shop.example.in', amount: 2169, allowed: jobCategories.store }).permission, 'allow', mode);
});

test('address forms: each field asked for is learned under its own placeholder', () => {
  const keys = (q, a) => factsFromAnswer(q, a, 't').map(f => `${f.key}=${f.value}`);
  assert.deepEqual(keys('What is your flat or house number and building?', 'Flat 12, Green Park'), ['home.line1=Flat 12, Green Park']);
  assert.deepEqual(keys('Which area or street?', 'Baner Road'), ['home.line2=Baner Road']);
  assert.deepEqual(keys('Any landmark?', 'Near the bakery'), ['home.landmark=Near the bakery']);
  assert.deepEqual(keys('Which state?', 'Maharashtra'), ['home.state=Maharashtra']);
  assert.deepEqual(keys('What is the pincode of your area?', '411045'), ['home.pincode=411045'], 'pincode wins over "area"');
});
