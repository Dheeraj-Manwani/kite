const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MockLanguageModelV3 } = require('ai/test');
const { parseKeys, chordLabel, classifyStep, classifyTaskCommand, describeAction, formatSnapshot, maxTaskSteps } = require('../src/shared/agent.ts');
const { TaskSession, pickWindow, rateLimitWait } = require('../src/main/agent/session.ts');
const { toAction, agentTools, agentPrompt, agentSystem, decideStep } = require('../src/main/agent/model.ts');
const { actScript } = require('../src/main/agent/actScript.ts');
const { uiaScript } = require('../src/main/guide/uiaScript.ts');
const { doTask } = require('../src/main/tools/impl/do_task.ts');
const { needsApproval, ApprovalBroker } = require('../src/main/tools/approval.ts');
const { ToolSession } = require('../src/main/tools/registry.ts');

const el = (ref, name, role, extra = {}) => ({ ref, name, role, automationId: '', help: '', enabled: true, layer: 1, rect: { x: 10 + ref * 50, y: 10, width: 40, height: 20 }, patterns: [], ...extra });

test('keys: an allowlist of chords, no Windows key, canonical labels', () => {
  assert.deepEqual(parseKeys('Ctrl+S'), { key: 's', vk: 0x53, modifiers: ['ctrl'] });
  assert.deepEqual(parseKeys(' shift + ctrl + n '), { key: 'n', vk: 0x4e, modifiers: ['ctrl', 'shift'] });
  assert.equal(parseKeys('Enter').vk, 0x0d); assert.equal(parseKeys('arrowdown').vk, 0x28); assert.equal(parseKeys('F12').vk, 0x7b); assert.equal(parseKeys('PgDn').vk, 0x22);
  for (const bad of ['Win+R', 'Meta+D', 'Ctrl+Ctrl+S', 'Ctrl+', '', 'F13', 'Ctrl+Alt+Shift+Tab+X', 'Hyper+A', 'ctrl+é']) assert.equal(parseKeys(bad), null, bad);
  assert.equal(chordLabel(parseKeys('ctrl+shift+s')), 'Ctrl+Shift+S'); assert.equal(chordLabel(parseKeys('alt+f4')), 'Alt+F4'); assert.equal(chordLabel(parseKeys('pagedown')), 'Page Down');
});

test('steps are classified by code: sending, deleting, paying, terminals and dangerous shortcuts carry a reason; secrets are never typed', () => {
  const ctx = (extra = {}) => ({ process: 'notepad', title: 'Untitled - Notepad', dialogText: '', ...extra });
  // The reason a step needs an OK in Balanced (its category asks), or null for a routine step.
  const assessRisk = (action, context) => classifyStep(action, context).reason || null;
  const category = (action, context) => classifyStep(action, context).category;
  assert.match(assessRisk({ type: 'click', ref: 1 }, ctx({ element: el(1, 'Delete', 'Button') })), /can’t be undone/);
  assert.match(assessRisk({ type: 'click', ref: 1 }, ctx({ element: el(1, 'Send', 'Button') })), /may send/);
  assert.match(assessRisk({ type: 'click', ref: 1 }, ctx({ element: el(1, '', 'Button', { automationId: 'PlaceOrderButton' }) })) ?? '', /buy or pay/, 'automation ids count');
  assert.match(assessRisk({ type: 'click', ref: 1 }, ctx({ element: el(1, 'Yes', 'Button'), dialogText: 'Do you want to permanently delete this file?' })), /confirms a dialog/);
  assert.equal(assessRisk({ type: 'click', ref: 1 }, ctx({ element: el(1, 'Yes', 'Button'), dialogText: 'Do you want to save changes?' })), null);
  for (const name of ['File', 'Bold', 'Insert', 'Save', 'OK', 'Font size']) assert.equal(assessRisk({ type: 'click', ref: 1 }, ctx({ element: el(1, name, 'Button') })), null, name);
  assert.match(assessRisk({ type: 'type_text', text: 'dir' }, ctx({ process: 'WindowsTerminal' })), /terminal/);
  assert.equal(classifyStep({ type: 'press_keys', keys: 'Enter' }, ctx({ process: 'powershell' })).floor, 'command', 'terminals always ask');
  assert.match(assessRisk({ type: 'type_text', text: 'hi', submit: true }, ctx({ process: 'ms-teams', title: 'Chat | Microsoft Teams' })), /send a message/);
  assert.equal(assessRisk({ type: 'type_text', text: 'hi', submit: true }, ctx({ title: 'Search - Microsoft Edge', process: 'msedge' })), null);
  for (const keys of ['Alt+F4', 'Ctrl+W', 'Shift+Delete', 'Ctrl+Enter', 'Ctrl+P']) assert.ok(assessRisk({ type: 'press_keys', keys }, ctx()), keys);
  for (const keys of ['Ctrl+S', 'Ctrl+N', 'Tab', 'Down', 'Escape', 'Ctrl+A']) assert.equal(assessRisk({ type: 'press_keys', keys }, ctx()), null, keys);
  assert.ok(assessRisk({ type: 'press_keys', keys: 'Enter' }, ctx({ title: 'Inbox - Outlook', focused: el(1, 'Message body', 'Document') })));
  assert.ok(assessRisk({ type: 'press_keys', keys: 'Delete' }, ctx({ focused: el(1, 'report.docx', 'ListItem') })));
  assert.equal(assessRisk({ type: 'press_keys', keys: 'Delete' }, ctx({ focused: el(1, 'Text editor', 'Document') })), null);
  // Secrets: passwords, card numbers, one-time codes, CVVs and PINs are never typed, in any mode. A pincode is not a PIN.
  assert.equal(classifyStep({ type: 'type_text', ref: 1, text: 'hunter2' }, ctx({ element: el(1, 'Password', 'Edit', { password: true }) })).floor, 'secret');
  assert.equal(classifyStep({ type: 'type_text', text: '4111 1111 1111 1111' }, ctx()).floor, 'secret');
  for (const name of ['Enter the 6-digit OTP sent to your phone', 'CVV', 'UPI PIN']) assert.equal(classifyStep({ type: 'type_text', ref: 1, text: '123456' }, ctx({ element: el(1, name, 'Edit') })).floor, 'secret', name);
  for (const name of ['PIN code', 'Pincode', 'Enter delivery pincode']) assert.equal(classifyStep({ type: 'type_text', ref: 1, text: '411045' }, ctx({ element: el(1, name, 'Edit') })).floor, undefined, name);
  // Categories: what a step does, not how.
  assert.equal(category({ type: 'click', ref: 1 }, ctx({ element: el(1, 'Add to cart', 'Button') })), 'add');
  assert.equal(category({ type: 'click', ref: 1 }, ctx({ element: el(1, 'Sign out', 'MenuItem') })), 'system');
  assert.equal(category({ type: 'click', ref: 1 }, ctx({ element: el(1, 'Book now', 'Button') })), 'submit');
  assert.equal(category({ type: 'click', ref: 1 }, ctx({ element: el(1, 'Apply filters', 'Button') })), 'fill', 'filters are not a submission');
  assert.equal(category({ type: 'click', ref: 1 }, ctx({ element: el(1, 'Results', 'Hyperlink') })), 'look');
  assert.equal(category({ type: 'type_text', text: '{{home.pincode}}' }, ctx()), 'saved');
  assert.equal(category({ type: 'scroll', ref: 1, direction: 'down' }, ctx()), 'look');
  const run = classifyStep({ type: 'click', ref: 1 }, ctx({ element: el(1, 'Run', 'Button') }));
  assert.deepEqual([run.category, run.floor], ['system', 'command']);
  // On a checkout or payment page, the plain buttons spend money; leaving or editing doesn't.
  const pay = ctx({ process: 'msedge', url: 'https://shop.example.in/checkout/payment' });
  for (const name of ['Continue', 'Next', 'Save address and continue', 'Confirm', 'Deliver to this address']) assert.equal(category({ type: 'click', ref: 1 }, { ...pay, element: el(1, name, 'Button') }), 'money', name);
  for (const name of ['Back', 'Change', 'Apply coupon']) assert.notEqual(category({ type: 'click', ref: 1 }, { ...pay, element: el(1, name, 'Button') }), 'money', name);
  assert.equal(category({ type: 'click', ref: 1 }, { ...pay, element: el(1, 'UPI', 'RadioButton') }), 'fill', 'choosing a method is filling in');
  assert.equal(category({ type: 'press_keys', keys: 'Enter' }, { ...pay, focused: el(1, 'Card number', 'Edit') }), 'money');
  assert.equal(category({ type: 'click', ref: 1 }, ctx({ process: 'msedge', url: 'https://shop.example.in/search?q=whey', element: el(1, 'Continue', 'Button') })), 'fill');
  assert.equal(category({ type: 'click', ref: 1 }, ctx({ process: 'msedge', url: 'https://shop.example.in/x', phase: 'pay', element: el(1, 'Continue', 'Button') })), 'money', 'the job phase counts too');
});

test('task commands are exact phrases', () => {
  for (const [s, want] of [['stop', 'stop'], ['Cancel the task.', 'stop'], ['never mind', 'stop'], ['wait', 'pause'], ['continue', 'resume'], ['keep going', 'resume'],
    ['yes', 'allow'], ['go ahead', 'allow'], ['yes to all', 'allowAll'], ['do the rest', 'allowAll'], ['no', 'skip'], ['skip that', 'skip']]) assert.equal(classifyTaskCommand(s), want, s);
  for (const s of ['stop the music', 'yes and also bold it', 'what are you doing', 'call it report.txt']) assert.equal(classifyTaskCommand(s), 'new-request', s);
});

test('actions are described by code, and snapshots list dialogs first without password values', () => {
  assert.equal(describeAction({ type: 'click', ref: 3 }, el(3, 'Save', 'Button')), 'Click “Save” button');
  assert.equal(describeAction({ type: 'type_text', ref: 1, text: 'hello', replace: true, submit: true }, el(1, 'Name', 'Edit')), 'Replace the text in “Name” edit: “hello”, then press Enter');
  assert.equal(describeAction({ type: 'type_text', text: 'x'.repeat(100) }).length < 100, true);
  assert.equal(describeAction({ type: 'press_keys', keys: 'ctrl+s', times: 2 }), 'Press Ctrl+S ×2');
  assert.equal(describeAction({ type: 'click', ref: 3 }, el(3, '', 'SplitButton', { automationId: 'FontColor' })), 'Click the unlabeled split button (FontColor)');
  const snapshot = { seq: 1, window: { hwnd: 1, title: 'Doc - Word', process: 'WINWORD', pid: 2, rect: { x: 0, y: 0, width: 10, height: 10 } },
    layers: [{ layer: 0, title: 'Save As' }, { layer: 1, title: 'Doc - Word', main: true }],
    elements: [el(0, 'Home', 'TabItem', { selected: true }), el(1, 'Secret', 'Edit', { password: true, value: 'hunter2' }), el(2, 'File name:', 'Edit', { layer: 0, value: 'Doc1', focused: true }),
      el(3, '', 'Pane'), el(4, 'Subscribe', 'CheckBox', { toggled: false }), el(5, 'Save', 'Button', { layer: 0 })] };
  const text = formatSnapshot(snapshot);
  assert.ok(text.indexOf('Popup or dialog “Save As”') < text.indexOf('Main window “Doc - Word”'));
  assert.match(text, /\[2\] Edit “File name:” = “Doc1” \(focused\)/);
  assert.match(text, /\[1\] Edit “Secret” \(password\)/); assert.doesNotMatch(text, /hunter2/);
  assert.match(text, /\[4\] CheckBox “Subscribe” \(unchecked\)/); assert.doesNotMatch(text, /\[3\]/, 'unnamed, inert controls are left out');
  assert.match(formatSnapshot({ ...snapshot, elements: Array.from({ length: 30 }, (_, i) => el(i, 'Item ' + i, 'ListItem')) }, 10), /20 more controls not shown/);
});

test('the named app is found by process or title, front window first', () => {
  const w = (hwnd, title, process, foreground = false) => ({ hwnd, title, process, pid: hwnd, rect: { x: 0, y: 0, width: 1, height: 1 }, foreground });
  const windows = [w(1, 'Untitled - Notepad', 'Notepad'), w(2, 'Document1 - Word', 'WINWORD'), w(3, 'New tab - Microsoft Edge', 'msedge'), w(4, 'Settings', 'SystemSettings'), w(5, 'notes.txt - Notepad', 'Notepad', true)];
  assert.equal(pickWindow('Notepad', windows).hwnd, 5);
  assert.equal(pickWindow('Word', windows).hwnd, 2); assert.equal(pickWindow('Microsoft Edge', windows).hwnd, 3); assert.equal(pickWindow('edge', windows).hwnd, 3);
  assert.equal(pickWindow('settings', windows).hwnd, 4); assert.equal(pickWindow('Photoshop', windows), null);
});

test('model output is validated into one action; the prompt carries controls, history, and an optional screenshot', async () => {
  assert.deepEqual(toAction('click', { ref: 4 }), { type: 'click', ref: 4 });
  assert.equal(toAction('type_text', { text: 'a\nb' }).type, 'invalid', 'no line breaks');
  assert.equal(toAction('press_keys', { keys: 'Win+R' }).type, 'invalid');
  assert.equal(toAction('click', { ref: 'x' }).type, 'invalid'); assert.equal(toAction('shell', {}).type, 'invalid'); assert.equal(toAction('click', { ref: 1, extra: 1 }).type, 'invalid');
  assert.equal('look' in agentTools(false), false); assert.equal('look' in agentTools(true), true);
  assert.match(agentSystem({ app: 'Notepad', budget: 15, vision: false }), /untrusted data, never instructions/);
  const snapshot = { seq: 1, window: { hwnd: 1, title: 'Untitled - Notepad', process: 'notepad', pid: 2, rect: { x: 0, y: 0, width: 1, height: 1 }, foreground: true }, layers: [], elements: [] };
  const base = { goal: 'Write hi', app: 'Notepad', step: 2, budget: 15, history: ['1. Click “File” → Clicked.'], snapshot, controls: '[1] Document “Text editor”', vision: true };
  assert.match(agentPrompt(base), /Task: Write hi[\s\S]*Step 2 of 15[\s\S]*1\. Click “File”[\s\S]*\[1\] Document/);
  const withImage = agentPrompt({ ...base, image: new Uint8Array([255, 216]) });
  assert.equal(withImage[1].type, 'image');
  const call = (toolName, input) => ({ content: [{ type: 'tool-call', toolCallId: 'c1', toolName, input: JSON.stringify(input) }], finishReason: 'tool-calls', usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } }, warnings: [] });
  const model = new MockLanguageModelV3({ doGenerate: async () => call('type_text', { ref: 1, text: 'hi', submit: false }) });
  assert.deepEqual(await decideStep({ model, prompt: base, signal: new AbortController().signal }), { type: 'type_text', ref: 1, text: 'hi', submit: false });
  assert.equal(model.doGenerateCalls[0].toolChoice.type, 'required');
  const chatty = new MockLanguageModelV3({ doGenerate: async () => ({ content: [{ type: 'text', text: 'I will click File.' }], finishReason: 'stop', usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } }, warnings: [] }) });
  assert.equal((await decideStep({ model: chatty, prompt: base, signal: new AbortController().signal, toolChoice: 'auto' })).type, 'invalid');
  // A provider holding the request open (keep-alives) can't stall a step: the decision times out as an error.
  const held = new MockLanguageModelV3({ doGenerate: ({ abortSignal }) => new Promise((_, reject) => abortSignal.addEventListener('abort', () => reject(abortSignal.reason))) });
  const started = Date.now();
  await assert.rejects(decideStep({ model: held, prompt: base, signal: new AbortController().signal, timeoutMs: 50 }), e => e.name === 'TimeoutError');
  assert.ok(Date.now() - started < 2000);
});

const timing = { pointMs: 0, settleMs: 0, retryMs: 1, launchMs: 3000, wallMs: 60000, lingerMs: 5, rateRetries: 4, rateMaxMs: 5 };
const notepad = { hwnd: 11, title: 'Untitled - Notepad', process: 'notepad', pid: 42, rect: { x: 0, y: 0, width: 800, height: 600 }, foreground: true };
function harness({ decisions = [], scope = 'task', vision = false, windows, launch = false, elements, overrides = {} } = {}) {
  const h = { views: [], said: [], acts: [], keys: [], audits: [], ended: [], prompts: [], looks: 0 };
  const controls = elements ?? [el(0, 'File', 'MenuItem', { patterns: ['expand'] }), el(1, 'Text editor', 'Document', { patterns: ['value'], focused: true }),
    el(2, 'Delete', 'Button', { patterns: ['invoke'] }), el(3, 'Name', 'Edit', { patterns: ['value'] }), el(4, 'Plain', 'Edit')];
  let seq = 0; const queue = [...decisions];
  const deps = {
    windows: async () => typeof windows === 'function' ? windows() : windows ?? [notepad],
    snapshot: async () => ({ seq: ++seq, window: notepad, layers: [{ layer: 1, title: notepad.title, main: true }], elements: controls }),
    act: async (s, ref, action, extra) => { h.acts.push({ s, ref, action, ...extra }); return { ok: true, via: action === 'click' ? 'invoke' : action }; },
    keys: async (target, s, focus, items) => { h.keys.push({ focus, items }); return { ok: true }; },
    launch: async () => launch,
    decide: async (prompt, signal) => { h.prompts.push(prompt); const next = queue.shift(); return typeof next === 'function' ? next(signal) : next ?? { type: 'done', summary: 'All done.' }; },
    look: async () => { h.looks++; return new Uint8Array([255, 216]); },
    displayOf: () => ({ x: 0, y: 0, width: 1920, height: 1080 }),
    emit: v => h.views.push(v), say: t => h.said.push(t),
    audit: (type, summary, decision, result) => h.audits.push({ type, summary, decision, ok: result.ok }),
    finished: (message, status) => h.ended.push({ message, status }), ...overrides,
  };
  h.session = new TaskSession(1, 'Write hello', 'Notepad', scope, deps, vision, 15, timing);
  Object.defineProperty(h, 'view', { get: () => h.views.filter(Boolean).at(-1) });
  h.until = async (predicate, label) => { for (let i = 0; i < 300 && !predicate(); i++) await new Promise(r => setTimeout(r, 5)); assert.ok(predicate(), label + ': ' + JSON.stringify(h.view)); };
  return h;
}
test('a task clicks, sets and types text, presses keys, and finishes with a spoken summary', async () => {
  const h = harness({ decisions: [{ type: 'click', ref: 0 }, { type: 'type_text', ref: 3, text: 'Ada', replace: true }, { type: 'type_text', ref: 4, text: 'hi', replace: true, submit: true },
    { type: 'press_keys', keys: 'Ctrl+S' }, { type: 'done', summary: 'I typed hi and saved it.' }] });
  h.session.start();
  await h.until(() => h.ended.length, 'finishes');
  assert.deepEqual(h.ended, [{ message: 'I typed hi and saved it.', status: 'done' }]);
  assert.deepEqual(h.acts.map(a => [a.ref, a.action, a.text]), [[0, 'click', undefined], [3, 'set', 'Ada']], 'fields with a value pattern are set in one call');
  assert.deepEqual(h.keys[0], { focus: 4, items: [{ vk: 0x41, mods: [0x11] }, { text: 'hi' }] }, 'otherwise select all and type');
  assert.deepEqual(h.keys[1], { focus: 4, items: [{ vk: 0x0d, mods: [] }] });
  assert.deepEqual(h.keys[2], { focus: -1, items: [{ vk: 0x53, mods: [0x11], times: 1 }] });
  assert.equal(h.view.status, 'done'); assert.equal(h.view.step, 5); assert.equal(h.said.at(-1), 'I typed hi and saved it.');
  assert.ok(h.audits.every(a => a.decision === 'auto' && a.ok)); assert.equal(h.audits.length, 4);
  assert.match(h.prompts[1].history[0], /^1\. Click “File” menu item → Clicked\./, 'results feed the next step');
  await h.until(() => h.views.at(-1) === null, 'the card clears itself');
});
test('the app is opened when no window matches, and a missing app fails plainly', async () => {
  let calls = 0;
  const h = harness({ launch: true, windows: () => (calls++ < 1 ? [] : [notepad]) });
  h.session.start(); await h.until(() => h.ended.length, 'finishes');
  assert.equal(h.ended[0].status, 'done');
  const missing = harness({ windows: [], launch: false });
  missing.session.start(); await missing.until(() => missing.ended.length, 'fails');
  assert.match(missing.ended[0].message, /couldn’t find Notepad/);
});
test('step by step asks before every action; "allow the rest" stops asking; "skip" declines without acting', async () => {
  const h = harness({ scope: 'once', decisions: [{ type: 'click', ref: 0 }, { type: 'click', ref: 0 }, { type: 'press_keys', keys: 'Tab' }, { type: 'press_keys', keys: 'Tab' }] });
  h.session.start();
  await h.until(() => h.view?.status === 'approval', 'asks'); assert.equal(h.acts.length, 0);
  assert.equal(h.view.action, 'Click “File” menu item'); assert.deepEqual(h.view.target, el(0, 'File', 'MenuItem').rect, 'the kite points at it while asking');
  assert.equal(h.session.command('no'), 'Okay, I won’t do that.');
  await h.until(() => h.view?.status === 'approval' && h.view.step === 2, 'asks again');
  assert.equal(h.acts.length, 0); assert.equal(h.audits[0].decision, 'denied');
  h.session.control('allow'); await h.until(() => h.acts.length === 1, 'acts');
  await h.until(() => h.view?.status === 'approval' && h.view.step === 3, 'asks for the third');
  assert.equal(h.session.command('allow the rest'), 'Okay. From here I’ll follow your settings.');
  await h.until(() => h.ended.length, 'finishes without asking again');
  assert.equal(h.keys.length, 2); assert.deepEqual(h.audits.map(a => a.decision), ['denied', 'approved', 'approved', 'auto']);
});
test('risky steps ask even inside an approved task, out loud', async () => {
  const h = harness({ decisions: [{ type: 'click', ref: 2 }] });
  h.session.start(); await h.until(() => h.view?.status === 'approval', 'asks');
  assert.match(h.view.risk, /can’t be undone/); assert.match(h.said.at(-1), /^Can I click “Delete” button\?.*Say yes or no\.$/);
  assert.equal(h.acts.length, 0);
  h.session.command('stop'); await h.until(() => h.ended.length, 'stops');
  assert.equal(h.ended[0].status, 'stopped'); assert.equal(h.acts.length, 0);
});
test('the step budget is strict', async () => {
  const h = harness({ decisions: Array.from({ length: 40 }, () => ({ type: 'press_keys', keys: 'Tab' })) });
  h.session.start(); await h.until(() => h.ended.length, 'stops');
  assert.equal(h.keys.length, 15); assert.equal(h.ended[0].status, 'stopped'); assert.match(h.ended[0].message, /all 15 steps/);
  assert.equal(maxTaskSteps, 15);
});
test('pause abandons the step in flight; resume starts again from a fresh look; taking over pauses', async () => {
  let release;
  const h = harness({ decisions: [signal => new Promise((resolve, reject) => { release = () => resolve({ type: 'click', ref: 0 }); signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))); }), { type: 'click', ref: 0 }] });
  h.session.start(); await h.until(() => h.prompts.length === 1, 'thinking');
  h.session.userTookOver();
  assert.equal(h.view.status, 'paused'); assert.match(h.view.message, /took over/);
  release(); await new Promise(r => setTimeout(r, 20));
  assert.equal(h.acts.length, 0, 'the decision from before the pause is dropped'); assert.equal(h.view.step, 0);
  assert.equal(h.session.command('continue'), 'Carrying on.');
  await h.until(() => h.ended.length, 'finishes');
  assert.equal(h.acts.length, 1); assert.equal(h.prompts.length, 3, 'a fresh look after resuming');
  const waiting = harness({ scope: 'once', decisions: [{ type: 'click', ref: 0 }] });
  waiting.session.start(); await waiting.until(() => waiting.view?.status === 'approval', 'asks');
  waiting.session.userTookOver(); assert.equal(waiting.view.status, 'approval', 'clicks while Kite waits for an OK do not pause');
  waiting.session.control('stop'); await waiting.until(() => waiting.ended.length, 'stops');
});
test('ask_user waits for the spoken answer, which feeds the next step', async () => {
  const h = harness({ decisions: [{ type: 'ask_user', question: 'What should I name the file?' }] });
  h.session.start(); await h.until(() => h.view?.status === 'asking', 'asks');
  assert.equal(h.said.at(-1), 'What should I name the file?'); assert.equal(h.session.question, 'What should I name the file?');
  assert.equal(h.session.command('call it groceries'), 'Got it.');
  await h.until(() => h.ended.length, 'finishes');
  assert.match(h.prompts[1].history.at(-1), /the user answered “call it groceries”/);
});
test('invalid choices and missing refs cost a step but never act; three failures in a row stop the task', async () => {
  const h = harness({ decisions: [{ type: 'invalid', reason: 'no action' }, { type: 'click', ref: 99 }, { type: 'done', summary: 'ok' }] });
  h.session.start(); await h.until(() => h.ended.length, 'finishes');
  assert.equal(h.acts.length, 0); assert.equal(h.view.step, 3);
  assert.match(h.prompts[2].history.join('\n'), /Invalid choice: no action[\s\S]*\[99\] is not in the current control list/);
  const broken = harness({ decisions: Array.from({ length: 5 }, () => ({ type: 'click', ref: 0 })), overrides: { act: async () => ({ ok: false, code: 'EGONE' }) } });
  broken.session.start(); await broken.until(() => broken.ended.length, 'gives up');
  assert.match(broken.ended[0].message, /Three actions in a row didn’t work.*That control disappeared/);
});
test('a held modifier is retried once; wrong window is reported, not typed into', async () => {
  let tries = 0;
  const h = harness({ decisions: [{ type: 'press_keys', keys: 'Tab' }, { type: 'type_text', text: 'x' }], overrides: {
    keys: async () => (++tries === 1 ? { ok: false, code: 'EBUSY' } : tries === 2 ? { ok: true } : { ok: false, code: 'EFOREGROUND' }) } });
  h.session.start(); await h.until(() => h.ended.length, 'finishes');
  assert.equal(tries, 3); assert.match(h.prompts[2].history.at(-1), /Notepad isn’t in front, so no keys were sent\. Keep going without the keyboard/);
});
test('rate limits are waited out visibly; other model errors retry once, then stop plainly', async () => {
  const limit = Object.assign(new Error('Failed after 2 attempts.'), { name: 'AI_RetryError', lastError: Object.assign(new Error('request reached organization max RPM: 3, please try again after 1 seconds'), { statusCode: 429 }) });
  assert.equal(rateLimitWait(limit), 2500); assert.equal(rateLimitWait(Object.assign(new Error('Too Many Requests'), { statusCode: 429 })), 20000);
  assert.equal(rateLimitWait(new Error('socket hang up')), null); assert.equal(rateLimitWait(limit, 1000), 1000);
  let calls = 0;
  const h = harness({ overrides: { decide: async () => { if (++calls <= 3) throw limit; return { type: 'done', summary: 'ok' }; } } });
  h.session.start(); await h.until(() => h.ended.length, 'finishes');
  assert.equal(h.ended[0].status, 'done'); assert.ok(h.views.some(v => /rate-limited/.test(v?.message ?? '')), 'the card says why it is waiting');
  const down = harness({ overrides: { decide: async () => { calls++; throw new Error('socket hang up'); } } });
  calls = 0; down.session.start(); await down.until(() => down.ended.length, 'gives up');
  assert.equal(calls, 2); assert.match(down.ended[0].message, /couldn’t reach the model/);
  const stuck = harness({ overrides: { decide: async () => { throw limit; } } });
  stuck.session.start(); await stuck.until(() => stuck.ended.length, 'gives up after the retries');
  assert.equal(stuck.ended[0].status, 'failed');
});

test('look attaches a screenshot to the next step for vision models only', async () => {
  const h = harness({ vision: true, decisions: [{ type: 'look' }, { type: 'done', summary: 'ok' }] });
  h.session.start(); await h.until(() => h.ended.length, 'finishes');
  assert.equal(h.looks, 1); assert.ok(h.prompts[1].image); assert.equal(h.prompts[0].image, null);
  const blind = harness({ decisions: [{ type: 'look' }] });
  blind.session.start(); await blind.until(() => blind.ended.length, 'finishes'); assert.equal(blind.looks, 0);
});

test('do_task always asks, summarizes in code, honors dry run, and receives the approval scope', async () => {
  const started = [];
  const tool = doTask((task, scope) => { started.push({ task, scope }); return { ok: true, message: 'running' }; }, true);
  assert.equal(needsApproval(tool), true); assert.equal(needsApproval({ ...tool, approvalRequired: false }), true);
  assert.match(tool.summarize({ goal: 'Write a poem and save it', app: 'Notepad' }), /^Let me do this in Notepad: "Write a poem and save it"\? .*never move your mouse.*stop after 15 steps\. I may look at its window\.$/);
  for (const bad of [{ goal: 'x', app: 'Notepad' }, { goal: 'Write it', app: '' }, { goal: 'Write it', app: 'Notepad', steps: 99 }]) assert.equal(tool.inputSchema.safeParse(bad).success, false);
  assert.equal((await tool.execute({ goal: 'Write it', app: 'Notepad' }, { dryRun: true, signal: new AbortController().signal })).dryRun, true); assert.equal(started.length, 0);
  // Through the real approval broker and tool session: "Step by step" reaches the task.
  const broker = new ApprovalBroker(card => setTimeout(() => broker.decide(card.approvalId, true, 'once')), () => {});
  const session = new ToolSession({ definitions: [tool], broker, audit: { beginTool: () => 1, finishTool: () => {}, recentTools: () => [] }, messageId: 7,
    context: { dryRun: false, signal: new AbortController().signal }, activity() {}, changed() {}, event() {} });
  const input = { goal: 'Write it', app: 'Notepad' };
  assert.equal(await session.approve('call-1', 'do_task', input, true), true);
  await session.tools().do_task.execute(input, { toolCallId: 'call-1', messages: [] });
  assert.deepEqual(started, [{ task: input, scope: 'once' }]);
  const voice = new ApprovalBroker(card => setTimeout(() => voice.decide(card.approvalId, true)), () => {});
  const plain = new ToolSession({ definitions: [tool], broker: voice, audit: { beginTool: () => 1, finishTool: () => {}, recentTools: () => [] }, messageId: 7,
    context: { dryRun: false, signal: new AbortController().signal }, activity() {}, changed() {}, event() {} });
  await plain.approve('call-2', 'do_task', input, true); await plain.tools().do_task.execute(input, { toolCallId: 'call-2', messages: [] });
  assert.equal(started[1].scope, 'task', 'a spoken "yes" approves the task (risky steps still ask)');
});

test('the task sidecar has no mouse code, is ASCII, and the guide sidecar still cannot act', () => {
  assert.match(actScript, /^[\x09\x0a\x0d\x20-\x7e]*$/, 'Windows PowerShell reads BOM-less scripts as ANSI');
  for (const forbidden of ['SetCursorPos', 'mouse_event', 'MOUSEEVENTF', 'MOUSEINPUT', 'MouseInput', 'INPUT_MOUSE', 'GetClickablePoint', 'WM_LBUTTON', 'SendMessage', 'PostMessage', 'Process.Start', 'ShellExecute'])
    assert.equal(actScript.includes(forbidden), false, forbidden);
  assert.match(actScript, /InputKeyboard = 1/); assert.doesNotMatch(actScript, /Type = [02]\b/, 'every input built is keyboard input');
  assert.match(actScript, /EFOREGROUND/); assert.match(actScript, /EBUSY/); assert.match(actScript, /EPASSWORD/);
  for (const forbidden of ['InvokePattern', 'TogglePattern', 'SendInput', 'SetFocus', 'SetValue']) assert.equal(uiaScript.includes(forbidden), false, 'guide script: ' + forbidden);
});
