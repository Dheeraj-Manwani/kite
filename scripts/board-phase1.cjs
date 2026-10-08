// Revalidate the frozen phase-0 corpus through today's deterministic repairs; no provider call is made.
require('../tests/register.cjs');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { applyBeat, layoutScene, repairLesson, fixScene, lintScene, panelSize } = require('../src/shared/board.ts');
const { lessonMetrics, referenceDisplay } = require('../src/shared/boardMetrics.ts');
const root = path.join(__dirname, '..', 'docs', 'performance', 'whiteboard');
const frozen = path.join(root, 'phase0-baseline.json');
if (!fs.existsSync(frozen)) fs.copyFileSync(path.join(root, 'latest.json'), frozen);
const data = JSON.parse(fs.readFileSync(frozen, 'utf8')), updated = new Date().toISOString();
let beats = 0, lessons = 0, worst = [], perBeatFailures = [];
for (const model of data.models) {
  const metrics = [];
  for (const run of model.runs) {
    let base = [];
    for (const turn of run.turns) {
      if (!turn.lesson) continue;
      const used = turn.lesson.mode === 'add' ? base : [];
      turn.lesson = repairLesson(turn.lesson, used);
      let shown = used;
      for (const beat of turn.lesson.beats) {
        shown = applyBeat(shown, beat); beats++;
        const m = lintScene(shown);
        if (m.overlaps || m.overflow) perBeatFailures.push({ prompt: run.id, beat: beats, overlaps: m.overlaps, overflow: m.overflow });
      }
      base = shown; if (base.length > worst.length) worst = base;
      turn.metrics = lessonMetrics(turn.lesson.beats, used); metrics.push(turn.metrics); lessons++;
      // Old model timings are retained as historical data, never relabelled as a fresh provider evaluation.
    }
  }
  model.revalidatedAt = updated;
  const mean = key => metrics.reduce((n, m) => n + m[key], 0) / metrics.length;
  const sizes = metrics.map(m => m.minTextPx).filter(Number.isFinite).sort((a,b) => a-b);
  model.summary = { ...model.summary,
    lintClean: metrics.filter(m => !m.overlaps && !m.overflow && !m.through && !m.textOnLines).length / metrics.length,
    mean: { ...model.summary.mean, overlaps: mean('overlaps'), overflow: mean('overflow'), through: mean('through'), textOnLines: mean('textOnLines'), crossings: mean('crossings') },
    minTextPx: { median: sizes[Math.floor(sizes.length / 2)], min: Math.min(...sizes) }, smallTextShare: 0 };
  assert.equal(mean('overlaps'), 0); assert.equal(mean('overflow'), 0); assert.ok(sizes.every(px => px >= 14));
}
assert.deepEqual(perBeatFailures, []);
// A 60-element scene from the corpus, padded with separated text if it contains fewer elements.
while (worst.length < 60) worst.push({ id: `perf-${worst.length}`, type: 'text', x: 3500, y: 100 + worst.length * 60, text: 'performance fixture' });
worst = worst.slice(0,60);
fixScene(worst); const repairMs = [];
for (let i=0;i<10;i++) { const start=performance.now(); lintScene(fixScene(worst)); repairMs.push(performance.now()-start); }
const maxMs = Math.max(...repairMs), sorted = [...repairMs].sort((a,b)=>a-b);
const report = { checkedAt: updated, source: 'phase0-baseline.json (model generations from 2 October; deterministic replay only)',
  prompts: data.models[0].runs.length, lessons, beats, overlaps: 0, overflow: 0,
  minimumTextPx: Math.min(...data.models.map(m=>m.summary.minTextPx.min)),
  layoutAndLint60: { samples: repairMs.length, medianMs: sorted[5], maxMs, targetMs: 50 },
  latency: 'Fresh first-stroke measurements are in phase1-live.json, using the real overlay; historical timings below are unchanged.' };
assert.ok(maxMs < 50, `60-element layout/lint took ${maxMs.toFixed(1)} ms`);
data.about = 'Phase 1 deterministic revalidation of phase0-baseline.json. Model generations and token/latency figures remain from 2 October; revalidatedAt covers only repairs/readability. Fresh overlay latency: phase1-live.json.';
data.revalidatedAt = updated; data.panel = panelSize(referenceDisplay);
fs.writeFileSync(path.join(root,'latest.json'),JSON.stringify(data,null,1)+'\n');
fs.writeFileSync(path.join(root,'phase1-replay.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
