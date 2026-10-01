// Live end-to-end job (docs/end-to-end-jobs.md phase 1 exit): a real model plans and drives Edge (InPrivate, throwaway
// profile) through Kite Test Mart to the cart, through the real task sidecar and TaskSession. A scripted user answers
// questions and declines anything risky or off the site. The shop's own state decides pass or fail.
//   npm run test:job -- [runs] [provider:model] [--ambiguous]   (default: 1 run on deepseek:deepseek-flash)
// --ambiguous asks only for "60 sachets of Sunfold protein": whey or isolate, and which flavour, are the user's to choose.
// --memory starts with a saved name and pincode (phase 3): the pincode prompt can be filled from memory, and the run fails
// if any prompt sent to the model carries a saved value.
// Edge comes to the front while a job runs; keys are only sent while it is in front.
require('./register.cjs');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { ActClient } = require('../src/main/agent/sidecar.ts');
const { TaskSession } = require('../src/main/agent/session.ts');
const { decideStep, agentSystem, agentPrompt } = require('../src/main/agent/model.ts');
const { createMemory } = require('../src/main/memory/store.ts');
const { factsFromAnswer } = require('../src/shared/memory.ts');
const { planJob } = require('../src/main/agent/planner.ts');
const { getModel } = require('../src/main/ai/providers.ts');
const { describeModel, providerTraits } = require('../src/main/ai/catalog.ts');
const { providerOptionsFor } = require('../src/main/ai/ask.ts');
const { startShop } = require('./fixtures/shop/server.cjs');

const edge = ['ProgramFiles(x86)', 'ProgramFiles'].map(v => process.env[v] && path.join(process.env[v], 'Microsoft', 'Edge', 'Application', 'msedge.exe')).find(p => p && fs.existsSync(p));
const delay = ms => new Promise(r => setTimeout(r, ms));
const runs = Number(process.argv.slice(2).find(a => /^\d+$/.test(a)) ?? 1);
const [provider, ...rest] = (process.argv.slice(2).find(a => a.includes(':')) ?? 'deepseek:deepseek-flash').split(':');
const entry = describeModel({ provider, id: rest.join(':') });
const envNames = { deepseek: ['DEEPSEEK_API_KEY'], moonshot: ['MOONSHOT_API_KEY', 'KIMI_API_KEY'], google: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'], openai: ['OPENAI_API_KEY'], anthropic: ['ANTHROPIC_API_KEY'] }[provider] ?? [];
const dotenv = (() => { try { return fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8'); } catch { return ''; } })();
const key = envNames.map(n => process.env[n] ?? dotenv.match(new RegExp(`^${n}=(.*)$`, 'm'))?.[1]?.trim()).find(Boolean);
const goal = process.argv.includes('--ambiguous') ? 'Buy me 60 sachets of Sunfold protein from Kite Test Mart'
  : 'Find Sunfold Whey Protein, 60 sachets, unflavoured, on Kite Test Mart and add one pack to the cart';
const wanted = 'sunfold-whey~60-sachets~unflavoured';

async function job(shop, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kite-job-live-'));
  const browser = spawn(edge, [`--user-data-dir=${path.join(dir, 'profile')}`, '--inprivate', '--no-first-run', '--no-default-browser-check',
    '--window-position=40,40', '--window-size=1400,980', 'about:blank'], { stdio: 'ignore' });
  const client = new ActClient({ directory: path.join(dir, 'agent'), excludePid: process.pid, toDip: r => r });
  const model = getModel(entry.provider, entry.id, { getKey: () => key }), toolChoice = providerTraits[entry.provider].requiredToolChoice ? 'required' : 'auto';
  const record = { run, questions: [], approvals: [], log: [], started: Date.now(), leaks: [] };
  // Memory over an in-memory table with a stand-in cipher: what matters here is what reaches the model.
  let memory;
  if (process.argv.includes('--memory')) {
    const rows = new Map(); let id = 0;
    const store = createMemory({ list: () => [...rows.values()], put: r => { const old = [...rows.values()].find(x => x.key === r.key); const row = { ...r, id: old?.id ?? ++id, used_at: null }; rows.set(row.id, row); return row.id; },
      remove: i => rows.delete(i), removeAll: () => { rows.clear(); return 0; }, touch: () => {} },
    { isEncryptionAvailable: () => true, encryptString: v => Buffer.from(v), decryptString: b => b.toString() }, { enabled: () => true });
    store.save({ kind: 'profile', key: 'profile.name', label: 'Name', value: 'Asha Kulkarni', source: 'live test' });
    store.save({ kind: 'address', key: 'home.pincode', label: 'Home pincode', value: '411045', source: 'live test' });
    memory = { context: () => store.context(), redact: t => store.redact(t), fill: t => store.fill(t), chose: () => {},
      learn: (q, a, where) => { for (const f of factsFromAnswer(q, a, where)) store.save(f); } };
  }
  try {
    await delay(3000);
    let session;
    const ended = new Promise(resolve => {
      session = new TaskSession(run, goal, 'Microsoft Edge', 'task', {
        windows: s => client.windows(s), snapshot: (t, s) => client.snapshot(t, s), find: (t, text, s) => client.find(t, text, s),
        act: (q, r, a, e, s) => client.act(q, r, a, e, s), keys: (t, q, f, i, s) => client.keys(t, q, f, i, s), launch: async () => false,
        // As TaskService does for Edge, but into this InPrivate instance (without --inprivate it would open a signed-in window).
        openUrl: async url => { spawn(edge, [`--user-data-dir=${path.join(dir, 'profile')}`, '--inprivate', url], { stdio: 'ignore' }); record.log.push(`opened ${url} without the keyboard`); return true; },
        plan: async signal => {
          const plan = await planJob({ model, goal, app: 'Microsoft Edge', signal, toolChoice, providerOptions: providerOptionsFor(entry) });
          record.planned = { kind: plan.kind, site: plan.site, search: plan.search };
          // The fictional store lives on this machine: point the plan at it, keeping the model's kind and search words.
          return { ...plan, site: '127.0.0.1', scope: ['127.0.0.1'], start: shop.url };
        },
        decide: (prompt, signal) => {
          if (memory) { const sent = agentSystem(prompt) + JSON.stringify(agentPrompt(prompt)); for (const v of ['411045', 'Asha', 'Kulkarni']) if (sent.includes(v)) record.leaks.push(`step ${prompt.step}: ${v}`); }
          return decideStep({ model, prompt, signal, toolChoice, providerOptions: providerOptionsFor(entry) });
        },
        memory,
        displayOf: r => r,
        emit: view => {
          if (!view || view.id !== run) return;
          // The scripted user: answers questions, keeps going when asked, declines anything risky or off the site.
          if (view.status === 'asking' && !record.questions.includes(view.message + '@' + view.step)) {
            record.questions.push(view.message + '@' + view.step);
            const answer = view.job?.choices ? 'the 60 sachets unflavoured one' : /pin ?code|postal/i.test(view.message) ? '411045' : /flavou?r/i.test(view.message) ? 'Unflavoured.' : /whey|isolate|which (one|product)/i.test(view.message) ? 'The whey protein, unflavoured.' : 'You decide.';
            record.questions[record.questions.length - 1] += ` → “${answer}”${view.job?.choices ? ` [options: ${view.job.choices.map(o => o.label).join(' / ')}]` : ''}`;
            setTimeout(() => session.command(answer), 300);
          }
          if (view.status === 'paused') {
            record.approvals.push('paused@' + view.step); record.log.push(`paused: ${view.message}`);
            setTimeout(() => session.command('continue'), 3000);
          }
          if (view.status === 'approval' && !record.approvals.includes(view.message + '@' + view.step)) {
            record.approvals.push(view.message + '@' + view.step);
            setTimeout(() => session.control(/taking longer than usual/.test(view.message) ? 'allow' : 'skip'), 300);
          }
        },
        say: text => record.log.push(`say: ${text}`),
        audit: (type, summary, decision, result) => record.log.push(`${result.ok ? 'ok ' : 'ERR'} ${summary}${decision === 'approved' ? ' (approved)' : ''} → ${result.message}`),
        finished: (message, status) => resolve({ message, status }),
        log: (event, data) => { if (event !== 'task:start') record.log.push(`${event} ${JSON.stringify(data ?? {})}`); },
      }, false, 15);
      session.start();
    });
    const result = await Promise.race([ended, delay(4 * 60_000).then(() => ({ status: 'timeout', message: '' }))]);
    if (result.status === 'timeout') session.control('stop');
    const state = shop.state();
    Object.assign(record, result, { steps: session.steps, ms: Date.now() - record.started, cart: state.cart, orders: state.orders.length,
      history: session.view().log, pincode: state.pincode ?? null, pass: record.leaks.length === 0 && result.status === 'done' && state.orders.length === 0 && state.cart.length === 1 && state.cart[0].sku === wanted && state.cart[0].qty === 1 && /60 sachets/.test(result.message)
        // A vague request must be asked about, not settled by the page's defaults.
        && (!process.argv.includes('--ambiguous') || record.questions.length >= 1) });
    return record;
  } finally {
    client.stop();
    try { execFileSync('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ }
    await delay(1500); try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Edge may still hold it */ }
  }
}

(async () => {
  if (!edge || !key) { console.error(!edge ? 'Microsoft Edge is not installed.' : `No key: set ${envNames.join(' or ')}.`); process.exit(2); }
  const shop = await startShop(0), results = [];
  try {
    for (let run = 1; run <= runs; run++) {
      shop.reset();
      const r = await job(shop, run); results.push(r);
      console.log(`\nrun ${run}: ${r.pass ? 'PASS' : 'FAIL'} · ${r.status} · ${r.steps} steps · ${(r.ms / 1000).toFixed(0)} s · ${r.questions.length} questions · planned ${JSON.stringify(r.planned)}`);
      console.log(`  said: ${r.message}`);
      console.log(`  cart: ${JSON.stringify(r.cart.map(l => `${l.qty} × ${l.sku}`))} · orders ${r.orders}`);
      if (r.questions.length) console.log(`  questions: ${r.questions.join(' | ')}`);
      if (r.approvals.length) console.log(`  approvals: ${r.approvals.join(' | ')}`);
      if (process.argv.includes('--memory')) console.log(`  memory: shop pincode ${r.pincode ?? 'not set'} · ${r.leaks.length ? `LEAKS ${r.leaks.join(', ')}` : 'no saved value in any prompt'}`);
      console.log(r.log.map(l => `    ${l}`).join('\n'));
    }
  } finally { await shop.close(); }
  const passed = results.filter(r => r.pass).length;
  console.log(`\n${entry.label}: ${passed}/${results.length} to the cart · median ${results.map(r => r.steps).sort((a, b) => a - b)[Math.floor(results.length / 2)]} steps · questions ${results.map(r => r.questions.length).join(',')}`);
  process.exit(passed === results.length ? 0 : 1);
})();
