// Shared by the live evals (routing-eval.cjs, board-eval.cjs): provider keys, and the tools of an idle voice turn
// with guide, whiteboard and computer use on, as voice/service.ts builds them. Nothing here runs an action.
require('../tests/register.cjs');
const fs = require('node:fs'), path = require('node:path');
const impl = name => require(`../src/main/tools/impl/${name}.ts`);

// <PROVIDER>_API_KEY in the environment or in .env (KIMI_, GEMINI_ and GROK_ are accepted too). Values are never printed.
const envNames = { deepseek: ['DEEPSEEK_API_KEY'], moonshot: ['MOONSHOT_API_KEY', 'KIMI_API_KEY'], google: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
  groq: ['GROQ_API_KEY', 'GROK_API_KEY'], openai: ['OPENAI_API_KEY'], anthropic: ['ANTHROPIC_API_KEY'], cartesia: ['CARTESIA_API_KEY'] };
const dotenv = (() => { try { return fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8'); } catch { return ''; } })();
function keyFor(provider) {
  return (envNames[provider] ?? []).map(n => process.env[n] ?? dotenv.match(new RegExp(`^${n}=(.*)$`, 'm'))?.[1]?.trim()).find(Boolean);
}

/**
 * Tool definitions of an idle voice turn. `whiteboard` starts a lesson (default: accepted, nothing drawn);
 * `orders` are remembered past orders for reorder.
 */
function voiceDefinitions(model, { whiteboard, orders = [] } = {}) {
  const ok = { ok: true, message: '' }, noop = async () => '', store = {};
  return [impl('get_datetime').getDatetime, impl('open_app').openApp([], noop), impl('open_url').openUrl(noop),
    impl('web_search').webSearch('google', noop), impl('type_text').typeText({}, () => {}), impl('read_clipboard').readClipboard(noop),
    impl('write_clipboard').writeClipboard(noop), impl('set_timer').setTimer(store), impl('set_reminder').setReminder(store),
    impl('list_reminders').listReminders(store), impl('cancel_reminder').cancelReminder(store), impl('create_note').createNote('', noop),
    impl('show_me_how').showMeHow(() => ok), impl('explain_on_whiteboard').explainOnWhiteboard(whiteboard ?? (() => ok)),
    impl('do_task').doTask(() => ok, model.supportsVision), impl('reorder').reorder({ orders: () => orders, handsOver: () => false, address: () => null, start: () => ok }),
    ...(model.supportsVision ? [impl('read_screen').readScreen(false, async () => ok)] : [])];
}
/** Run `work` over `items` with at most `limit` in flight; results keep the input order. */
async function pool(items, limit, work) {
  const results = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (let i = next++; i < items.length; i = next++) results[i] = await work(items[i], i);
  }));
  return results;
}
/** Shared across eval processes: reserve dev-key request slots without including waits in model clocks. */
async function providerSlot(provider, rpm = provider === 'moonshot' || provider === 'groq' ? 3 : 0) {
  if (!rpm) return;
  const file = path.join(require('node:os').tmpdir(), `kite-eval-${provider}-slot.json`), lock = file + '.lock';
  let reservation;
  for (;;) {
    let fd;
    try {
      fd = fs.openSync(lock, 'wx');
      let next = 0; try { next = JSON.parse(fs.readFileSync(file, 'utf8')).next ?? 0; } catch { /* first reservation */ }
      reservation = Math.max(Date.now(), next);
      fs.writeFileSync(file, JSON.stringify({ next: reservation + 60_000 / rpm + 1000 }));
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      // Locks only protect a synchronous read/write, never a network call.
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 10_000) fs.unlinkSync(lock); } catch { /* another process released it */ }
      await new Promise(r => setTimeout(r, 200));
    } finally { if (fd !== undefined) { fs.closeSync(fd); fs.unlinkSync(lock); } }
  }
  if (reservation > Date.now()) await new Promise(r => setTimeout(r, reservation - Date.now()));
}
module.exports = { envNames, keyFor, voiceDefinitions, pool, providerSlot };
