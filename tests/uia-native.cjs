// Windows acceptance: a real UI Automation tree (WinForms tabs, button, and a popup menu) drives a
// real GuideSession through the real sidecar. Nothing is clicked: the fixture changes its own UI when
// told, standing in for the user's click, and the session receives the click point directly.
const { app, screen } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path'); const assert = require('node:assert/strict');
const readline = require('node:readline');
require('./register.cjs');
const { UiaClient } = require('../src/main/guide/uia.ts');
const { matchTarget, alreadyDone } = require('../src/main/guide/grounding.ts');
const { GuideSession } = require('../src/main/guide/session.ts');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kite-uia-native-')); app.setPath('userData', dir);
const commands = path.join(dir, 'fixture-command.txt');
const fixture = String.raw`$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Kite guide fixture'; $form.Width = 560; $form.Height = 300; $form.StartPosition = 'Manual'; $form.Left = 160; $form.Top = 160; $form.TopMost = $true
$tabs = New-Object System.Windows.Forms.TabControl; $tabs.Dock = 'Fill'
$homePage = New-Object System.Windows.Forms.TabPage 'Home'; $insert = New-Object System.Windows.Forms.TabPage 'Insert'
$bold = New-Object System.Windows.Forms.Button; $bold.Text = 'Bold'; $bold.Left = 20; $bold.Top = 20; $homePage.Controls.Add($bold)
$footer = New-Object System.Windows.Forms.Button; $footer.Text = 'Footer'; $footer.Left = 20; $footer.Top = 20; $footer.Width = 90; $insert.Controls.Add($footer)
$header = New-Object System.Windows.Forms.Button; $header.Text = 'Header'; $header.Left = 130; $header.Top = 20; $insert.Controls.Add($header)
$menu = New-Object System.Windows.Forms.ContextMenuStrip; $menu.AutoClose = $false
[void]$menu.Items.Add('Blank'); [void]$menu.Items.Add('Blank (Three Columns)'); [void]$menu.Items.Add('Edit Footer')
$tabs.TabPages.Add($homePage); $tabs.TabPages.Add($insert); $form.Controls.Add($tabs)
$timer = New-Object System.Windows.Forms.Timer; $timer.Interval = 50
$timer.Add_Tick({
  if (-not (Test-Path '${commands.replace(/'/g, "''")}')) { return }
  $command = (Get-Content '${commands.replace(/'/g, "''")}' -Raw).Trim(); Remove-Item '${commands.replace(/'/g, "''")}'
  if ($command -eq 'insert') { $tabs.SelectedTab = $insert }
  if ($command -eq 'menu') { $menu.Show($footer, (New-Object System.Drawing.Point 0, $footer.Height)) }
  if ($command -eq 'quit') { $form.Close() }
})
$form.Add_Shown({ [Console]::Out.WriteLine($form.Handle.ToInt64()); [Console]::Out.Flush(); $timer.Start() })
[System.Windows.Forms.Application]::Run($form)
`;
// Atomic: the fixture polls, and must never see a created-but-empty command file.
const send = command => { fs.writeFileSync(commands + '.tmp', command); fs.renameSync(commands + '.tmp', commands); };
const delay = ms => new Promise(r => setTimeout(r, ms));
const center = r => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
app.whenReady().then(async () => {
  let child, uia;
  try {
    const script = path.join(dir, 'fixture.ps1'); fs.writeFileSync(script, fixture);
    child = spawn(path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { stdio: ['ignore', 'pipe', 'inherit'] });
    const hwnd = await new Promise((resolve, reject) => { readline.createInterface({ input: child.stdout }).once('line', line => resolve(Number(line))); setTimeout(() => reject(new Error('fixture did not start')), 30000); });
    assert.ok(hwnd > 0);
    uia = new UiaClient({ directory: path.join(dir, 'guide'), excludePid: process.pid, toDip: (r, awareness) => awareness === 'unaware' ? r : screen.screenToDipRect(null, r) });
    let started = performance.now();
    const first = await uia.snapshot(undefined, hwnd);
    const coldMs = performance.now() - started;
    assert.ok(first, 'sidecar produced a snapshot');
    assert.equal(first.window.title, 'Kite guide fixture'); assert.equal(first.window.process, 'powershell');
    const names = first.elements.map(e => `${e.role}:${e.name}`);
    for (const expected of ['TabItem:Home', 'TabItem:Insert', 'Button:Bold']) assert.ok(names.includes(expected), expected + ' in ' + names.join(', '));
    assert.equal(names.includes('Button:Footer'), false, 'controls on a hidden tab page are not offered');
    assert.equal(first.elements.find(e => e.name === 'Home').selected, true);
    const display = screen.getDisplayMatching(first.window.rect).bounds;
    for (const e of first.elements) assert.ok(e.rect.x >= display.x - 1 && e.rect.y >= display.y - 1 && e.rect.x + e.rect.width <= display.x + display.width + 1, 'DIP rect on its display');
    started = performance.now(); await uia.snapshot(undefined, hwnd); const warmMs = performance.now() - started;
    const plan = { goal: 'Add a footer', app: 'Kite guide fixture', steps: [
      { instruction: 'Click the Insert tab.', target: 'Insert', role: 'tab' },
      { instruction: 'Click Footer.', target: 'Footer', role: 'button' },
      { instruction: 'Choose Blank.', target: 'Blank', role: 'menu item' },
    ] };
    const views = [], spoken = [];
    const locate = async step => {
      const snap = await uia.snapshot(undefined, hwnd); const match = snap && matchTarget(snap.elements, step);
      return match ? { rect: match.element.rect, display, source: 'uia', verified: true, done: alreadyDone(match.element) } : null;
    };
    const session = new GuideSession(1, plan, { locate, emit: v => views.push(v), announce: t => spoken.push(t) },
      { settleMs: 450, retryMs: [0, 350, 900], pollMs: 60000, recheckMs: 300, idleMs: 60000, doneMs: 100, visionBudget: 0 });
    const until = async (predicate, label) => { for (let i = 0; i < 100 && !predicate(); i++) await delay(50); assert.ok(predicate(), label + ': ' + JSON.stringify(views.at(-1))); };
    session.start();
    await until(() => views.at(-1)?.status === 'pointing', 'points at Insert');
    const insertRect = views.at(-1).rect;
    send('insert'); session.click(center(insertRect));
    await until(() => views.at(-1)?.index === 1 && views.at(-1).status === 'pointing', 'Footer appears after the tab changes');
    const footerRect = views.at(-1).rect;
    assert.ok(footerRect.y > insertRect.y, 'Footer is inside the tab page');
    send('menu'); session.click(center(footerRect));
    await until(() => views.at(-1)?.index === 2 && views.at(-1).status === 'pointing', 'Blank is found in the popup menu window');
    const blank = views.at(-1).rect;
    assert.ok(blank.y >= footerRect.y + footerRect.height - 2, 'popup item sits below Footer');
    session.click(center(blank));
    await until(() => views.at(-1) === null, 'guide finishes');
    assert.deepEqual(spoken, ['Click the Insert tab.', 'Click Footer.', 'Choose Blank.', 'All done — nice work!']);
    // Insert is now the selected tab, so a fresh guide completes step 1 by itself.
    const again = [];
    const restarted = new GuideSession(2, plan, { locate, emit: v => again.push(v), announce: () => {} }, { settleMs: 0, retryMs: [0], pollMs: 60000, recheckMs: 300, idleMs: 60000, doneMs: 100, visionBudget: 0 });
    restarted.start();
    for (let i = 0; i < 100 && !(again.at(-1)?.index === 1 && again.at(-1).status === 'pointing'); i++) await delay(50);
    assert.equal(again.at(-1).index, 1, 'selected tab auto-completes'); assert.equal(again.at(-1).completed, 1); restarted.stop();
    // Kite never grounds against its own windows.
    const self = new UiaClient({ directory: path.join(dir, 'guide'), excludePid: child.pid, toDip: r => r });
    assert.equal(await self.snapshot(undefined, hwnd), null); self.stop();
    console.log(`PASS real UI Automation guide: tab → button → popup menu, selected tab auto-completes, hidden pages and Kite's own process excluded, DIP rects on display. Sidecar cold ${coldMs.toFixed(0)} ms, warm snapshot ${warmMs.toFixed(0)} ms, ${first.elements.length} elements.`);
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { try { send('quit'); } catch { /* fixture gone */ } uia?.stop(); setTimeout(() => { child?.kill(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* A just-stopped sidecar may still hold its script. */ } app.exit(process.exitCode || 0); }, 500); }
});
