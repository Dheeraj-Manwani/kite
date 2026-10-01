// Permissions and modes (docs/end-to-end-jobs.md phase 2, ADR 014): the resolver for every category × mode × floor rule,
// remembering "always" and "never", validation, the checkout corpus, the page total, the jobs model, and whole tasks and
// jobs through a real TaskSession.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { categories, presets, defaultPermissions, resolve, remember, withCategory, validPermissions, placeOf, ruleFor, permissionTable, jobCategories, askingPromise } = require('../src/shared/permissions.ts');
const { classifyStep, classifyTaskCommand, jobsModel, defaultJobsModel } = require('../src/shared/agent.ts');
const { buildPlan, pageTotal } = require('../src/shared/job.ts');
const { TaskSession } = require('../src/main/agent/session.ts');
const { agentSystem } = require('../src/main/agent/model.ts');
const { doTask } = require('../src/main/tools/impl/do_task.ts');
const { ApprovalBroker } = require('../src/main/tools/approval.ts');
const { ToolSession } = require('../src/main/tools/registry.ts');

const routine = c => ({ category: c, reason: '' });
const settings = (patch = {}) => ({ ...defaultPermissions, custom: { ...defaultPermissions.custom }, rules: [], ...patch });

test('modes: every category in every preset, Balanced by default, and Custom uses its own table', () => {
  const want = {
    ask: { look: 'ask', fill: 'ask', add: 'ask', saved: 'ask', submit: 'ask', send: 'ask', money: 'ask', delete: 'ask', system: 'ask' },
    balanced: { look: 'allow', fill: 'allow', add: 'allow', saved: 'allow', submit: 'ask', send: 'ask', money: 'ask', delete: 'ask', system: 'ask' },
    handsOff: { look: 'allow', fill: 'allow', add: 'allow', saved: 'allow', submit: 'allow', send: 'allow', money: 'allow', delete: 'allow', system: 'allow' },
  };
  assert.deepEqual(presets, want);
  assert.equal(defaultPermissions.mode, 'balanced'); assert.equal(defaultPermissions.spendLimit, 0, 'every payment asks until the limit is raised');
  // Below the limit, with the amount known and inside the job: the table decides, row by row.
  for (const mode of ['ask', 'balanced', 'handsOff']) for (const c of categories) {
    const r = resolve(routine(c), settings({ mode, spendLimit: 5000 }), { place: 'shop.example.in', amount: 100 });
    assert.equal(r.permission, want[mode][c], `${mode} × ${c}`);
    assert.equal(r.floor, false, `${mode} × ${c}: no floor`);
  }
  const custom = withCategory(settings(), 'send', 'never');
  assert.equal(custom.mode, 'custom'); assert.equal(custom.custom.send, 'never'); assert.equal(custom.custom.look, 'allow', 'starts from the current table');
  assert.equal(resolve(routine('send'), custom, { place: null }).permission, 'never');
  assert.equal(withCategory(settings({ mode: 'handsOff' }), 'money', 'ask').custom.submit, 'allow', 'from Hands-off, the rest stays hands-off');
});

test('Don’t allow is never, in every mode and whatever the job’s start choice, and says why in code’s words', () => {
  const s = withCategory(settings(), 'send', 'never');
  for (const override of [null, 'handsOff', 'stepByStep']) {
    const r = resolve({ category: 'send', reason: 'Send button may send.' }, s, { place: 'mail.example.com', override });
    assert.deepEqual([r.permission, r.reason], ['never', 'Your settings say I don’t send things as you.'], String(override));
  }
});

test('the job’s start choice: hands-off allows what asked, step by step asks what was allowed', () => {
  for (const c of categories.filter(c => c !== 'money')) {
    assert.equal(resolve(routine(c), settings(), { place: null, override: 'handsOff' }).permission, 'allow', c);
    assert.equal(resolve(routine(c), settings(), { place: null, override: 'stepByStep' }).permission, 'ask', c);
  }
  const r = resolve(routine('fill'), settings(), { place: null, override: 'stepByStep' });
  assert.deepEqual([r.base, r.floor], ['allow', false], '"Always" would change nothing here; the card knows from base');
});

test('the floor asks in every mode: commands, steps outside the job, money above the limit or of unknown amount', () => {
  const handsOff = settings({ mode: 'handsOff', spendLimit: 2000 });
  const command = resolve({ category: 'system', reason: 'This is a terminal.', floor: 'command' }, handsOff, { place: 'app:powershell' });
  assert.deepEqual([command.permission, command.floor, command.reason], ['ask', true, 'This is a terminal.']);
  const outside = resolve(routine('send'), handsOff, { place: 'shop.example.in', allowed: jobCategories.store });
  assert.deepEqual([outside.permission, outside.floor], ['ask', true]); assert.match(outside.reason, /send things as you, which isn’t part of this job/);
  assert.equal(resolve(routine('delete'), handsOff, { place: 'shop.example.in', allowed: jobCategories.store }).permission, 'allow', 'emptying a cart is part of shopping');
  assert.equal(resolve(routine('money'), handsOff, { place: 'shop.example.in', amount: 1999 }).permission, 'allow', 'under the limit');
  assert.equal(resolve(routine('money'), handsOff, { place: 'shop.example.in', amount: 2000 }).permission, 'allow', 'at the limit');
  const above = resolve(routine('money'), handsOff, { place: 'shop.example.in', amount: 2169 });
  assert.deepEqual([above.permission, above.floor, above.reason], ['ask', true, 'This may spend money: the total here is ₹2,169, above your limit of ₹2,000.']);
  const unknown = resolve(routine('money'), handsOff, { place: 'shop.example.in', amount: null });
  assert.deepEqual([unknown.permission, unknown.floor], ['ask', true]); assert.match(unknown.reason, /can’t read the total/);
  assert.equal(resolve(routine('money'), settings({ mode: 'handsOff' }), { place: null, amount: 1 }).permission, 'ask', 'the default limit, ₹0, asks for every payment');
  const secret = resolve({ category: 'fill', reason: 'This types into a password field.', floor: 'secret' }, handsOff, { place: null, override: 'handsOff' });
  assert.deepEqual([secret.permission, secret.floor], ['never', true], 'secrets are never typed, not even hands-off');
});

test('rules per site and app: the most specific place wins, subdomains count, look-alikes don’t', () => {
  assert.equal(placeOf('shop.example.in', 'msedge'), 'shop.example.in');
  assert.equal(placeOf(null, 'Notepad.exe'), 'app:notepad'); assert.equal(placeOf(null, ''), null); assert.equal(placeOf('not a host', null), null);
  let s = remember(settings(), 'money', 'never', 'example.in');
  s = remember(s, 'money', 'allow', 'shop.example.in');
  assert.equal(ruleFor(s, 'money', 'shop.example.in').permission, 'allow');
  assert.equal(ruleFor(s, 'money', 'm.shop.example.in').permission, 'allow', 'subdomain of the most specific rule');
  assert.equal(ruleFor(s, 'money', 'other.example.in').permission, 'never');
  assert.equal(ruleFor(s, 'money', 'evilexample.in'), null);
  assert.equal(ruleFor(s, 'send', 'shop.example.in'), null, 'per category');
  assert.equal(resolve(routine('submit'), remember(settings(), 'submit', 'allow', 'app:notepad'), { place: 'app:notepad' }).permission, 'allow');
  assert.equal(remember(remember(settings(), 'add', 'allow', 'a.com'), 'add', 'never', 'a.com').rules.length, 1, 'one rule per place and category');
  const everywhere = remember(remember(settings(), 'submit', 'never', 'a.com'), 'submit', 'allow', null);
  assert.deepEqual([everywhere.mode, everywhere.custom.submit, everywhere.rules.length], ['custom', 'allow', 0], '"always, everywhere" replaces rules that said otherwise');
  assert.equal(remember(settings(), 'money', 'allow', 'shop.example.in').mode, 'balanced', 'a site rule keeps the mode');
});

test('settings from the renderer are validated strictly', () => {
  assert.deepEqual(validPermissions(defaultPermissions), defaultPermissions);
  const good = remember(withCategory(settings({ spendLimit: 1500.4 }), 'send', 'never'), 'money', 'allow', 'shop.example.in');
  assert.equal(validPermissions(good).spendLimit, 1500);
  for (const bad of [null, [], 'balanced', { ...good, mode: 'yolo' }, { ...good, spendLimit: -1 }, { ...good, spendLimit: Infinity }, { ...good, spendLimit: 1e9 },
    { ...good, extra: 1 }, { ...good, custom: { ...good.custom, look: 'sometimes' } }, { ...good, custom: { look: 'allow' } },
    { ...good, rules: [{ place: 'javascript:alert(1)', category: 'money', permission: 'allow' }] }, { ...good, rules: [{ place: 'a.com', category: 'teleport', permission: 'allow' }] },
    { ...good, rules: [{ place: 'a.com', category: 'money', permission: 'allow', note: 'x' }] }, { ...good, rules: Array.from({ length: 101 }, () => good.rules[0]) }])
    assert.equal(validPermissions(bad), null, JSON.stringify(bad)?.slice(0, 80));
});

// The checkout corpus: the money steps of five checkout flows (Amazon.in, Flipkart, BigBasket, Amul's store, Swiggy
// Instamart), plus Kite Test Mart's own. The five stores' button labels and paths are as those stores commonly word them,
// written down by hand, not captured from live pages: replace them with `npm run measure:web -- <url>` captures when a
// person can walk a real checkout. The rule: none may come out as allowed with the default spend limit.
const corpus = [
  ['www.amazon.in/gp/cart/view.html', 'Proceed to Buy', 'Button'], ['www.amazon.in/gp/buy/addressselect/handlers/display.html', 'Use this address', 'Button'],
  ['www.amazon.in/gp/buy/payselect/handlers/display.html', 'Use this payment method', 'Button'], ['www.amazon.in/gp/buy/spc/handlers/display.html', 'Place your order', 'Button'],
  ['www.amazon.in/dp/B0EXAMPLE', 'Buy Now', 'Button'],
  ['www.flipkart.com/viewcart', 'Place Order', 'Button'], ['www.flipkart.com/checkout/init', 'Deliver Here', 'Button'], ['www.flipkart.com/checkout/init', 'Continue', 'Button'],
  ['www.flipkart.com/checkout/init', 'Accept & Continue', 'Button'], ['www.flipkart.com/payments', 'Pay ₹2,169', 'Button'],
  ['www.bigbasket.com/basket/', 'Checkout', 'Button'], ['www.bigbasket.com/checkout/', 'Proceed to Payment', 'Button'], ['www.bigbasket.com/checkout/', 'Continue', 'Button'],
  ['shop.amul.com/en/cart', 'Proceed to Checkout', 'Button'], ['shop.amul.com/en/checkout', 'Next', 'Button'], ['shop.amul.com/en/checkout', 'Place Order', 'Button'],
  ['www.swiggy.com/instamart/checkout', 'Proceed to Pay', 'Button'], ['www.swiggy.com/instamart/checkout', 'Click to Pay ₹2,169', 'Button'], ['www.swiggy.com/checkout', 'Proceed', 'Button'],
  ['shop.example.in/cart', 'Proceed to checkout', 'Button'], ['shop.example.in/checkout/address', 'Deliver to this address', 'Button'],
  ['shop.example.in/checkout/address', 'Save address and continue', 'Button'], ['shop.example.in/checkout/delivery', 'Continue', 'Button'],
  ['shop.example.in/checkout/payment', 'Continue', 'Button'], ['shop.example.in/checkout/review', 'Place order', 'Button'],
];
test('checkout corpus: every money step is Spend money, and none is allowed in any mode with the default limit', () => {
  const el = (name, role) => ({ ref: 1, name, role, automationId: '', help: '', enabled: true, layer: 1, rect: { x: 0, y: 0, width: 80, height: 20 }, patterns: ['invoke'] });
  for (const [url, name, role] of corpus) {
    const step = classifyStep({ type: 'click', ref: 1 }, { element: el(name, role), process: 'msedge', title: 'Checkout - Microsoft Edge', dialogText: '', url: `https://${url}`, phase: 'cart' });
    assert.equal(step.category, 'money', `${name} on ${url}`);
    for (const mode of ['ask', 'balanced', 'handsOff']) for (const override of [null, 'handsOff']) for (const amount of [null, 2169]) {
      const r = resolve(step, settings({ mode }), { place: url.split('/')[0].replace(/^www\./, ''), amount, override, allowed: jobCategories.store });
      assert.notEqual(r.permission, 'allow', `${mode}/${override}/${amount}: ${name} on ${url}`);
    }
  }
  // And the steps around them stay ordinary: browsing a checkout's options is filling in, and nothing here sends.
  const el2 = el('Cash on Delivery', 'RadioButton');
  assert.equal(classifyStep({ type: 'click', ref: 1 }, { element: el2, process: 'msedge', title: '', dialogText: '', url: 'https://shop.example.in/checkout/payment' }).category, 'fill');
});

test('the total the user would pay is read from the page by code, best label first', () => {
  const at = (name, role, i) => ({ ref: i, name, role, automationId: '', help: '', enabled: true, layer: 1, rect: { x: 60, y: 140 + i * 22, width: 300, height: 20 }, patterns: [] });
  const snap = (url, items) => ({ seq: 1, window: { hwnd: 1, title: 'x', process: 'msedge', pid: 1, rect: { x: 0, y: 0, width: 1400, height: 1000 } }, layers: [{ layer: 1, title: 'x', main: true }],
    elements: [{ ...at('Page', 'Document', 0), value: url, rect: { x: 50, y: 120, width: 1300, height: 860 } }, ...items.map(([n, r], i) => at(n, r, i + 1))] });
  assert.equal(pageTotal(snap('https://shop.example.in/checkout/review', [['Items: ₹2,149 · Delivery: ₹20 · ', 'Text'], ['Order total: ₹2,169', 'Text'], ['Place order', 'Button']])), 2169);
  assert.equal(pageTotal(snap('https://shop.example.in/checkout/payment', [['Select a payment method', 'Text'], ['Order total: ', 'Text'], ['₹2,169', 'Text']])), 2169, 'the price can follow its label');
  assert.equal(pageTotal(snap('https://shop.example.in/cart', [['Subtotal (3 items): ', 'Text'], ['₹2,869', 'Text'], ['Grand total', 'Text'], ['₹2,889', 'Text']])), 2889, 'a grand total beats a subtotal');
  assert.equal(pageTotal(snap('https://shop.example.in/cart', [['Subtotal (3 items): ', 'Text'], ['₹2,869', 'Text']])), 2869);
  assert.equal(pageTotal(snap('https://shop.example.in/p/1', [['Sunfold Whey', 'Text'], ['₹2,149', 'Text'], ['Add to cart', 'Button']])), null, 'a price alone is not a total');
});

test('voice: "always" and "never", here or everywhere', () => {
  for (const [s, want] of [['always', 'always'], ['Always allow that.', 'always'], ['always do it on this site', 'always'], ['always allow it everywhere', 'alwaysEverywhere'],
    ['never', 'never'], ['Never do that', 'never'], ['never do that here', 'never'], ['never allow that everywhere', 'neverEverywhere'],
    ["don't ask again", 'allowAll'], ['yes', 'allow'], ['always buy me shoes', 'new-request']]) assert.equal(classifyTaskCommand(s), want, s);
});

test('the jobs model: the setting, else DeepSeek Flash with its key, else the main model', () => {
  const models = [{ provider: 'moonshot', id: 'kimi-k2.6', label: 'Kimi K2.6', supportsVision: true, supportsTools: true, tier: 'fast' },
    { provider: 'deepseek', id: 'deepseek-flash', label: 'DeepSeek Flash', supportsVision: true, supportsTools: true, tier: 'fast' },
    { provider: 'anthropic', id: 'claude-sonnet-5', label: 'Claude Sonnet 5', supportsVision: true, supportsTools: true, tier: 'fast' }];
  const main = { provider: 'moonshot', id: 'kimi-k2.6' }, keys = (...ids) => p => ids.includes(p);
  assert.deepEqual(defaultJobsModel, { provider: 'deepseek', id: 'deepseek-flash' });
  assert.equal(jobsModel({ model: main, jobsModel: null }, models, keys('moonshot', 'deepseek')).label, 'DeepSeek Flash');
  assert.equal(jobsModel({ model: main, jobsModel: null }, models, keys('moonshot')).label, 'Kimi K2.6');
  assert.equal(jobsModel({ model: main, jobsModel: { provider: 'anthropic', id: 'claude-sonnet-5' } }, models, keys('moonshot', 'deepseek', 'anthropic')).label, 'Claude Sonnet 5');
  assert.equal(jobsModel({ model: main, jobsModel: { provider: 'anthropic', id: 'claude-sonnet-5' } }, models, keys('moonshot')).label, 'Kimi K2.6', 'a chosen model without its key falls back');
});

test('do_task’s summary promises what the mode does; the approval card can start hands-off for this job', async () => {
  let mode = 'balanced';
  const started = [], tool = doTask((task, scope) => { started.push(scope); return { ok: true, message: 'running' }; }, false, () => settings({ mode }));
  const input = { goal: 'Buy whey protein', app: 'Microsoft Edge' };
  assert.match(tool.summarize(input), /never move your mouse, ask before anything that sends, deletes, buys, or submits, and stop/);
  mode = 'handsOff'; assert.match(tool.summarize(input), /ask only before spending above your limit, leaving the site, or running commands/);
  mode = 'ask'; assert.match(tool.summarize(input), /ask before every step/);
  assert.equal(askingPromise(settings({ mode: 'custom' })), 'ask when your permission settings say so');
  const broker = new ApprovalBroker(card => setTimeout(() => broker.decide(card.approvalId, true, 'handsOff')), () => {});
  const session = new ToolSession({ definitions: [tool], broker, audit: { beginTool: () => 1, finishTool: () => {}, recentTools: () => [] }, messageId: 1,
    context: { dryRun: false, signal: new AbortController().signal }, activity() {}, changed() {}, event() {} });
  assert.equal(await session.approve('c1', 'do_task', input, true), true);
  await session.tools().do_task.execute(input, { toolCallId: 'c1', messages: [] });
  assert.deepEqual(started, ['handsOff']);
});

test('the agent is told up front what the settings never allow', () => {
  assert.match(agentSystem({ app: 'Outlook', budget: 15, vision: false, job: null, forbidden: ['send things as you', 'spend money'] }), /never let you send things as you, spend money\. When the task needs one of these, stop just before it and call done/);
  assert.doesNotMatch(agentSystem({ app: 'Outlook', budget: 15, vision: false, job: null, forbidden: [] }), /never let you/);
});

// Whole tasks and jobs through the real session, with the settings as a dependency.
const timing = { pointMs: 0, settleMs: 0, retryMs: 1, launchMs: 3000, wallMs: 60000, lingerMs: 5, rateRetries: 4, rateMaxMs: 5 };
let nextRef = 0;
const at = (y, name, role, extra = {}) => ({ ref: nextRef++, name, role, automationId: '', help: '', enabled: true, layer: 1, rect: { x: 60, y, width: 300, height: 20 }, patterns: ['invoke', 'value'], ...extra });
function page(url, items, title = 'Kite Test Mart') {
  nextRef = 0;
  const elements = [at(48, 'Back', 'Button'), at(88, 'Address and search bar', 'Edit', { value: url.replace(/^https:\/\//, '') }),
    { ...at(120, title, 'Document', { value: url, readOnly: true }), rect: { x: 50, y: 120, width: 1300, height: 860 } }];
  let y = 140;
  for (const [name, role, extra] of items) elements.push(at(y += 22, name, role, extra));
  return { seq: 1, window: { hwnd: 7, title: `${title} - Microsoft Edge`, process: 'msedge', pid: 9, rect: { x: 0, y: 0, width: 1400, height: 1000 }, foreground: true }, layers: [{ layer: 1, title, main: true }], elements };
}
const review = () => page('https://shop.example.in/checkout/review', [['Review your order', 'Text'], ['Order total: ₹2,169', 'Text'], ['Place order', 'Button']], 'Review your order');
const cart = () => page('https://shop.example.in/cart', [['Shopping cart', 'Text'], ['Sunfold Whey Protein, 60 sachets', 'Hyperlink'], ['₹2,149', 'Text'],
  ['Remove', 'Button'], ['Subtotal (1 item): ', 'Text'], ['₹2,149', 'Text'], ['Proceed to checkout', 'Button']], 'Cart');
function harness({ pages, decisions, scope = 'task', permissions = settings(), plan = buildPlan('store', 'shop.example.in', 'sunfold whey'), app = 'Microsoft Edge' }) {
  const h = { views: [], said: [], acts: [], audits: [], ended: [], prompts: [], remembered: [], permissions };
  let seq = 0; const queue = [...decisions];
  const deps = {
    windows: async () => [pages[0].window], snapshot: async () => ({ ...pages[0], seq: ++seq }),
    act: async (s, ref, action) => { h.acts.push({ ref, action }); return { ok: true, via: 'invoke' }; },
    keys: async () => ({ ok: true }), launch: async () => false, plan: plan ? async () => plan : undefined,
    decide: async prompt => { h.prompts.push(prompt); return queue.shift() ?? { type: 'fail', reason: 'out of decisions' }; },
    displayOf: () => ({ x: 0, y: 0, width: 1920, height: 1080 }), emit: v => h.views.push(v), say: t => h.said.push(t),
    audit: (type, summary, decision, result) => h.audits.push({ type, summary, decision, ok: result.ok }),
    finished: (message, status) => h.ended.push({ message, status }),
    permissions: () => h.permissions,
    remember: (category, permission, place) => { h.remembered.push([category, permission, place]); h.permissions = remember(h.permissions, category, permission, place); },
  };
  h.session = new TaskSession(1, 'Buy Sunfold Whey, 60 sachets', app, scope, deps, false, 15, timing);
  Object.defineProperty(h, 'view', { get: () => h.views.filter(Boolean).at(-1) });
  h.until = async (predicate, label) => { for (let i = 0; i < 400 && !predicate(); i++) await new Promise(r => setTimeout(r, 5)); assert.ok(predicate(), label + ': ' + JSON.stringify(h.view)); };
  return h;
}
const placeOrder = p => p.elements.find(e => e.name === 'Place order').ref;

test('a hands-off job never asks below the spend limit, and always asks above it', async () => {
  const below = harness({ pages: [review()], scope: 'handsOff', permissions: settings({ spendLimit: 5000 }), decisions: [{ type: 'click', ref: placeOrder(review()) }] });
  below.session.start(); await below.until(() => below.ended.length, 'ends');
  assert.ok(!below.views.some(v => v?.status === 'approval'), 'never asked');
  assert.deepEqual(below.acts, [{ ref: placeOrder(review()), action: 'click' }]);
  const above = harness({ pages: [review()], scope: 'handsOff', permissions: settings({ spendLimit: 1000 }), decisions: [{ type: 'click', ref: placeOrder(review()) }] });
  above.session.start(); await above.until(() => above.view?.status === 'approval', 'asks');
  assert.equal(above.view.message, 'This may spend money: the total here is ₹2,169, above your limit of ₹1,000.');
  assert.deepEqual(above.view.ask, { category: 'money', label: 'Spend money', place: 'shop.example.in', always: false }, 'no "Always" for the floor');
  assert.match(above.said.at(-1), /^Can I click “Place order” button\? This may spend money/);
  assert.equal(above.acts.length, 0);
  above.session.control('skip'); await above.until(() => above.ended.length, 'ends');
  assert.equal(above.acts.length, 0); assert.equal(above.audits.find(a => a.type === 'click').decision, 'denied');
  // Hands-off as a mode, not just for this job, behaves the same.
  const mode = harness({ pages: [review()], permissions: settings({ mode: 'handsOff', spendLimit: 5000 }), decisions: [{ type: 'click', ref: placeOrder(review()) }] });
  mode.session.start(); await mode.until(() => mode.ended.length, 'ends');
  assert.equal(mode.acts.length, 1);
});

test('Balanced asks before checkout; "always" here saves a rule for the site and stops asking', async () => {
  const proceed = cart().elements.find(e => e.name === 'Proceed to checkout').ref, remove = cart().elements.find(e => e.name === 'Remove').ref;
  const h = harness({ pages: [cart()], decisions: [{ type: 'click', ref: remove }, { type: 'click', ref: remove }, { type: 'click', ref: proceed }] });
  h.session.start();
  await h.until(() => h.view?.status === 'approval', 'asks');
  assert.deepEqual(h.view.ask, { category: 'delete', label: 'Delete or overwrite', place: 'shop.example.in', always: true });
  assert.equal(h.session.command('always'), 'Okay. I won’t ask about “Delete or overwrite” steps on shop.example.in again.');
  await h.until(() => h.acts.length === 2, 'the second Remove runs without asking');
  assert.deepEqual(h.remembered, [['delete', 'allow', 'shop.example.in']]);
  assert.equal(new Set(h.views.filter(v => v?.status === 'approval').map(v => v.step)).size, 1, 'asked once');
  await h.until(() => h.view?.status === 'approval' && h.view.ask?.category === 'money', 'checkout still asks: money is on the floor at ₹0');
  assert.equal(h.view.ask.always, false);
  h.session.command('never'); await h.until(() => h.ended.length, 'ends');
  assert.deepEqual(h.remembered.at(-1), ['money', 'never', 'shop.example.in']);
  assert.match(h.prompts.at(-1).history.join('\n'), /the user said no and not to spend money here again/);
  assert.equal(h.acts.length, 2, 'checkout never clicked');
});

test('Don’t allow: nothing runs, the agent is told to hand over, and the prompt lists it up front', async () => {
  const proceed = cart().elements.find(e => e.name === 'Proceed to checkout').ref;
  const h = harness({ pages: [cart()], permissions: withCategory(settings(), 'money', 'never'), decisions: [{ type: 'click', ref: proceed }, { type: 'fail', reason: 'enough' }] });
  h.session.start(); await h.until(() => h.ended.length, 'ends');
  assert.equal(h.acts.length, 0); assert.ok(!h.views.some(v => v?.status === 'approval'), 'never asked');
  assert.deepEqual(h.audits.find(a => a.type === 'click'), { type: 'click', summary: 'Click “Proceed to checkout” button', decision: 'denied', ok: false });
  assert.match(h.prompts[1].history.join('\n'), /not done\. Your settings say I don’t spend money\. Don’t look for another way to do it\. If the task needs this step, call done now/);
  assert.deepEqual(h.prompts[0].forbidden, ['spend money']);
  // A rule for another site doesn't apply here.
  const elsewhere = harness({ pages: [cart()], permissions: remember(settings(), 'money', 'never', 'other.example'), decisions: [{ type: 'fail', reason: 'x' }] });
  elsewhere.session.start(); await elsewhere.until(() => elsewhere.ended.length, 'ends');
  assert.deepEqual(elsewhere.prompts[0].forbidden, []);
});

test('secrets are never typed, even hands-off: the agent is told to have the user type it', async () => {
  const login = page('https://shop.example.in/login', [['Sign in', 'Text'], ['Password', 'Edit', { password: true }], ['Enter the 6-digit OTP sent to your phone', 'Edit']], 'Sign in');
  const h = harness({ pages: [login], scope: 'handsOff', decisions: [{ type: 'type_text', ref: 4, text: 'hunter2' }, { type: 'type_text', ref: 5, text: '123456' }, { type: 'fail', reason: 'enough' }] });
  h.session.start(); await h.until(() => h.ended.length, 'ends');
  assert.equal(h.acts.length, 0); assert.ok(!h.views.some(v => v?.status === 'approval'));
  assert.match(h.prompts[1].history.join('\n'), /not done\. This types into a password field\. Kite never types passwords.*ask_user/);
  assert.match(h.prompts[2].history.join('\n'), /one-time code, a CVV or a PIN/);
});

test('step by step asks before routine steps without offering "Always"; plain app tasks use the app as the place', async () => {
  const notepad = { seq: 1, window: { hwnd: 3, title: 'Untitled - Notepad', process: 'Notepad', pid: 4, rect: { x: 0, y: 0, width: 800, height: 600 }, foreground: true },
    layers: [{ layer: 1, title: 'Untitled - Notepad', main: true }], elements: [{ ref: 0, name: 'File', role: 'MenuItem', automationId: '', help: '', enabled: true, layer: 1, rect: { x: 0, y: 0, width: 40, height: 20 }, patterns: ['expand'] },
      { ref: 1, name: 'Send', role: 'Button', automationId: '', help: '', enabled: true, layer: 1, rect: { x: 50, y: 0, width: 40, height: 20 }, patterns: ['invoke'] }] };
  const h = harness({ pages: [notepad], app: 'Notepad', plan: null, scope: 'once', decisions: [{ type: 'click', ref: 0 }, { type: 'click', ref: 1 }, { type: 'done', summary: 'ok' }] });
  h.session.start();
  await h.until(() => h.view?.status === 'approval', 'asks');
  assert.deepEqual(h.view.ask, { category: 'look', label: 'Look around', place: 'notepad', always: false });
  assert.equal(h.view.message, 'Okay to do this step?'); assert.equal(h.said.length, 0, 'routine questions are not spoken');
  h.session.control('allow');
  await h.until(() => h.view?.status === 'approval' && h.view.step === 2, 'asks about Send');
  assert.deepEqual(h.view.ask, { category: 'send', label: 'Send as you', place: 'notepad', always: true });
  h.session.control('alwaysEverywhere');
  await h.until(() => h.ended.length, 'ends');
  assert.deepEqual(h.remembered, [['send', 'allow', null]]);
  assert.equal(h.permissions.mode, 'custom'); assert.equal(h.permissions.custom.send, 'allow');
  assert.equal(permissionTable(h.permissions).look, 'allow', 'the rest of Balanced carries over');
});

test('go_to inside the site follows the settings: Ask every time asks, Balanced doesn’t', async () => {
  const ask = harness({ pages: [cart()], permissions: settings({ mode: 'ask' }), decisions: [{ type: 'go_to', url: 'https://shop.example.in/orders' }] });
  ask.session.start(); await ask.until(() => ask.view?.status === 'approval', 'asks');
  assert.deepEqual([ask.view.action, ask.view.ask.category], ['Go to shop.example.in/orders', 'look']);
  ask.session.control('stop'); await ask.until(() => ask.ended.length, 'ends');
  const balanced = harness({ pages: [cart()], decisions: [{ type: 'go_to', url: 'https://shop.example.in/orders' }] });
  balanced.session.start(); await balanced.until(() => balanced.ended.length, 'ends');
  assert.ok(!balanced.views.some(v => v?.status === 'approval'));
});
