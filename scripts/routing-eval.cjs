// Live routing eval (docs/end-to-end-jobs.md §3.8): errands must start do_task; "how do I…" must not; repeats of a
// remembered order must use reorder (phase 5).
// One model call per request with Kite's real system prompt, idle context and tool definitions; nothing runs.
// Usage: npm run eval:routing -- [provider:model] [--runs N] [--concurrency N]
// Key: <PROVIDER>_API_KEY in the environment or in .env (KIMI_, GEMINI_ and GROK_ are accepted too).
require('../tests/register.cjs');
const fs = require('node:fs'), path = require('node:path');
const { generateText, tool, stepCountIs } = require('ai');
const { describeModel } = require('../src/main/ai/catalog.ts');
const { getModel } = require('../src/main/ai/providers.ts');
const { providerOptionsFor } = require('../src/main/ai/ask.ts');
const { buildSystemPrompt } = require('../src/main/ai/systemPrompt.ts');
const { routingHints } = require('../src/main/ai/routing.ts');
const impl = name => require(`../src/main/tools/impl/${name}.ts`);

// Errands Kite should start as a task in the browser, stopping wherever the user must take over. `needs`: the request
// lacks something only the user knows (until memory exists), so one short question instead of a task also passes.
const jobs = [
  'Buy me 60 sachets of Amul protein.', 'Order a pack of AA batteries on Amazon.', 'Order 5 kg of basmati rice from BigBasket.',
  'Add a phone case for the Pixel 9 to my Flipkart cart.', 'Buy a 1 TB SSD under 6000 rupees.', 'Reorder printer ink from Amazon.',
  'Purchase a 500 rupee Amazon gift card.', 'Order a margherita pizza from Domino’s.', 'Get me two tickets for Dune on BookMyShow on Saturday evening.',
  'Book a train ticket from Pune to Mumbai for Monday on IRCTC.', { text: 'Find me a cheap flight to Goa next Friday and book it.', needs: 'where they fly from' },
  { text: 'Book a cab to the airport for 6 am tomorrow.', needs: 'the pickup address' }, 'Book a table for two tonight on Zomato.',
  { text: 'Book a doctor’s appointment on Practo for this week.', needs: 'what kind of doctor' }, 'Recharge my Jio number with the 299 plan.',
  { text: 'Pay my electricity bill.', needs: 'the provider' }, { text: 'Renew my car insurance.', needs: 'the insurer' }, 'Subscribe me to Spotify Premium.',
  'Fill in the passport renewal form on Passport Seva.', { text: 'Buy a birthday card and have it delivered to my mom.', needs: 'her address' },
].map(c => typeof c === 'string' ? { text: c } : c);
// Repeats of the order Kite remembers (below): reorder, which shows the past order on its card.
const repeats = ['Order my protein again.', 'Get me the same protein as last time.', 'Reorder my whey.', 'Same order as last time, please.'];
// Questions: answer, guide or sketch, but never operate the app for the user.
const questions = [
  'How do I buy something on Amazon?', 'How do I check out on Flipkart?', 'How do I book a train ticket on IRCTC?', 'How do I cancel an order on Amazon?',
  'Show me how to add something to my cart in Edge.', 'Where is the settings menu in Edge?', 'How do I turn on dark mode in Windows?',
  'How does paying with UPI work?', 'What’s a good protein powder for beginners?', 'Is protein cheaper in sachets or in tubs?',
];

function arg(name, fallback) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; }
const [provider, ...rest] = (process.argv.slice(2).find(a => a.includes(':')) ?? 'deepseek:deepseek-flash').split(':');
const model = describeModel({ provider, id: rest.join(':') });
const runs = Number(arg('--runs', 1)), concurrency = Number(arg('--concurrency', 8));
const envNames = { deepseek: ['DEEPSEEK_API_KEY'], moonshot: ['MOONSHOT_API_KEY', 'KIMI_API_KEY'], google: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
  groq: ['GROQ_API_KEY', 'GROK_API_KEY'], openai: ['OPENAI_API_KEY'], anthropic: ['ANTHROPIC_API_KEY'] }[provider] ?? [];
const dotenv = (() => { try { return fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8'); } catch { return ''; } })();
const key = envNames.map(n => process.env[n] ?? dotenv.match(new RegExp(`^${n}=(.*)$`, 'm'))?.[1]?.trim()).find(Boolean);
if (!key) { console.error(`No key: set ${envNames.join(' or ')}.`); process.exit(2); }

// One remembered order, as memory holds it after phase 4, so "again" has something to repeat.
const { orderValue, pastOrders } = require('../src/shared/orders.ts');
const { memoryContext } = require('../src/shared/memory.ts');
const orderFact = { id: 1, kind: 'order', key: 'order.shop-amul-com-a1', label: 'Amul Whey Protein, 60 sachets', source: 'Ordered on shop.amul.com, 1 Oct', created: 1, updated: 1, used: null,
  value: orderValue({ items: ['Amul Whey Protein, 60 sachets, Unflavoured'], total: '₹2,149', site: 'shop.amul.com', payment: 'Cash on delivery', number: 'A1-2290', when: 'Friday' }) };
const past = pastOrders([orderFact]);
// The tool set and context of an idle voice turn with guide, whiteboard and computer use on (voice/service.ts).
const ok = { ok: true, message: '' }, noop = async () => '';
const store = {}, definitions = [impl('get_datetime').getDatetime, impl('open_app').openApp([], noop), impl('open_url').openUrl(noop),
  impl('web_search').webSearch('google', noop), impl('type_text').typeText({}, () => {}), impl('read_clipboard').readClipboard(noop),
  impl('write_clipboard').writeClipboard(noop), impl('set_timer').setTimer(store), impl('set_reminder').setReminder(store),
  impl('list_reminders').listReminders(store), impl('cancel_reminder').cancelReminder(store), impl('create_note').createNote('', noop),
  impl('show_me_how').showMeHow(() => ok), impl('explain_on_whiteboard').explainOnWhiteboard(() => ok),
  impl('do_task').doTask(() => ok, model.supportsVision), impl('reorder').reorder({ orders: () => past, handsOver: () => false, address: () => null, start: () => ok }),
  ...(model.supportsVision ? [impl('read_screen').readScreen(false, async () => ok)] : [])];
// get_datetime needs no approval, so the real loop runs it and carries on; every other call ends the turn here.
const tools = Object.fromEntries(definitions.map(d => [d.name, tool({ description: d.description, inputSchema: d.inputSchema,
  ...(d.name === 'get_datetime' ? { execute: async () => (await d.execute({}, { signal: new AbortController().signal })).data ?? {} } : {}) })]));
const system = buildSystemPrompt(model, [routingHints.task, routingHints.board, routingHints.guide, memoryContext([orderFact])].join('\n'));
const refusal = /\b(can(no|’|')t|unable to|not able to|won(’|')t)\b(?!.*\bwithout\b).*\b(buy|purchase|order|pay|book|make|renew|recharge|subscribe)/i;

async function route(text) {
  const result = await generateText({ model: getModel(model.provider, model.id, { getKey: () => key }), system, tools, maxRetries: 2, stopWhen: stepCountIs(3),
    messages: [{ role: 'user', content: text }], maxOutputTokens: 4096, providerOptions: providerOptionsFor(model), abortSignal: AbortSignal.timeout(90_000) });
  const call = result.steps.flatMap(s => s.toolCalls).find(c => c.toolName !== 'get_datetime');
  const reply = result.steps.map(s => s.text).join(' ').trim();
  const invalid = call && !definitions.find(d => d.name === call.toolName)?.inputSchema.safeParse(call.input).success;
  return { tool: call?.toolName ?? null, input: call?.input, invalid, reply, refused: refusal.test(reply), asked: !call && /\?/.test(reply) };
}
(async () => {
  const cases = [...jobs.map(c => ({ ...c, job: true })), ...repeats.map(text => ({ text, job: true, repeat: true })), ...questions.map(text => ({ text, job: false }))].flatMap(c => Array.from({ length: runs }, () => c));
  const results = new Array(cases.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, cases.length) }, async () => {
    for (let i = next++; i < cases.length; i = next++) {
      try { results[i] = { ...cases[i], ...(await route(cases[i].text)) }; } catch (error) { results[i] = { ...cases[i], error: String(error?.statusCode ?? error?.message ?? error).slice(0, 120) }; }
    }
  }));
  const started = r => (r.tool === 'do_task' || r.tool === 'reorder') && !r.invalid;
  const verdict = r => r.error ? false : r.repeat ? r.tool === 'reorder' && !r.invalid : r.job ? started(r) || (!!r.needs && r.asked && !r.refused) : !started(r);
  for (const r of results) {
    const detail = r.error ? `error ${r.error}` : r.tool === 'reorder' ? `reorder${r.invalid ? ' (INVALID INPUT)' : ''} · ${r.input?.about}` : r.tool === 'do_task' ? `do_task${r.invalid ? ' (INVALID INPUT)' : ''} ${r.input?.app} · ${r.input?.goal}`
      : `${r.tool ?? (r.asked ? 'asked' : 'reply')}${r.refused ? ' (REFUSED)' : ''}${r.needs && r.asked ? ` (allowed: needs ${r.needs})` : ''} · ${r.reply.slice(0, 110).replace(/\s+/g, ' ')}`;
    console.log(`${verdict(r) ? 'pass' : 'FAIL'}  ${r.job ? 'job' : 'ask'}  ${r.text}\n      ${detail}`);
  }
  const passed = results.filter(verdict).length;
  console.log(`\n${model.label}: ${passed}/${results.length} · errands started ${results.filter(r => r.job && !r.repeat && started(r)).length}/${jobs.length * runs}`
    + ` · repeats reordered ${results.filter(r => r.repeat && r.tool === 'reorder').length}/${repeats.length * runs}`
    + ` · asked first ${results.filter(r => r.job && r.asked).length} · refusals ${results.filter(r => r.refused).length}`
    + ` · questions kept out ${results.filter(r => !r.job && !r.error && !started(r)).length}/${questions.length * runs}`);
  process.exitCode = passed === results.length ? 0 : 1;
})();
