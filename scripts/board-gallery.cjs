// Whiteboard gallery (docs/whiteboard-roadmap.md phase 0): renders every lesson in the harness results through the real
// overlay renderer, as the finished board looks in the default panel on a 1080p display, and writes a page to compare
// runs by eye. Usage: npm run eval:board:gallery -- [--in results.json] [--out dir] [--renderer dir] [--theme light|dark]
// The theme is fixed (light by default) so runs compare the same way on any machine.
// Builds the renderer into a temporary folder unless --renderer points at a built one (index.html inside).
const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { execFileSync } = require('node:child_process');
require('../tests/register.cjs');
const { applyBeat, layoutScene } = require('../src/shared/board.ts');
const { referenceDisplay } = require('../src/shared/boardMetrics.ts');
const { catalog } = require('../src/main/ai/catalog.ts');

const argv = process.argv.slice(2), arg = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback; };
const root = path.join(__dirname, '..'), results = path.resolve(arg('--in', path.join(root, 'docs', 'performance', 'whiteboard', 'latest.json')));
const out = path.resolve(arg('--out', path.dirname(results)));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kite-board-gallery-'));
app.setPath('userData', path.join(temporary, 'profile'));
// Results are appended to a file: console output is often lost when app.exit follows.
const log = message => { console.log(message); fs.appendFileSync(path.join(temporary, 'log.txt'), message + '\n'); };
const delay = ms => new Promise(r => setTimeout(r, ms));
const slug = s => s.replace(/[^a-z0-9.-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// The overlay only needs settings, the board channel and the cursor; every other bridge call is a no-op.
const preload = path.join(temporary, 'preload.cjs');
fs.writeFileSync(preload, `const { ipcRenderer } = require('electron');
const subscribe = channel => cb => { const fn = (_e, a, b) => cb(a, b); ipcRenderer.on(channel, fn); return () => ipcRenderer.removeListener(channel, fn); };
const known = { getSettings: () => ipcRenderer.invoke('gallery:settings'), onBoardEvent: subscribe('board:state'), onCursorUpdate: subscribe('cursor:update') };
window.kite = new Proxy({}, { get: (_t, name) => known[name] ?? (String(name).startsWith('on') ? () => () => {} : () => Promise.resolve({ ok: true })) });`);
const settings = { settings: { onboardingComplete: true, reducedMotion: true, earcons: false, whiteboard: true, kiteSize: 'standard', liveliness: 'calm', kiteSkin: 'rose',
  ttsEnabled: false, speed: 1, model: { provider: 'deepseek', id: 'deepseek-flash' } }, models: catalog, voices: [], keys: {} };

function renderer() {
  const given = arg('--renderer');
  if (given) return path.resolve(given);
  const dir = path.join(temporary, 'renderer');
  // Electron's own binary runs Vite as plain Node.
  execFileSync(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '-c', 'vite.renderer.config.ts', '--outDir', dir, '--base', './', '--emptyOutDir', '--logLevel', 'error'],
    { cwd: root, stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
  return dir;
}

nativeTheme.themeSource = arg('--theme', 'light');
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  let win;
  try {
    const data = JSON.parse(fs.readFileSync(results, 'utf8'));
    ipcMain.handle('gallery:settings', () => settings);
    const dir = renderer();
    win = new BrowserWindow({ width: referenceDisplay.width, height: referenceDisplay.height, show: false, frame: false,
      webPreferences: { preload, contextIsolation: false, sandbox: false, offscreen: true, backgroundThrottling: false } });
    await win.loadFile(path.join(dir, 'index.html'), { hash: 'overlay' });
    await delay(400);
    const send = (channel, ...args) => win.webContents.send(channel, ...args);
    // The cursor (and so the kite) waits in the corner, away from the panel.
    send('cursor:update', { x: referenceDisplay.width - 30, y: referenceDisplay.height - 30 }, { origin: { x: 0, y: 0 }, display: { x: 0, y: 0, ...referenceDisplay } });
    const images = path.join(out, 'gallery');
    fs.rmSync(images, { recursive: true, force: true });
    let id = 0, count = 0;
    for (const model of data.models) {
      const folder = path.join(images, slug(model.model)); fs.mkdirSync(folder, { recursive: true });
      for (const run of model.runs) {
        let inputs = [];
        for (const [index, t] of run.turns.entries()) {
          if (!t.lesson) continue;
          inputs = t.lesson.beats.reduce(applyBeat, t.base === 'previous' ? inputs : []);
          const elements = layoutScene(inputs);
          send('board:state', null); await delay(60);
          send('board:state', { id: ++id, title: t.lesson.title, status: 'done', beat: t.lesson.beats.length - 1, total: t.lesson.beats.length, caption: '', note: null, elements, drawing: null, highlight: [] });
          let rect = null;
          for (let i = 0; i < 60 && !rect; i++) {
            await delay(50);
            rect = await win.webContents.executeJavaScript(`(() => { const b = document.querySelector('.board'); if (!b || b.querySelectorAll('[data-el]').length !== ${elements.length}) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }; })()`);
          }
          if (!rect) { log(`skip ${model.model} ${run.id} turn ${index}: the board did not render`); continue; }
          await delay(120);
          const image = await win.webContents.capturePage(rect);
          const file = `${run.id}-${index}.jpg`;
          fs.writeFileSync(path.join(folder, file), image.toJPEG(82));
          t.image = `gallery/${slug(model.model)}/${file}`; count++;
        }
      }
      log(`${model.label}: rendered`);
    }
    send('board:state', null);
    fs.writeFileSync(path.join(out, 'index.html'), page(data));
    log(`Wrote ${count} boards and ${path.join(out, 'index.html')}`);
  } catch (error) { log(String(error?.stack ?? error)); process.exitCode = 1; }
  finally { if (win && !win.isDestroyed()) win.destroy(); try { fs.rmSync(temporary, { recursive: true, force: true }); } catch { /* still in use */ } app.exit(process.exitCode || 0); }
});

const pct = v => v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`;
const sec = v => v === null || v === undefined ? '—' : `${(v / 1000).toFixed(1)} s`;
function page(data) {
  const prompts = [...new Map(data.models.flatMap(m => m.runs.map(r => [r.id, r]))).values()];
  const summary = data.models.map(m => { const s = m.summary; return `<tr><th scope="row">${escape(m.label)}<small>${escape(m.model)}${m.complete === false ? ` · partial, ${m.runs.length} of ${m.prompts} prompts` : ''}</small></th>
    <td>${s.drew}/${s.prompts}</td><td>${pct(s.validFirstTry)}</td><td>${s.repairs}</td><td>${sec(s.medianMs.firstToken)}</td><td>${sec(s.medianMs.firstBeat)}</td><td>${sec(s.medianMs.firstStroke)}</td>
    <td>${s.medianOutputTokens ?? '—'}</td><td>${pct(s.lintClean)}</td><td>${s.mean.overlaps ?? '—'}</td><td>${s.mean.through ?? '—'}</td><td>${s.mean.crossings ?? '—'}</td><td>${s.minTextPx.median ?? '—'} px</td><td>${pct(s.smallTextShare)}</td></tr>`; }).join('\n');
  const cell = t => {
    if (!t) return '<td class="empty">—</td>';
    if (t.error) return `<td class="empty">Error: ${escape(t.error)}</td>`;
    if (!t.metrics) return `<td class="empty">No lesson (${escape(t.tool ?? 'spoke')}): ${escape(t.reply)}</td>`;
    const m = t.metrics, flags = [m.overlaps && `${m.overlaps} overlap${m.overlaps > 1 ? 's' : ''}`, m.overflow && `${m.overflow} overflow`, m.through && `${m.through} through`,
      m.crossings && `${m.crossings} crossing${m.crossings > 1 ? 's' : ''}`, m.textOnLines && `${m.textOnLines} on lines`].filter(Boolean);
    return `<td><a href="${t.image}"><img src="${t.image}" alt="${escape(t.lesson.title)}" loading="lazy" width="590" height="380"></a>
      <p>${sec(t.firstStrokeMs)} · ${t.outputTokens ?? '—'} tokens · ${m.beats} beats · ${m.elements} elements · text ${m.minTextPx ?? '—'} px${t.invalid ? ` · ${t.invalid} repair` : ''}</p>
      <p class="${flags.length ? 'bad' : 'good'}">${flags.length ? flags.join(' · ') : 'Lint-clean'}</p></td>`;
  };
  const rows = prompts.map(p => {
    const turns = Math.max(...data.models.map(m => m.runs.find(r => r.id === p.id)?.turns.length ?? 0));
    return Array.from({ length: turns }, (_, i) => {
      const text = data.models.map(m => m.runs.find(r => r.id === p.id)?.turns[i]?.text).find(Boolean);
      return `<tr><th scope="row">${i ? '<span class="follow">Follow-up</span>' : `<span class="tag">${escape(p.topic)} · ${escape(p.family)}</span>`}${escape(text)}</th>${data.models.map(m => cell(m.runs.find(r => r.id === p.id)?.turns[i])).join('')}</tr>`;
    }).join('\n');
  }).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Whiteboard gallery</title>
<style>
:root { --bg: #f6f5f2; --panel: #ffffff; --text: #1e1e1e; --muted: #5f6368; --line: #dcdad4; --bad: #c92a2a; --good: #2b8a3e; color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { --bg: #161616; --panel: #202020; --text: #ececec; --muted: #a0a0a0; --line: #3a3a3a; --bad: #ff8787; --good: #8ce99a; } }
body { margin: 0; padding: 24px 16px 48px; background: var(--bg); color: var(--text); font: 14px/1.45 system-ui, sans-serif; }
h1 { font-size: 22px; margin: 0 0 4px; } h2 { font-size: 16px; margin: 32px 0 8px; }
p.lede { color: var(--muted); margin: 0 0 16px; max-width: 80ch; }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; background: var(--panel); }
th, td { border: 1px solid var(--line); padding: 8px; vertical-align: top; text-align: left; }
th small { display: block; color: var(--muted); font-weight: normal; }
.summary td { font-variant-numeric: tabular-nums; white-space: nowrap; }
.boards th { width: 200px; min-width: 160px; font-weight: 500; }
.boards td { width: 590px; } .boards img { display: block; width: 590px; height: auto; border-radius: 6px; }
.boards td p { margin: 6px 0 0; color: var(--muted); } .boards td p.bad { color: var(--bad); } .boards td p.good { color: var(--good); }
.empty { color: var(--muted); font-style: italic; }
.tag, .follow { display: block; font-size: 12px; color: var(--muted); }
</style></head><body>
<h1>Whiteboard gallery</h1>
<p class="lede">Each lesson from <code>latest.json</code>, finished and rendered by Kite's overlay in the default ${data.panel.width} × ${data.panel.height} panel on a ${data.display.width} × ${data.display.height} display. ${escape(data.about)} Click a board to open it at full size.</p>
<p class="lede">Provider generations: ${escape(data.updated)}. ${data.revalidatedAt ? `Repairs/readability revalidated: ${escape(data.revalidatedAt)}. Model timings and tokens below remain historical.` : 'The model-only harness cannot measure an actual drawing frame.'} See <a href="phase1-live.json">fresh overlay first-stroke samples and conditions</a>.</p>
<h2>Summary</h2>
<div class="scroll"><table class="summary"><thead><tr><th>Model</th><th>Drew</th><th>Valid first try</th><th>Repairs</th><th>First token</th><th>First beat (streamed)</th><th>First stroke</th><th>Output tokens</th><th>Lint-clean</th><th>Overlaps</th><th>Through shapes</th><th>Crossings</th><th>Text (median)</th><th>Text under 14 px</th></tr></thead>
<tbody>${summary}</tbody></table></div>
<p class="lede">Times and tokens are medians over lessons; overlaps, through and crossings are means per lesson.</p>
<h2>Boards</h2>
<div class="scroll"><table class="boards"><thead><tr><th>Prompt</th>${data.models.map(m => `<th>${escape(m.label)}</th>`).join('')}</tr></thead>
<tbody>${rows}</tbody></table></div>
</body></html>
`;
}
