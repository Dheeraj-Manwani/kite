// Whiteboard harness (docs/whiteboard-roadmap.md phase 0): runs the golden prompts (board-eval/prompts.json) through
// the lesson path of a voice turn on each model, with Kite's real system prompt, idle context and tool set, and scores
// every lesson with src/shared/boardMetrics.ts. Follow-ups are asked about the board the lesson left, with the board
// context Kite gives the model. Nothing is drawn or spoken; the turn stops once a valid lesson arrives.
// Usage: npm run eval:board -- [provider:model ...] [--prompts id,id] [--limit N] [--no-follow-ups]
//          [--concurrency N] [--rpm provider=N] [--out file] [--fresh]
// Default models: DeepSeek Flash, GPT OSS 120B on Groq, Kimi K2.6 (3 requests a minute on the dev key), where keys exist.
// Results merge into docs/performance/whiteboard/latest.json by model, saved after every prompt; a rerun resumes where
// the last one stopped (--fresh starts the file over). Lesson content is
// model-written board text, no user data. Render them with `npm run eval:board:gallery`.
const { keyFor, voiceDefinitions, pool } = require('./eval-common.cjs');
const fs = require('node:fs'), path = require('node:path');
const { streamText, tool, stepCountIs, parsePartialJson } = require('ai');
const { describeModel } = require('../src/main/ai/catalog.ts');
const { getModel } = require('../src/main/ai/providers.ts');
const { providerOptionsFor } = require('../src/main/ai/ask.ts');
const { voiceOutputTokens } = require('../src/main/ai/agentLoop.ts');
const { buildSystemPrompt } = require('../src/main/ai/systemPrompt.ts');
const { routingHints } = require('../src/main/ai/routing.ts');
const { BoardService } = require('../src/main/board/service.ts');
const { applyBeat, panelSize } = require('../src/shared/board.ts');
const { lessonMetrics, referenceDisplay } = require('../src/shared/boardMetrics.ts');
const { lessonInput, toLesson } = require('../src/main/tools/impl/explain_on_whiteboard.ts');

const argv = process.argv.slice(2);
const arg = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback; };
const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'board-eval', 'prompts.json'), 'utf8'));
const only = arg('--prompts')?.split(',');
const prompts = golden.prompts.filter(p => !only || only.includes(p.id)).slice(0, Number(arg('--limit', Infinity)));
const followUps = !argv.includes('--no-follow-ups');
const out = path.resolve(arg('--out', path.join(__dirname, '..', 'docs', 'performance', 'whiteboard', 'latest.json')));
const requested = argv.filter((a, i) => a.includes(':') && !argv[i - 1]?.startsWith('--'));
const models = (requested.length ? requested : ['deepseek:deepseek-flash', 'groq:openai/gpt-oss-120b', 'moonshot:kimi-k2.6'])
  .map(spec => { const [provider, ...rest] = spec.split(':'); return describeModel({ provider, id: rest.join(':') }); })
  .filter(m => keyFor(m.provider) || (console.error(`Skipping ${m.label}: no ${m.provider} key.`), false));
if (!models.length || (requested.length && models.length < requested.length)) { console.error('Missing keys; nothing run.'); process.exit(2); }
// Requests per minute the dev keys allow: Kimi 3; Groq's free tier 8,000 tokens a minute, about one voice turn (≈6k tokens of
// prompt and tools). Override with --rpm provider=N; everything else runs `--concurrency` prompts at once.
const rpm = { moonshot: 3, groq: 1, ...Object.fromEntries((arg('--rpm') ?? '').split(',').filter(Boolean).map(s => s.split('=')).map(([k, v]) => [k, Number(v)])) };
const concurrency = Number(arg('--concurrency', 6));
const gates = new Map();
/** Wait for this provider's next request slot. */
async function slot(provider) {
  if (!rpm[provider]) return;
  const gap = 60_000 / rpm[provider], prior = gates.get(provider) ?? 0, at = Math.max(Date.now(), prior);
  gates.set(provider, at + gap);
  if (at > Date.now()) await new Promise(r => setTimeout(r, at - Date.now()));
}
const median = values => { const v = values.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null; };
const mean = values => { const v = values.filter(Number.isFinite); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 100) / 100 : null; };
const ms = n => n === null || n === undefined ? '—' : `${(n / 1000).toFixed(1)}s`;

/** A lesson is lint-clean when nothing collides, overflows, runs through a shape, or sits on a line. Crossings are reported apart. */
const clean = m => m.overlaps === 0 && m.overflow === 0 && m.through === 0 && m.textOnLines === 0;

const delay = ms => new Promise(r => setTimeout(r, ms));
/**
 * One voice turn. Rate limits and server errors are retried here rather than inside the SDK, so each attempt starts
 * its own clock: waiting out a dev key's limits is recorded (retries, waitedMs) but never counted as model time.
 */
async function turn(model, key, board, messages) {
  let waitedMs = 0;
  for (let retry = 0; ; retry++) {
    try {
      const result = await attempt(model, key, board, messages);
      return { ...result, record: { ...result.record, retries: retry, waitedMs } };
    } catch (error) {
      const status = error?.statusCode ?? error?.lastError?.statusCode;
      if (!(status === 429 || status >= 500 || error?.isRetryable) || retry >= 10) throw error;
      const after = Number(error?.responseHeaders?.['retry-after']);
      const wait = Math.min(90_000, Number.isFinite(after) && after > 0 ? after * 1000 + 250 : 2000 * 2 ** retry);
      waitedMs += wait; await delay(wait);
    }
  }
}
/** One streamed model request: timings for the first token, the lesson starting, its first complete beat, and the call. */
async function attempt(model, key, board, messages) {
  const definitions = voiceDefinitions(model, { whiteboard: lesson => board.start(lesson) });
  const tools = Object.fromEntries(definitions.map(d => [d.name, tool({ description: d.description, inputSchema: d.inputSchema,
    toModelOutput: ({ output }) => ({ type: 'text', value: JSON.stringify(output) }),
    // Only the lesson and the clock run; any other tool ends the turn as it would await approval.
    ...(d.name === 'explain_on_whiteboard' || d.name === 'get_datetime' ? { execute: async input => d.execute(input, { signal: new AbortController().signal, dryRun: false }) } : {}) })]));
  const system = buildSystemPrompt(model, board.context() ?? [routingHints.task, routingHints.board, routingHints.guide].join('\n'));
  await slot(model.provider);
  const started = performance.now(), at = () => Math.round(performance.now() - started);
  const record = { firstTokenMs: null, lessonStartMs: null, firstBeatMs: null, firstStrokeMs: null, totalMs: null, attempts: 0, invalid: 0, tool: null, reply: '', outputTokens: null, reasoningTokens: null };
  const inputs = new Map();
  const result = streamText({ model: getModel(model.provider, model.id, { getKey: () => key }), system, messages, tools, maxRetries: 0,
    maxOutputTokens: voiceOutputTokens, providerOptions: providerOptionsFor(model), abortSignal: AbortSignal.timeout(180_000), onError: () => undefined,
    // The real loop goes on after a lesson for a filler line; the harness stops at the moment Kite could start drawing.
    stopWhen: [stepCountIs(3), ({ steps }) => steps.at(-1).toolResults.some(r => r.toolName === 'explain_on_whiteboard') || !steps.at(-1).toolCalls.length] });
  let accepted = null, lesson = null;
  for await (const part of result.fullStream) {
    if (part.type === 'error') throw part.error;
    if (record.firstTokenMs === null && ['text-delta', 'reasoning-delta', 'tool-input-start', 'tool-call'].includes(part.type)) record.firstTokenMs = at();
    if (part.type === 'text-delta') record.reply += part.text;
    if (part.type === 'tool-input-start' && part.toolName === 'explain_on_whiteboard') inputs.set(part.id, { started: at(), text: '', firstBeat: null });
    if (part.type === 'tool-input-delta' && inputs.has(part.id)) {
      const input = inputs.get(part.id); input.text += part.delta;
      // When streaming lands (phase 1), beat 1 can play once the model has moved on to beat 2.
      if (input.firstBeat === null && part.delta.includes('{')) {
        const { value } = await parsePartialJson(input.text);
        if (Array.isArray(value?.beats) && value.beats.length >= 2) input.firstBeat = at();
      }
    }
    if (part.type === 'tool-call') {
      record.tool ??= part.toolName;
      if (part.toolName === 'explain_on_whiteboard') record.attempts++;
    }
    if (part.type === 'tool-result' && part.toolName === 'explain_on_whiteboard' && part.output?.ok) {
      accepted = part.toolCallId; lesson = part.input; record.tool = 'explain_on_whiteboard'; record.firstStrokeMs = at();
    }
  }
  record.totalMs = at();
  const usage = await result.totalUsage;
  record.outputTokens = usage?.outputTokens ?? null; record.reasoningTokens = usage?.reasoningTokens ?? usage?.outputTokenDetails?.reasoningTokens ?? null;
  const steps = await result.steps;
  // Repairs: lesson calls that failed validation before the one that was accepted (each costs a model round trip).
  record.invalid = steps.flatMap(s => s.content).filter(c => c.type === 'tool-error' && c.toolName === 'explain_on_whiteboard').length;
  const call = accepted ? inputs.get(accepted) : undefined;
  if (call) { record.lessonStartMs = call.started; record.firstBeatMs = call.firstBeat ?? record.firstStrokeMs; }
  record.reply = record.reply.trim().slice(0, 300);
  return { record, lesson, response: (await result.response).messages };
}

async function runPrompt(model, key, prompt) {
  const board = new BoardService({ emit: () => {}, enabled: () => true, speak: () => false, silence: () => {}, speed: () => 1 });
  const turns = [], messages = []; let inputs = [];
  try {
    for (const text of [prompt.text, ...(followUps ? prompt.followUps ?? [] : [])]) {
      const kind = turns.length ? 'follow-up' : 'first';
      // Follow-ups only make sense about a board.
      if (kind === 'follow-up' && !board.active) break;
      messages.push({ role: 'user', content: text });
      let entry;
      try {
        const { record, lesson, response } = await turn(model, key, board, messages);
        messages.push(...response);
        entry = { kind, text, ...record };
        if (lesson) {
          const parsed = lessonInput.safeParse(lesson), value = parsed.success ? toLesson(parsed.data) : null;
          if (value) {
            const base = value.mode === 'add' && inputs.length ? inputs : [];
            entry.lesson = value; entry.base = base.length ? 'previous' : 'empty';
            entry.metrics = lessonMetrics(value.beats, base);
            inputs = value.beats.reduce(applyBeat, base);
          }
          // Let the board finish so the next question sees it as the user would.
          for (let i = 0; i < 40 && board.active; i++) { const before = board.context(); board.control('next'); if (board.context() === before) break; }
        }
      } catch (error) {
        entry = { kind, text, error: String(error?.statusCode ?? error?.message ?? error).slice(0, 160) };
      }
      turns.push(entry);
      if (entry.error) break;
      console.log(`${model.label.padEnd(16)} ${prompt.id.padEnd(18)} ${kind.padEnd(9)} ${entry.error ? `error ${entry.error}`
        : entry.metrics ? `stroke ${ms(entry.firstStrokeMs)} · beat ${ms(entry.firstBeatMs)} · ${entry.outputTokens} tok · ${entry.invalid ? `${entry.invalid} repair · ` : ''}overlaps ${entry.metrics.overlaps} · through ${entry.metrics.through} · text ${entry.metrics.minTextPx}px${entry.retries ? ` · waited ${ms(entry.waitedMs)} (${entry.retries} retries)` : ''}`
        : `${entry.tool ?? 'spoke'} · ${entry.reply.slice(0, 80).replace(/\s+/g, ' ')}`}`);
    }
  } finally { board.close(); }
  return { id: prompt.id, topic: prompt.topic, family: prompt.family, turns };
}

function summarize(runs) {
  const turns = runs.flatMap(r => r.turns), firsts = runs.map(r => r.turns[0]).filter(Boolean);
  const lessons = turns.filter(t => t.metrics), m = lessons.map(t => t.metrics);
  const attempted = turns.filter(t => t.attempts);
  return {
    prompts: runs.length, turns: turns.length, errors: turns.filter(t => t.error).length,
    drew: firsts.filter(t => t.metrics).length, lessons: lessons.length,
    // Parse success: lesson calls valid on the first try.
    validFirstTry: attempted.length ? Math.round(attempted.filter(t => !t.invalid && t.metrics).length / attempted.length * 1000) / 1000 : null,
    repairs: turns.reduce((n, t) => n + (t.invalid ?? 0), 0),
    medianMs: {
      firstToken: median(lessons.map(t => t.firstTokenMs)), lessonStart: median(lessons.map(t => t.lessonStartMs)),
      firstBeat: median(lessons.map(t => t.firstBeatMs)), firstStroke: median(lessons.map(t => t.firstStrokeMs)), total: median(lessons.map(t => t.totalMs)),
    },
    medianOutputTokens: median(lessons.map(t => t.outputTokens)),
    lintClean: lessons.length ? Math.round(m.filter(clean).length / m.length * 1000) / 1000 : null,
    mean: { overlaps: mean(m.map(x => x.overlaps)), overflow: mean(m.map(x => x.overflow)), through: mean(m.map(x => x.through)), crossings: mean(m.map(x => x.crossings)),
      textOnLines: mean(m.map(x => x.textOnLines)), elements: mean(m.map(x => x.elements)), beats: mean(m.map(x => x.beats)), newPerBeat: mean(m.map(x => x.newPerBeat.mean)),
      labelWords: mean(m.map(x => x.labelWords.mean)), colors: mean(m.map(x => x.colors)) },
    minTextPx: { median: median(m.map(x => x.minTextPx)), min: m.length ? Math.min(...m.map(x => x.minTextPx ?? Infinity)) : null },
    // Share of all text blocks that land under 14 px on screen.
    smallTextShare: (() => { const blocks = m.reduce((n, x) => n + x.textBlocks, 0); return blocks ? Math.round(m.reduce((n, x) => n + x.smallText, 0) / blocks * 1000) / 1000 : null; })(),
  };
}

const fresh = argv.includes('--fresh');
const read = () => { try { return JSON.parse(fs.readFileSync(out, 'utf8')); } catch { return { models: [] }; } };
/** Write one model's results so far into the file, keeping every other model's. */
function save(entry, startedAt) {
  const others = (read().models ?? []).filter(m => m.model !== entry.model && m.promptsVersion === golden.version);
  const data = {
    about: 'Whiteboard harness results: scripts/board-eval.cjs over scripts/board-eval/prompts.json. Times are from the request to each moment; firstStroke is when today\'s Kite could start drawing (the valid lesson call), firstBeat when a streamed lesson could. Rate-limit waits are excluded (retries, waitedMs). Text sizes are on a 1080p display with the default panel.',
    updated: startedAt, display: referenceDisplay, panel: panelSize(referenceDisplay), maxOutputTokens: voiceOutputTokens,
    models: [...others, entry],
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out + '.tmp', JSON.stringify(data, null, 1) + '\n');
  fs.renameSync(out + '.tmp', out);
}

(async () => {
  const startedAt = new Date().toISOString();
  if (fresh) fs.rmSync(out, { force: true });
  console.log(`Board eval: ${prompts.length} prompts${followUps ? ' with follow-ups' : ''} on ${models.map(m => m.label).join(', ')}.`);
  // Every finished prompt is saved at once, and a rerun without --fresh resumes: prompts already scored for a model
  // (same golden set and follow-up setting, no errors) are kept, not asked again.
  const results = await Promise.all(models.map(async model => {
    const key = keyFor(model.provider), id = `${model.provider}:${model.id}`;
    const before = read().models?.find(m => m.model === id && m.promptsVersion === golden.version && m.followUps === followUps);
    const done = new Map((before?.runs ?? []).filter(r => r.turns.every(t => !t.error)).map(r => [r.id, r]));
    const todo = prompts.filter(p => !done.has(p.id));
    if (done.size) console.log(`${model.label}: resuming, ${prompts.length - todo.length} of ${prompts.length} prompts already scored.`);
    const entry = () => {
      const runs = prompts.map(p => done.get(p.id)).filter(Boolean);
      return { model: id, label: model.label, ranAt: startedAt, promptsVersion: golden.version, followUps, prompts: prompts.length,
        complete: runs.length === prompts.length, summary: summarize(runs), runs };
    };
    await pool(todo, rpm[model.provider] ? 1 : concurrency, async prompt => { done.set(prompt.id, await runPrompt(model, key, prompt)); save(entry(), startedAt); });
    const result = entry();
    save(result, startedAt);
    console.log(`${model.label}: done and saved.`);
    return result;
  }));
  console.log('\nmodel             drew   valid  repairs  1st token  1st beat  1st stroke  tokens  lint-clean  overlaps  through  text px (median/min)');
  for (const r of results) {
    const s = r.summary;
    console.log(`${r.label.padEnd(17)} ${`${s.drew}/${s.prompts}`.padEnd(6)} ${String(s.validFirstTry ?? '—').padEnd(6)} ${String(s.repairs).padEnd(8)} ${ms(s.medianMs.firstToken).padEnd(10)} ${ms(s.medianMs.firstBeat).padEnd(9)} ${ms(s.medianMs.firstStroke).padEnd(11)} ${String(s.medianOutputTokens ?? '—').padEnd(7)} ${String(s.lintClean ?? '—').padEnd(11)} ${String(s.mean.overlaps ?? '—').padEnd(9)} ${String(s.mean.through ?? '—').padEnd(8)} ${s.minTextPx.median ?? '—'}/${s.minTextPx.min ?? '—'}${s.errors ? `  (${s.errors} errors)` : ''}`);
  }
  console.log(`\nWrote ${path.relative(process.cwd(), out)}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
