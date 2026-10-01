// Memory (docs/end-to-end-jobs.md phase 3): never-save patterns, masks, placeholders and redaction, facts from answers,
// the encrypted store with Undo, the chat tools, and the exit test: a checkout on a fake shop where no prompt carries a
// saved value, and deleting a fact removes it from every later prompt.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { neverSave, mask, memoryContext, redactor, fillPlaceholders, factsFromAnswer, placeholderLabel, matchFacts, sensitive } = require('../src/shared/memory.ts');
const { describeAction, classifyStep } = require('../src/shared/agent.ts');
const { createMemory } = require('../src/main/memory/store.ts');
const { memoryTools, keyFor } = require('../src/main/tools/impl/memory.ts');
const { buildPlan } = require('../src/shared/job.ts');
const { TaskSession } = require('../src/main/agent/session.ts');
const { agentSystem, agentPrompt } = require('../src/main/agent/model.ts');

let nextId = 1;
const fact = (key, value, extra = {}) => ({ id: nextId++, kind: key.startsWith('profile.') ? 'profile' : key.startsWith('pref.') ? 'preference' : 'address', key, label: placeholderLabel(key), value, source: 'test', created: 1, updated: 1, used: null, ...extra });
const me = () => [fact('profile.name', 'Asha Kulkarni'), fact('profile.phone', '9876543210'), fact('profile.email', 'asha.k@example.com'),
  fact('home.address', 'Flat 12, Green Park, Baner Road'), fact('home.pincode', '411045'), fact('home.city', 'Pune'), fact('pref.protein', 'Sunfold Whey Protein, 60 sachets, Unflavoured', { label: 'Protein' })];

test('never saved: card, bank, Aadhaar and PAN numbers, passwords and codes; phones and pincodes are fine', () => {
  for (const [value, label] of [['4111 1111 1111 1111', ''], ['1234 5678 9012', 'id'], ['ABCDE1234F', ''], ['hunter2', 'password'], ['482913', 'OTP'], ['123', 'CVV'],
    ['1234', 'UPI PIN'], ['50100123456789', ''], ['123456789', 'account number']]) assert.ok(neverSave(value, label), `${label} ${value}`);
  for (const [value, label] of [['+91 98765 43210', 'phone'], ['411045', 'PIN code'], ['411045', 'pincode'], ['Flat 12, Green Park, Baner Road', 'address'], ['asha.k@example.com', 'email'], ['Japan', 'city']])
    assert.equal(neverSave(value, label), null, `${label} ${value}`);
});

test('the model sees labels, masks and placeholders, never a sensitive value', () => {
  const facts = me(), context = memoryContext(facts);
  assert.equal(mask(facts[1]), 'ending 10'); assert.equal(mask(facts[2]), 'at example.com'); assert.equal(mask(facts[4]), 'saved');
  for (const f of facts.filter(sensitive)) assert.ok(!context.includes(f.value), f.key);
  assert.match(context, /\{\{home\.pincode\}\}: Home pincode \(saved\)/); assert.match(context, /\{\{profile\.phone\}\}: phone number \(ending 10\)/);
  assert.match(context, /Home city: Pune/, 'a city is coarse enough to show'); assert.match(context, /Protein: Sunfold Whey/, 'preferences are plain text');
  assert.equal(memoryContext([]), '');
  assert.deepEqual([sensitive(facts[5]), sensitive(facts[6])], [false, false]);
});

test('redaction finds saved values as people write them, and nothing else', () => {
  const redact = redactor(me());
  assert.equal(redact('Call +91 98765-43210 or 98765 43210 or 9876543210'), 'Call {{profile.phone}} or {{profile.phone}} or {{profile.phone}}');
  assert.equal(redact('https://shop.example.in/p?pincode=411045&x=1'), 'https://shop.example.in/p?pincode={{home.pincode}}&x=1');
  assert.equal(redact('Deliver to ASHA  KULKARNI, Flat 12,  Green Park, Baner Road, Pune 411045'), 'Deliver to {{profile.name}}, {{home.address}}, Pune {{home.pincode}}');
  assert.equal(redact('order 14110459 and ₹411045000'), 'order 14110459 and ₹411045000', 'not inside longer numbers');
  assert.equal(redact('Email asha.k@example.com'), 'Email {{profile.email}}');
  assert.equal(redact('Pune is lovely'), 'Pune is lovely');
});

test('placeholders are filled by code and described in words on the card', () => {
  const values = { 'home.pincode': '411045' };
  assert.deepEqual(fillPlaceholders('{{home.pincode}}', k => values[k] ?? null), { text: '411045', missing: [] });
  assert.deepEqual(fillPlaceholders('{{home.pincode}} {{work.pincode}}', k => values[k] ?? null), { text: '411045 {{work.pincode}}', missing: ['work.pincode'] });
  const field = { ref: 1, name: 'Pincode', role: 'Edit', automationId: '', help: '', enabled: true, layer: 1, rect: { x: 0, y: 0, width: 1, height: 1 }, patterns: ['value'] };
  assert.equal(describeAction({ type: 'type_text', ref: 1, text: '{{home.pincode}}' }, field), 'Type into “Pincode” edit: your saved Home pincode');
  assert.equal(describeAction({ type: 'type_text', ref: 1, text: 'Call {{profile.phone}}' }, field), 'Type into “Pincode” edit: “Call [your phone number]”');
  assert.equal(classifyStep({ type: 'type_text', ref: 1, text: '{{home.pincode}}' }, { element: field, process: 'msedge', title: '', dialogText: '' }).category, 'saved');
});

test('facts in answers to Kite’s questions are recognised by code; anything unclear is left alone', () => {
  const keys = (q, a) => factsFromAnswer(q, a, 'test').map(f => `${f.key}=${f.value}`);
  assert.deepEqual(keys('What’s your delivery pincode?', '411 045.'), ['home.pincode=411045']);
  assert.deepEqual(keys('What phone number should the courier call?', '+91 98765 43210'), ['profile.phone=9876543210']);
  assert.deepEqual(keys('What email should I use?', "It's asha.k@example.com"), ['profile.email=asha.k@example.com']);
  assert.deepEqual(keys('What’s your full name?', 'Asha Kulkarni'), ['profile.name=Asha Kulkarni']);
  assert.deepEqual(keys('What’s the delivery address?', 'Flat 12, Green Park, Baner Road, Pune 411045'), ['home.address=Flat 12, Green Park, Baner Road, Pune 411045', 'home.pincode=411045']);
  assert.equal(factsFromAnswer('What’s your delivery pincode?', 'not sure', 'test').length, 0);
  assert.equal(factsFromAnswer('Which flavour?', 'chocolate', 'test').length, 0);
  assert.equal(factsFromAnswer('What’s the OTP?', '482913', 'test').length, 0, 'never from a code question');
  assert.equal(factsFromAnswer('What’s your full name?', 'skip that', 'test').length, 0);
  assert.equal(factsFromAnswer('What phone number?', '4111 1111 1111 1111', 'test').length, 0);
});

test('spoken phrases find the facts they are about', () => {
  const facts = me(), keys = about => matchFacts(facts, about).map(f => f.key);
  assert.deepEqual(keys('my pincode'), ['home.pincode']); assert.deepEqual(keys('phone number'), ['profile.phone']);
  assert.deepEqual(keys('home address'), ['home.address']); assert.equal(keys('everything').length, facts.length);
  assert.deepEqual(keys('work address').length, 1, 'address still matches; "work" doesn’t exist'); assert.deepEqual(keys('passport'), []);
});

// A store over an in-memory table, with a reversible stand-in for the OS cipher.
function memoryStore({ on = true } = {}) {
  const rows = new Map(); let id = 0, t = 1000;
  const table = {
    list: () => [...rows.values()].sort((a, b) => a.key.localeCompare(b.key)),
    put: row => { const old = [...rows.values()].find(r => r.key === row.key); const r = { ...old, ...row, id: old?.id ?? ++id, used_at: old?.used_at ?? null }; if (old) r.created_at = old.created_at; rows.set(r.id, r); return r.id; },
    remove: rid => rows.delete(rid), removeAll: () => { const n = rows.size; rows.clear(); return n; }, touch: (rid, at) => { const r = rows.get(rid); if (r) r.used_at = at; },
  };
  const cipher = { isEncryptionAvailable: () => true, encryptString: v => Buffer.from('enc:' + Buffer.from(v).toString('hex')), decryptString: b => Buffer.from(b.toString().slice(4), 'hex').toString() };
  const state = { on, changes: 0 };
  const store = createMemory(table, cipher, { enabled: () => state.on, changed: () => state.changes++, now: () => ++t });
  return { store, rows, state };
}

test('the store encrypts values at rest, refuses what is never saved, and undoes a save once', () => {
  const { store, rows, state } = memoryStore();
  const first = store.save({ kind: 'address', key: 'home.pincode', label: 'Home pincode', value: '411045', source: 'test' });
  assert.equal(first.ok, true); assert.equal(first.updated, false); assert.ok(first.token);
  assert.ok(![...rows.values()].some(r => r.value.includes('411045')), 'only ciphertext in the table');
  assert.equal(store.lookup('home.pincode'), '411045'); assert.ok([...rows.values()][0].used_at, 'use is recorded');
  const update = store.save({ kind: 'address', key: 'home.pincode', label: 'Home pincode', value: '411046', source: 'test' });
  assert.equal(update.updated, true);
  assert.equal(store.save({ kind: 'address', key: 'home.pincode', label: 'Home pincode', value: '411046', source: 'test' }).token, '', 'the same value is no change');
  assert.ok(store.undo(update.token)); assert.equal(store.find('home.pincode').value, '411045', 'undo restores the previous value');
  assert.equal(store.undo(update.token), false, 'once');
  assert.ok(store.undo(first.token)); assert.equal(store.find('home.pincode'), null, 'undo of a new fact removes it');
  for (const bad of [{ kind: 'profile', key: 'profile.phone', label: 'Card number', value: '4111111111111111', source: 't' }, { kind: 'profile', key: 'profile.passport', label: 'x', value: 'y', source: 't' },
    { kind: 'address', key: 'profile.phone', label: 'Phone', value: '9876543210', source: 't' }]) assert.equal(store.save(bad).ok, false, JSON.stringify(bad));
  assert.ok(state.changes >= 4, 'the Memory view hears about changes');
  // Edit from the Memory view, then delete: gone from the store and from what the model is told.
  store.save({ kind: 'profile', key: 'profile.phone', label: 'Phone number', value: '9876543210', source: 'test' });
  const phone = store.find('profile.phone');
  assert.equal(store.edit(phone.id, { value: '9123456780' }).ok, true); assert.equal(store.lookup('profile.phone'), '9123456780');
  assert.match(store.context(), /profile\.phone/);
  assert.ok(store.forget(phone.id)); assert.equal(store.find('profile.phone'), null); assert.doesNotMatch(store.context(), /phone/);
  assert.equal(store.fill('{{profile.phone}}').missing[0], 'profile.phone');
});

test('the master switch: off saves nothing new and uses nothing, but saved values still stay out of prompts', () => {
  const { store, state } = memoryStore();
  store.save({ kind: 'address', key: 'home.pincode', label: 'Home pincode', value: '411045', source: 'test' });
  state.on = false;
  assert.equal(store.save({ kind: 'profile', key: 'profile.name', label: 'Name', value: 'Asha', source: 'test' }).ok, false);
  assert.equal(store.context(), ''); assert.equal(store.lookup('home.pincode'), null);
  assert.equal(store.redact('pin 411045'), 'pin {{home.pincode}}');
  assert.equal(store.edit(store.find('home.pincode').id, { value: '411046' }).ok, true, 'the Memory view can still edit');
});

test('chat tools: recall shows sensitive values to the user only, remember saves with a notice, forget deletes', async () => {
  const { store } = memoryStore(), shown = [], saved = [];
  const [recall, remember, forget] = memoryTools({ store, show: t => shown.push(t), saved: r => saved.push(r), source: () => 'From what you said, 1 Oct' });
  const ctx = { dryRun: false, signal: new AbortController().signal };
  assert.equal(recall.approvalRequired, false); assert.equal(remember.approvalRequired, false); assert.equal(forget.kind, 'action', 'forgetting asks first');
  const r1 = await remember.execute({ field: 'pincode', value: '411045' }, ctx);
  assert.equal(r1.ok, true); assert.doesNotMatch(r1.message, /411045/); assert.match(r1.message, /\{\{home\.pincode\}\}/);
  assert.equal(saved.length, 1); assert.equal(saved[0].fact.source, 'From what you said, 1 Oct');
  await remember.execute({ field: 'preference', topic: 'protein flavour', value: 'chocolate' }, ctx);
  const card = await remember.execute({ field: 'phone', value: '4111 1111 1111 1111' }, ctx);
  assert.deepEqual([card.ok, card.message], [false, 'I don’t keep payment or ID numbers, passwords or codes.']);
  const what = await recall.execute({ about: 'pincode' }, ctx);
  assert.doesNotMatch(what.message, /411045/); assert.deepEqual(shown, ['Home pincode: 411045']); assert.match(what.message, /on screen/);
  assert.match((await recall.execute({ about: 'protein flavour' }, ctx)).message, /chocolate/, 'preferences are plain text');
  assert.match((await recall.execute({ about: 'passport' }, ctx)).message, /nothing saved/);
  assert.equal(forget.summarize({ about: 'everything' }), 'Forget everything I remember about you?');
  assert.match((await forget.execute({ about: 'pincode' }, ctx)).message, /Forgot Home pincode/);
  assert.equal(store.find('home.pincode'), null);
  assert.equal(keyFor({ field: 'address', place: 'Work' }), 'work.address'); assert.equal(keyFor({ field: 'phone' }), 'profile.phone');
  assert.equal(keyFor({ field: 'phone', place: 'mum' }), 'mum.phone'); assert.equal(keyFor({ field: 'email', place: 'work' }), 'profile.email');
});

// The exit test: a checkout on Kite Test Mart's address page. The page shows the saved name, address and pincode; Kite types
// the pincode and phone from placeholders; the user answers a question with their phone number, which is learned. Every
// prompt, rendered exactly as the model receives it, must be free of every saved value.
const timing = { pointMs: 0, settleMs: 0, retryMs: 1, launchMs: 3000, wallMs: 60000, lingerMs: 5, rateRetries: 4, rateMaxMs: 5 };
let ref = 0;
const at = (y, name, role, extra = {}) => ({ ref: ref++, name, role, automationId: '', help: '', enabled: true, layer: 1, rect: { x: 60, y, width: 300, height: 20 }, patterns: ['value', 'invoke'], ...extra });
function addressPage() {
  ref = 0; const url = 'https://shop.example.in/checkout/address?pincode=411045';
  const items = [['Choose a delivery address', 'Text'], ['Asha Kulkarni, Flat 12, Green Park, Baner Road, Pune 411045', 'RadioButton', { selected: true }], ['Deliver to this address', 'Button'],
    ['Pincode', 'Edit', { value: '' }], ['Mobile number', 'Edit', { value: '' }], ['Contact: +91 98765 43210', 'Text'], ['Save address and continue', 'Button']];
  const elements = [at(48, 'Back', 'Button'), at(88, 'Address and search bar', 'Edit', { value: url.replace('https://', '') }), { ...at(120, 'Delivery address', 'Document', { value: url }), rect: { x: 50, y: 120, width: 1300, height: 860 } }];
  let y = 140; for (const [name, role, extra] of items) elements.push(at(y += 22, name, role, extra));
  return { seq: 1, window: { hwnd: 7, title: 'Delivery address for Asha Kulkarni - Microsoft Edge', process: 'msedge', pid: 9, rect: { x: 0, y: 0, width: 1400, height: 1000 }, foreground: true }, layers: [{ layer: 1, title: 'Delivery address', main: true }], elements };
}
test('exit: no prompt sent during a checkout carries a saved value; a deleted fact is gone from every later prompt', async () => {
  const { store } = memoryStore();
  for (const [kind, key, value] of [['profile', 'profile.name', 'Asha Kulkarni'], ['address', 'home.address', 'Flat 12, Green Park, Baner Road'], ['address', 'home.pincode', '411045'], ['profile', 'profile.email', 'asha.k@example.com']])
    store.save({ kind, key, label: placeholderLabel(key), value, source: 'test' });
  const page = addressPage(), pincode = page.elements.find(e => e.name === 'Pincode').ref, mobile = page.elements.find(e => e.name === 'Mobile number').ref;
  const sent = [], acts = [], ended = [], views = [];
  const decisions = [{ type: 'type_text', ref: pincode, text: '{{home.pincode}}', replace: true }, { type: 'ask_user', question: 'What mobile number should the courier call?' },
    { type: 'type_text', ref: mobile, text: '{{profile.phone}}', replace: true }, () => { store.forget(store.find('profile.email').id); return { type: 'wait', seconds: 0.5 }; }, { type: 'fail', reason: 'enough' }];
  const learned = [];
  const memory = { context: () => store.context(), redact: t => store.redact(t), fill: t => store.fill(t),
    learn: (q, a, where) => { for (const f of factsFromAnswer(q, a, where)) learned.push(store.save(f)); }, chose: () => {} };
  const session = new TaskSession(1, 'Deliver my protein to Asha Kulkarni at 411045', 'Microsoft Edge', 'task', {
    windows: async () => [page.window], snapshot: async () => ({ ...page }), launch: async () => false, keys: async () => ({ ok: true }),
    act: async (s, r, action, extra) => { acts.push({ r, action, text: extra.text }); return { ok: true, via: action }; },
    plan: async () => buildPlan('store', 'shop.example.in', 'sunfold whey'),
    decide: async prompt => {
      sent.push({ system: agentSystem(prompt), user: JSON.stringify(agentPrompt(prompt)), memory: prompt.memory ?? '' });
      const next = decisions.shift(); return typeof next === 'function' ? next() : next ?? { type: 'fail', reason: 'done' };
    },
    displayOf: () => ({ x: 0, y: 0, width: 1920, height: 1080 }), emit: v => { views.push(v); if (v?.status === 'asking') setTimeout(() => session.command('It’s +91 98765 43210')); },
    say: () => {}, audit: () => {}, finished: (message, status) => ended.push({ message, status }), memory,
  }, false, 15, timing);
  session.start();
  for (let i = 0; i < 400 && !ended.length; i++) await new Promise(r => setTimeout(r, 5));
  assert.equal(ended.length, 1, 'the job ends');
  assert.ok(learned.some(r => r.ok && r.fact.key === 'profile.phone'), 'the phone number answer was learned');
  assert.deepEqual(acts.filter(a => a.action === 'set').map(a => [a.r, a.text]), [[pincode, '411045'], [mobile, '9876543210']], 'Kite typed the real values');
  assert.equal(sent.length, 5);
  const values = ['Asha Kulkarni', 'Asha', 'Kulkarni', 'Flat 12', 'Green Park', 'Baner Road', '411045', '411 045', '9876543210', '98765 43210', 'asha.k@example.com'];
  // The phone is on the page from the start, but Kite only knows it is the user's once they say so (before prompt 3).
  const phone = ['9876543210', '98765 43210'];
  sent.forEach((p, i) => { for (const v of values) if (i >= 2 || !phone.includes(v)) assert.ok(!(p.system + p.user).includes(v), `prompt ${i + 1} carries “${v}”`); });
  assert.ok(sent[0].user.includes('98765 43210'), 'not yet known, so not yet hidden');
  assert.match(sent[0].user, /\{\{profile\.name\}\}, \{\{home\.address\}\}, Pune \{\{home\.pincode\}\}/, 'the page itself is redacted');
  assert.match(sent[0].system, /\{\{home\.pincode\}\}: Home pincode \(saved\)/, 'the model knows what is saved');
  assert.match(sent[2].user, /the user answered “It’s \{\{profile\.phone\}\}”/, 'an answer, once saved, is redacted in the history');
  assert.match(sent[1].user, /Replace the text in “Pincode” edit: your saved Home pincode → Typed/);
  assert.match(sent[3].memory, /profile\.email/); assert.doesNotMatch(sent[4].memory, /email/, 'deleted: gone from the next prompt');
});

test('a placeholder with nothing saved is never typed; the agent is told to ask', async () => {
  const { store } = memoryStore(); const page = addressPage(), acts = [], prompts = [], ended = [];
  const pincode = page.elements.find(e => e.name === 'Pincode').ref;
  const queue = [{ type: 'type_text', ref: pincode, text: '{{work.pincode}}', replace: true }, { type: 'fail', reason: 'x' }];
  const session = new TaskSession(2, 'x', 'Microsoft Edge', 'task', {
    windows: async () => [page.window], snapshot: async () => ({ ...page }), launch: async () => false, keys: async () => ({ ok: true }),
    act: async (s, r, action) => { acts.push(action); return { ok: true }; }, decide: async p => { prompts.push(p); return queue.shift(); },
    displayOf: () => ({ x: 0, y: 0, width: 1, height: 1 }), emit: () => {}, say: () => {}, audit: () => {}, finished: (m, s) => ended.push(s),
    memory: { context: () => store.context(), redact: t => store.redact(t), fill: t => store.fill(t), learn: () => {}, chose: () => {} },
  }, false, 15, timing);
  session.start();
  for (let i = 0; i < 300 && !ended.length; i++) await new Promise(r => setTimeout(r, 5));
  assert.deepEqual(acts, []); assert.match(prompts[1].history.join('\n'), /not typed: nothing is saved for \{\{work\.pincode\}\}\. Ask the user with ask_user/);
});
