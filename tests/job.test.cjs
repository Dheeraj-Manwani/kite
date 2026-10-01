// Jobs (docs/end-to-end-jobs.md phase 1): plans, scope, the page URL, the cart read back by code, choices, the
// formatter's link and repeat handling, the planner, and whole jobs through a real TaskSession with a scripted decider.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MockLanguageModelV3 } = require('ai/test');
const { buildPlan, siteOf, hostOf, inScope, pageUrl, pageElements, readCart, cartSentence, matchChoice, jobLimits, browserApp, unconfirmedVariant } = require('../src/shared/job.ts');
const { formatSnapshot, describeAction } = require('../src/shared/agent.ts');
const { TaskSession } = require('../src/main/agent/session.ts');
const { agentTools, agentSystem, agentPrompt, toAction } = require('../src/main/agent/model.ts');
const { planJob, guessKind } = require('../src/main/agent/planner.ts');

// A browser window: Edge's own controls on top, the page below y = 120.
let nextRef = 0;
const at = (y, name, role, extra = {}) => ({ ref: nextRef++, name, role, automationId: '', help: '', enabled: true, layer: 1, rect: { x: 60, y, width: 300, height: 20 }, patterns: [], ...extra });
function page(url, items, title = 'Kite Test Mart') {
  nextRef = 0;
  const elements = [at(48, 'Back', 'Button'), at(88, 'Address and search bar', 'Edit', { value: url.replace(/^https:\/\//, '') }),
    { ...at(120, title, 'Document', { value: url, readOnly: true }), rect: { x: 50, y: 120, width: 1300, height: 860 } }];
  let y = 140;
  for (const [name, role, extra] of items) elements.push(at(y += 22, name, role, extra));
  elements.push(at(48, `${title} - Memory usage - 21 MB`, 'TabItem', { selected: true }));
  return { seq: 1, window: { hwnd: 7, title: `${title} - Microsoft Edge`, process: 'msedge', pid: 9, rect: { x: 0, y: 0, width: 1400, height: 1000 }, foreground: true }, layers: [{ layer: 1, title, main: true }], elements };
}
const cartPage = () => page('https://shop.example.in/cart', [['Kite Test Mart', 'Hyperlink'], ['Deliver to 411045', 'Hyperlink'], ['Cart, 1 items', 'Hyperlink'],
  ['Offers', 'Hyperlink'], ['Shopping cart', 'Text'], ['Item', 'DataItem'], ['Price', 'DataItem'],
  ['Sunfold Whey Protein, 60 sachets, Unflavoured', 'DataItem'], ['Sunfold Whey Protein, 60 sachets, Unflavoured', 'Hyperlink'], ['₹2,149', 'DataItem'],
  ['Quantity for Sunfold Whey Protein', 'ComboBox', { value: '1' }], ['Remove', 'Button'],
  ['Sunfold Protein Bar, Pack of 6, Chocolate', 'Hyperlink'], ['₹360', 'DataItem'], ['Quantity for Sunfold Protein Bar', 'ComboBox', { value: '2' }], ['Remove', 'Button'],
  ['Subtotal (3 items): ', 'Text'], ['₹2,869', 'Text'], ['Proceed to checkout', 'Button'], ['About us', 'Hyperlink'], ['Careers', 'Hyperlink']]);

test('plans: templates per kind, a clean domain for the site, and the site as the only scope', () => {
  const store = buildPlan('store', 'https://WWW.Shop.Example.in/en/', ' sunfold whey 60 sachets ');
  assert.deepEqual(store.phases.map(p => `${p.id}:${p.kite ? p.budget : 'you'}`), ['find:12', 'choose:6', 'cart:6', 'checkout:you', 'pay:you']);
  assert.equal(store.site, 'shop.example.in'); assert.deepEqual(store.scope, ['shop.example.in']); assert.equal(store.search, 'sunfold whey 60 sachets');
  assert.deepEqual(buildPlan('form', null, null).phases.map(p => p.id), ['open', 'fill', 'review', 'submit']);
  assert.deepEqual(buildPlan('form', 'not a site', null).scope, []);
  for (const bad of ['', 'javascript:alert(1)', 'shop', 'a b.com']) assert.equal(siteOf(bad), null, bad);
  assert.equal(siteOf('amazon.in'), 'amazon.in');
  assert.ok(jobLimits.steps >= 45);
  assert.ok(browserApp.test('Microsoft Edge') && browserApp.test('Google Chrome') && !browserApp.test('Notepad'));
});

test('scope: the site and its subdomains, never look-alikes or other schemes', () => {
  const scope = ['shop.example.in'];
  assert.equal(hostOf('https://www.Shop.Example.in/p/1?x=2'), 'shop.example.in');
  assert.equal(hostOf('edge://newtab/'), null); assert.equal(hostOf('not a url'), null);
  assert.ok(inScope('shop.example.in', scope)); assert.ok(inScope('m.shop.example.in', scope));
  for (const host of ['evilshop.example.in', 'shop.example.in.evil.com', 'example.in', null]) assert.equal(inScope(host, scope), false, String(host));
  assert.equal(inScope('anything.com', []), false, 'an empty scope allows nothing');
});

test('the page URL comes from the page, else the address bar; page elements exclude Edge’s own controls', () => {
  const cart = cartPage();
  assert.equal(pageUrl(cart), 'https://shop.example.in/cart');
  assert.equal(pageUrl({ ...cart, elements: cart.elements.filter(e => e.role !== 'Document') }), 'https://shop.example.in/cart');
  assert.equal(pageUrl({ ...cart, elements: [] }), null);
  const inside = pageElements(cart).map(e => e.name);
  assert.ok(inside.includes('Proceed to checkout') && !inside.includes('Back') && !inside.includes('Address and search bar'));
});

test('the cart is read back by code: items with price and quantity, the subtotal, and never nav or footer links', () => {
  const cart = readCart(cartPage());
  assert.deepEqual(cart, { lines: [{ name: 'Sunfold Whey Protein, 60 sachets, Unflavoured', price: '₹2,149', quantity: 1 }, { name: 'Sunfold Protein Bar, Pack of 6, Chocolate', price: '₹360', quantity: 2 }], total: '₹2,869' });
  assert.equal(cartSentence(cart), 'It’s in your cart: Sunfold Whey Protein, 60 sachets, Unflavoured, ₹2,149; and 2 × Sunfold Protein Bar, Pack of 6, Chocolate, ₹360. The subtotal is ₹2,869.');
  assert.equal(readCart(page('https://shop.example.in/p/whey', [['Sunfold Whey Protein', 'Hyperlink'], ['₹2,149', 'Text']])), null, 'not a cart page');
  assert.equal(readCart(page('https://shop.example.in/cart', [['Shopping cart', 'Text'], ['Your cart is empty.', 'Text']])), null, 'an empty cart reads as nothing');
});

test('choices: ordinals, numbers, last, cheaper or pricier, neither, and content words; unclear answers are left to the model', () => {
  const options = [{ label: 'Sunfold Whey, one pack of 60 sachets', detail: '₹2,149' }, { label: 'Sunfold Whey, two packs of 30', detail: '₹2,298' }, { label: 'Sunfold Isolate, 30 sachets', detail: '₹1,499' }];
  const cases = { 'The first one.': 0, 'second': 1, 'um, the third one please': 2, 'the last one': 2, 'option two': 1, '2': 1, 'number 1': 0,
    'the cheaper one': 2, 'the cheapest': 2, 'the more expensive one': 1, 'neither': 'none', 'none of these': 'none', 'no': 'none',
    'the 60 one': 0, 'isolate': 2, 'the one with two packs': 1, 'whey': null, 'hmm let me think': null };
  for (const [said, expected] of Object.entries(cases)) assert.equal(matchChoice(said, options), expected, said);
  assert.equal(matchChoice('the cheaper one', [{ label: 'A' }, { label: 'B' }]), null, 'no prices, no guess');
  assert.equal(matchChoice('third', options.slice(0, 2)), null, 'an option that is not there');
});

test('the formatter drops link URLs and nearby repeats, keeping the first link and the focused control', () => {
  nextRef = 0;
  const snap = page('https://shop.example.in/search?q=whey', [
    ['Sunfold Whey Protein, 60 sachets', 'ListItem'], ['Sunfold Whey Protein, 60 sachets', 'Hyperlink', { value: 'https://track.example.com/clk?u=' + 'x'.repeat(200), readOnly: true }],
    ['Sunfold Whey Protein, 60 sachets', 'Hyperlink', { value: 'https://track.example.com/clk2' }], ['Sunfold Whey Protein, 60 sachets', 'Text'], ['₹2,149', 'Text'],
    ['Add to cart', 'Button'], ['Search', 'Edit', { value: 'whey', focused: true }], ['Add to cart', 'Button']]);
  const text = formatSnapshot(snap);
  assert.equal((text.match(/Sunfold Whey Protein, 60 sachets/g) ?? []).length, 1, text);
  assert.match(text, /Hyperlink “Sunfold Whey Protein, 60 sachets”\n/); assert.doesNotMatch(text, /track\.example|read-only/);
  assert.match(text, /Document “Kite Test Mart”\n/, 'the page URL is not repeated on its document');
  assert.equal((text.match(/Add to cart/g) ?? []).length, 2, 'separate buttons more than a few controls apart both stay');
  assert.match(text, /Edit “Search” = “whey” \(focused\)/);
  assert.match(text, /Edit “Address and search bar” = “shop\.example\.in\/search\?q=whey”/, 'ordinary field values stay');
});

test('job actions are offered only to jobs, validated, described by code, and the prompt carries the page and phase', () => {
  assert.equal('go_to' in agentTools(false), false); assert.equal('ask_choice' in agentTools(false, true), true);
  assert.equal(toAction('go_to', { url: 'javascript:alert(1)' }).type, 'invalid'); assert.equal(toAction('go_to', { url: 'https://shop.example.in/s?q=x' }).type, 'go_to');
  assert.equal(toAction('ask_choice', { question: 'Which?', options: [{ label: 'A' }] }).type, 'invalid', 'at least two options');
  assert.equal(toAction('ask_choice', { question: 'Which?', options: [{ label: 'A', ref: 3 }, { label: 'B', detail: '₹5' }] }).type, 'ask_choice');
  assert.equal(describeAction({ type: 'go_to', url: 'https://www.shop.example.in/search?q=whey' }), 'Go to shop.example.in/search');
  assert.equal(describeAction({ type: 'find', text: 'whey 60' }), 'Look for “whey 60” on the page');
  const plan = buildPlan('store', 'shop.example.in', 'sunfold whey 60');
  const system = agentSystem({ app: 'Microsoft Edge', budget: 45, vision: false, job: { plan, phase: 1, phaseStep: 2 } });
  assert.match(system, /Find it, then Choose, then Add to cart\. Then the user takes over for check out and pay/);
  assert.match(system, /A page’s pre-selected option is not the user’s choice/); assert.match(system, /Never go on to checkout or payment/); assert.match(system, /site is shop\.example\.in/);
  assert.doesNotMatch(agentSystem({ app: 'Notepad', budget: 15, vision: false }), /phases/);
  const prompt = agentPrompt({ goal: 'Buy whey', app: 'Microsoft Edge', step: 4, budget: 45, history: [], snapshot: cartPage(), controls: '[1] Button “Search”', vision: false,
    url: 'https://shop.example.in/', job: { plan, phase: 1, phaseStep: 2 } });
  assert.match(prompt, /Page: https:\/\/shop\.example\.in\/\nPhase: Choose \(step 3 of about 6 for this phase\)\. Looking for: sunfold whey 60\nStep 4 of 45\./);
});

test('the planner makes one call; a bad or failed answer falls back to a plan guessed by code', async () => {
  const call = input => ({ content: [{ type: 'tool-call', toolCallId: 'p', toolName: 'plan_job', input: JSON.stringify(input) }], finishReason: 'tool-calls', usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } }, warnings: [] });
  const model = new MockLanguageModelV3({ doGenerate: async () => call({ kind: 'store', site: 'shop.amul.com', search: 'amul whey protein 60 sachets' }) });
  const plan = await planJob({ model, goal: 'Buy me 60 sachets of Amul protein', app: 'Microsoft Edge', signal: new AbortController().signal });
  assert.equal(plan.site, 'shop.amul.com'); assert.equal(plan.search, 'amul whey protein 60 sachets'); assert.equal(plan.kind, 'store');
  assert.equal(model.doGenerateCalls.length, 1); assert.equal(model.doGenerateCalls[0].toolChoice.type, 'required');
  const form = await planJob({ model: new MockLanguageModelV3({ doGenerate: async () => call({ kind: 'form', site: 'irctc.co.in', search: 'ignored' }) }), goal: 'Book a train', app: 'Edge', signal: new AbortController().signal });
  assert.equal(form.search, null, 'forms have no search');
  const broken = await planJob({ model: new MockLanguageModelV3({ doGenerate: async () => call({ kind: 'shop', site: 1 }) }), goal: 'Order AA batteries', app: 'Edge', signal: new AbortController().signal });
  assert.deepEqual([broken.kind, broken.site], ['store', null]);
  const failing = await planJob({ model: new MockLanguageModelV3({ doGenerate: async () => { throw new Error('down'); } }), goal: 'Renew my car insurance', app: 'Edge', signal: new AbortController().signal });
  assert.equal(failing.kind, 'form');
  assert.equal(guessKind('Add batteries to my cart'), 'store');
});

// Whole jobs, through the real session.
const timing = { pointMs: 0, settleMs: 0, retryMs: 1, launchMs: 3000, wallMs: 60000, lingerMs: 5, rateRetries: 4, rateMaxMs: 5 };
const edge = { hwnd: 7, title: 'New tab - Microsoft Edge', process: 'msedge', pid: 9, rect: { x: 0, y: 0, width: 1400, height: 1000 }, foreground: true };
function harness({ decisions, pages, plan = buildPlan('store', 'shop.example.in', 'sunfold whey'), found, keyResult = () => ({ ok: true }), openUrl } = {}) {
  const h = { views: [], said: [], keys: [], acts: [], audits: [], ended: [], prompts: [], finds: [] };
  let seq = 0, current = 0; const queue = [...decisions];
  const deps = {
    windows: async () => [edge],
    snapshot: async () => ({ ...pages[Math.min(current, pages.length - 1)], seq: ++seq }),
    act: async (s, ref, action) => { h.acts.push({ ref, action }); return { ok: true, via: 'invoke' }; },
    keys: async (target, s, focus, items) => { h.keys.push(items); return keyResult(); },
    find: async (target, text) => { h.finds.push(text); return { ...found, seq: ++seq }; },
    launch: async () => false, openUrl,
    plan: plan === null ? undefined : async () => plan,
    decide: async prompt => { h.prompts.push(prompt); const next = queue.shift(); if (next?.page !== undefined) current = next.page; return next?.decision ?? next ?? { type: 'fail', reason: 'out of decisions' }; },
    displayOf: () => ({ x: 0, y: 0, width: 1920, height: 1080 }),
    emit: v => h.views.push(v), say: t => h.said.push(t),
    audit: (type, summary, decision, result) => h.audits.push({ type, summary, decision, ok: result.ok }),
    finished: (message, status) => h.ended.push({ message, status }),
  };
  h.session = new TaskSession(1, 'Buy Sunfold Whey, 60 sachets', 'Microsoft Edge', 'task', deps, false, 15, timing);
  Object.defineProperty(h, 'view', { get: () => h.views.filter(Boolean).at(-1) });
  h.until = async (predicate, label) => { for (let i = 0; i < 400 && !predicate(); i++) await new Promise(r => setTimeout(r, 5)); assert.ok(predicate(), label + ': ' + JSON.stringify(h.view)); };
  return h;
}
const searchPage = () => page('https://shop.example.in/search?q=sunfold+whey', [['Search for products', 'Edit'], ['Sunfold Whey Protein, 15 sachets', 'Hyperlink'], ['₹599', 'Text'], ['Add to cart', 'Button']], 'Results');

test('a store job opens the site in a new tab, walks its phases, and ends with the cart read back by code', async () => {
  const h = harness({ pages: [searchPage(), cartPage()], decisions: [
    { type: 'next_phase', summary: 'Found it.' }, { type: 'next_phase', summary: 'Chose the 60-sachet pack.' },
    { decision: { type: 'click', ref: 6 }, page: 1 }, { type: 'done', summary: 'The model says it is in the cart.' }] });
  h.session.start();
  await h.until(() => h.ended.length, 'finishes');
  assert.deepEqual(h.keys[0], [{ vk: 0x54, mods: [0x11] }, { text: 'https://shop.example.in' }, { vk: 0x0d, mods: [] }], 'Ctrl+T, the site, Enter');
  assert.equal(h.audits[0].summary, 'Open shop.example.in in a new tab');
  assert.equal(h.ended[0].status, 'done');
  assert.equal(h.ended[0].message, 'It’s in your cart: Sunfold Whey Protein, 60 sachets, Unflavoured, ₹2,149; and 2 × Sunfold Protein Bar, Pack of 6, Chocolate, ₹360. The subtotal is ₹2,869. Check out whenever you’re ready; I’ll leave that to you.');
  assert.doesNotMatch(h.ended[0].message, /model says/, 'the user hears the cart as read by code');
  assert.equal(h.view.budget, 45); assert.deepEqual(h.view.job.phases.map(p => p.state), ['done', 'done', 'done', 'yours', 'yours']);
  assert.equal(h.prompts[0].job.phase, 0); assert.equal(h.prompts[1].job.phase, 1); assert.equal(h.prompts[2].job.phase, 2);
  assert.equal(h.prompts[0].url, 'https://shop.example.in/search?q=sunfold+whey');
  assert.match(h.prompts[0].controls, /Hyperlink “Sunfold Whey Protein, 15 sachets”/);
});

test('done without the cart on screen gets one chance to open it, then says it could not check', async () => {
  const h = harness({ pages: [searchPage()], decisions: [{ type: 'done', summary: 'Added it.' }, { type: 'done', summary: 'Added it, really.' }] });
  h.session.start(); await h.until(() => h.ended.length, 'finishes');
  assert.match(h.prompts[1].history.join('\n'), /open the cart page, then call done/);
  assert.equal(h.ended[0].message, 'Added it, really. I couldn’t read the cart back myself, so please check it before you pay.');
});

test('a phase over its budget asks to keep going; no stops the job', async () => {
  const waits = Array.from({ length: 12 }, () => ({ type: 'look' }));
  const h = harness({ pages: [searchPage()], decisions: waits });
  h.session.start();
  await h.until(() => h.view?.status === 'approval', 'asks');
  assert.equal(h.view.message, 'Find it is taking longer than usual. Keep going?'); assert.equal(h.said.at(-1), 'Find it is taking longer than usual. Keep going?');
  assert.equal(h.prompts.length, 11, '12 steps: the new tab, then 11 decisions');
  h.session.control('skip'); await h.until(() => h.ended.length, 'stops');
  assert.deepEqual(h.ended[0], { message: 'Okay, I stopped at “Find it”.', status: 'stopped' });
});

test('leaving the site asks first: go_to outside scope, and any page that lands outside it', async () => {
  const h = harness({ pages: [searchPage(), page('https://pay.other.example/checkout', [['Pay now', 'Button']], 'Pay')], decisions: [
    { type: 'go_to', url: 'https://evil.example/collect' }, { decision: { type: 'go_to', url: 'https://shop.example.in/cart' }, page: 1 }] });
  h.session.start();
  await h.until(() => h.view?.status === 'approval', 'asks for go_to');
  assert.equal(h.view.message, 'That’s evil.example, outside shop.example.in. Go there?');
  h.session.control('skip');
  await h.until(() => h.view?.status === 'approval' && /pay\.other\.example/.test(h.view.message), 'asks for the page that left the site');
  assert.equal(h.view.message, 'This page is on pay.other.example, not shop.example.in. Keep going here?');
  assert.ok(h.keys.some(k => k[1]?.text === 'https://shop.example.in/cart'), 'in-scope go_to ran without asking');
  assert.ok(!h.keys.some(k => k[1]?.text === 'https://evil.example/collect'), 'declined go_to never typed');
  h.session.control('stop'); await h.until(() => h.ended.length, 'stops');
  assert.equal(h.ended[0].status, 'stopped');
});

test('ask_choice: spoken options, a voice answer matched by code, or a card button', async () => {
  const options = [{ label: 'One pack of 60 sachets', detail: '₹2,149', ref: 3 }, { label: 'Two packs of 30', detail: '₹2,298' }];
  const h = harness({ pages: [searchPage()], decisions: [{ type: 'ask_choice', question: 'I found two. Which one?', options }, { type: 'ask_choice', question: 'And now?', options }, { type: 'fail', reason: 'enough' }] });
  h.session.start();
  await h.until(() => h.view?.status === 'asking', 'asks');
  assert.equal(h.said.at(-1), 'I found two. Which one? Option 1: One pack of 60 sachets, ₹2,149. Option 2: Two packs of 30, ₹2,298.');
  assert.deepEqual(h.view.job.choices, options);
  assert.equal(h.session.command('the cheaper one'), 'Got it: One pack of 60 sachets.');
  await h.until(() => h.view?.status === 'asking' && h.view.message === 'And now?', 'asks again');
  assert.match(h.prompts[1].history.join('\n'), /the user chose option 1: “One pack of 60 sachets” \(\[3\] in that list; look again for its current ref\)/);
  h.session.choose(-1);
  await h.until(() => h.ended.length, 'ends');
  assert.match(h.prompts[2].history.join('\n'), /the user chose none of the options/);
  assert.equal(h.view.job.choices, null);
});

test('find lists only the matches next turn, with refs from that search', async () => {
  const found = { window: edge, layers: [{ layer: 1, title: 'Results', main: true }], elements: [{ ...at(2400, 'Sunfold Whey Protein, 60 sachets', 'Hyperlink'), ref: 0 }] };
  const h = harness({ pages: [searchPage()], found, decisions: [{ type: 'find', text: 'whey 60' }, { type: 'click', ref: 0 }, { type: 'fail', reason: 'enough' }] });
  h.session.start(); await h.until(() => h.ended.length, 'ends');
  assert.deepEqual(h.finds, ['whey 60']);
  assert.match(h.prompts[1].controls, /^Matches for “whey 60” anywhere on the page[^\n]*\n.*\[0\] Hyperlink “Sunfold Whey Protein, 60 sachets”/s);
  assert.deepEqual(h.acts, [{ ref: 0, action: 'click' }], 'the click used the ref from the search');
  assert.match(h.prompts[2].controls, /Search for products/, 'then back to the normal look');
});

// As Edge lists the shop's product page: a legend, then each radio followed by its own label text.
const radios = (title, names, selected) => [[title, 'Text'], ...names.flatMap(n => [[n, 'RadioButton', n === selected ? { selected: true } : {}], [n, 'Text']])];
const productPage = () => page('https://shop.example.in/p/sunfold-whey', [['Sunfold Whey Protein', 'Text'], ['₹2,149', 'Text'],
  ...radios('Pack size', ['15 sachets', '30 sachets', '60 sachets'], '60 sachets'), ...radios('Flavour', ['Unflavoured', 'Chocolate', 'Kesar Pista'], 'Unflavoured'),
  ['Add to cart', 'Button'], ['Buy now', 'Button']], 'Sunfold Whey Protein');
test('the variant floor: a pre-selected option the user never named is theirs to choose', () => {
  const p = productPage(), none = new Set();
  const v = unconfirmedVariant(p, 'Buy me 60 sachets of Sunfold protein', none);
  assert.deepEqual([v.title, v.options.map(o => o.name), v.options[v.selected].name, v.wanted], ['Flavour', ['Unflavoured', 'Chocolate', 'Kesar Pista'], 'Unflavoured', null], 'pack size was named; flavour was not');
  assert.equal(unconfirmedVariant(p, 'Buy 60 sachets of Sunfold whey, unflavoured', none), null);
  assert.equal(unconfirmedVariant(p, 'Buy 60 sachets of Sunfold whey in chocolate', none).wanted, 1, 'named another option: select it, no question');
  assert.equal(unconfirmedVariant(p, 'Buy me 60 sachets of Sunfold protein', new Set([v.key])), null, 'never the same group twice');
  assert.equal(unconfirmedVariant(p, 'Buy Sunfold protein', none).options[0].name, '15 sachets', 'the first open group comes first');
});

test('add to cart waits for the variant: asked by code, confirmed or changed, then clicked', async () => {
  const add = productPage().elements.find(e => e.name === 'Add to cart').ref;
  const h = harness({ pages: [productPage()], decisions: [{ type: 'click', ref: add }, { type: 'click', ref: add }, { type: 'fail', reason: 'enough' }] });
  h.session.start();
  await h.until(() => h.view?.status === 'asking', 'asks');
  assert.equal(h.view.message, 'Which flavour would you like: Unflavoured, Chocolate or Kesar Pista? Unflavoured is selected now.');
  assert.deepEqual(h.view.job.choices.map(c => c.label), ['Unflavoured', 'Chocolate', 'Kesar Pista']);
  assert.equal(h.acts.length, 0, 'nothing added while asking');
  h.session.command('chocolate');
  await h.until(() => h.prompts.length === 2, 'next decision');
  assert.match(h.prompts[1].history.join('\n'), /the user chose “Chocolate” instead of “Unflavoured”\. Select it, then add to the cart/);
  await h.until(() => h.ended.length, 'ends');
  assert.deepEqual(h.acts, [{ ref: add, action: 'click' }], 'the first click was held back; asked once per group, the second went through');
});

test('when Windows keeps the browser in the back, the new tab is retried, then the user is asked to click it', async () => {
  let refusals = 5;
  const h = harness({ pages: [searchPage()], decisions: [{ type: 'fail', reason: 'enough' }], keyResult: () => refusals-- > 0 ? { ok: false, code: 'EFOREGROUND' } : { ok: true } });
  h.session.start();
  await h.until(() => h.view?.status === 'paused', 'pauses');
  assert.equal(h.view.message, 'I need Microsoft Edge in front to open shop.example.in. Click on it once, then say “continue”.');
  assert.equal(h.keys.length, 4, 'tried four times'); assert.equal(h.view.step, 0, 'no step used');
  assert.equal(h.session.command('continue'), 'Carrying on.');
  await h.until(() => h.ended.length, 'ends');
  assert.equal(h.keys.length, 6, 'one more refusal, then it opened'); assert.equal(h.audits[0].summary, 'Open shop.example.in in a new tab');
});

test('without the foreground, the site and go_to open in a new tab through the browser instead of the keyboard', async () => {
  const opened = [];
  const h = harness({ pages: [searchPage()], decisions: [{ type: 'go_to', url: 'https://shop.example.in/cart' }, { type: 'fail', reason: 'enough' }],
    keyResult: () => ({ ok: false, code: 'EFOREGROUND' }), openUrl: async url => { opened.push(url); return true; } });
  h.session.start(); await h.until(() => h.ended.length, 'ends');
  assert.deepEqual(opened, ['https://shop.example.in', 'https://shop.example.in/cart']);
  assert.ok(!h.views.some(v => v?.status === 'paused'), 'no pause');
  assert.deepEqual(h.audits.map(a => [a.summary, a.ok]), [['Open shop.example.in in a new tab', true], ['Go to shop.example.in/cart', true]]);
});

test('a plain app task has no plan, no job card, and keeps its 15-step budget', async () => {
  const h = harness({ plan: null, pages: [searchPage()], decisions: [{ type: 'done', summary: 'Done.' }] });
  h.session.start(); await h.until(() => h.ended.length, 'ends');
  assert.equal(h.view.job, null); assert.equal(h.view.budget, 15); assert.equal(h.keys.length, 0, 'no new tab');
  assert.equal(h.prompts[0].job, null); assert.equal(h.prompts[0].url, undefined);
  assert.deepEqual(h.ended[0], { message: 'Done.', status: 'done' });
});
