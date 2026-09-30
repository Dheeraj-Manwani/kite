// Windows acceptance for "do it for me": a real WinForms window operated through the real task sidecar,
// first action by action, then end to end by a real TaskSession with a scripted (model-free) decider.
// The mouse pointer must not move at any point.
const { app, screen } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path'); const assert = require('node:assert/strict');
const readline = require('node:readline');
require('./register.cjs');
const { ActClient } = require('../src/main/agent/sidecar.ts');
const { TaskSession } = require('../src/main/agent/session.ts');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kite-agent-native-')); app.setPath('userData', dir);
const fixture = String.raw`$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Kite agent fixture'; $form.Width = 520; $form.Height = 340; $form.StartPosition = 'Manual'; $form.Left = 220; $form.Top = 180; $form.TopMost = $true
$name = New-Object System.Windows.Forms.TextBox; $name.AccessibleName = 'Name'; $name.Left = 20; $name.Top = 20; $name.Width = 200
$greet = New-Object System.Windows.Forms.Button; $greet.Text = 'Greet'; $greet.Left = 240; $greet.Top = 18
$status = New-Object System.Windows.Forms.Label; $status.Text = 'Waiting'; $status.Left = 20; $status.Top = 60; $status.Width = 400
$subscribe = New-Object System.Windows.Forms.CheckBox; $subscribe.Text = 'Subscribe'; $subscribe.Left = 20; $subscribe.Top = 90
$notes = New-Object System.Windows.Forms.TextBox; $notes.AccessibleName = 'Notes'; $notes.Multiline = $true; $notes.Left = 20; $notes.Top = 130; $notes.Width = 440; $notes.Height = 120
$greet.Add_Click({ $status.Text = 'Hello, ' + $name.Text + '!' })
$form.Controls.AddRange(@($name, $greet, $status, $subscribe, $notes))
$form.Add_Shown({ [Console]::Out.WriteLine($form.Handle.ToInt64()); [Console]::Out.Flush() })
[System.Windows.Forms.Application]::Run($form)
`;
// A low-level mouse hook that reports only *injected* mouse input (LLMHF_INJECTED). A person using the mouse
// during the test is ignored; any synthesized move or click, by Kite or by a UI Automation provider, fails it.
const mouseWatch = String.raw`$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition @'
using System; using System.Runtime.InteropServices; using System.Windows.Forms;
public static class MouseWatch {
  delegate IntPtr Proc(int code, IntPtr message, IntPtr data);
  [StructLayout(LayoutKind.Sequential)] struct Info { public int X; public int Y; public uint Data; public uint Flags; public uint Time; public IntPtr Extra; }
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, Proc proc, IntPtr module, uint thread);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);
  static Proc keep; static IntPtr hook;
  public static void Run() {
    keep = Handle; hook = SetWindowsHookEx(14, keep, GetModuleHandle(null), 0);
    Console.Out.WriteLine(hook == IntPtr.Zero ? "FAIL" : "READY"); Console.Out.Flush();
    Application.Run();
  }
  static IntPtr Handle(int code, IntPtr message, IntPtr data) {
    if (code >= 0) { var info = (Info)Marshal.PtrToStructure(data, typeof(Info)); if ((info.Flags & 3) != 0) { Console.Out.WriteLine("INJECTED " + message.ToInt64() + " " + info.X + "," + info.Y); Console.Out.Flush(); } }
    return CallNextHookEx(hook, code, message, data);
  }
}
'@
[MouseWatch]::Run()
`;
const delay = ms => new Promise(r => setTimeout(r, ms));
app.whenReady().then(async () => {
  let child, client, watcher;
  try {
    const powershell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const watchScript = path.join(dir, 'mouse-watch.ps1'); fs.writeFileSync(watchScript, mouseWatch);
    watcher = spawn(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', watchScript], { stdio: ['ignore', 'pipe', 'inherit'] });
    const injected = [];
    await new Promise((resolve, reject) => {
      readline.createInterface({ input: watcher.stdout }).on('line', line => { if (line === 'READY') resolve(); else if (line === 'FAIL') reject(new Error('mouse hook unavailable')); else injected.push(line); });
      setTimeout(() => reject(new Error('mouse watcher did not start')), 30000);
    });
    // Positive control, test code only: a one-pixel wiggle (net zero) must be seen as injected.
    const control = path.join(dir, 'wiggle.ps1');
    fs.writeFileSync(control, String.raw`Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class Wiggle {
  [StructLayout(LayoutKind.Sequential)] struct MouseData { public int X; public int Y; public uint Data; public uint Flags; public uint Time; public IntPtr Extra; }
  [StructLayout(LayoutKind.Sequential)] struct Input { public uint Type; public MouseData Mouse; }
  [DllImport("user32.dll")] static extern uint SendInput(uint count, Input[] inputs, int size);
  public static uint Run() { var a = new Input { Type = 0 }; a.Mouse.X = 1; a.Mouse.Flags = 1; var b = new Input { Type = 0 }; b.Mouse.X = -1; b.Mouse.Flags = 1; return SendInput(2, new[] { a, b }, Marshal.SizeOf(typeof(Input))); }
}
'@
[Wiggle]::Run()`);
    require('node:child_process').spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', control], { stdio: 'ignore' });
    for (let i = 0; i < 40 && !injected.length; i++) await delay(50);
    assert.ok(injected.length > 0, 'the watcher sees injected mouse input (positive control)');
    injected.length = 0;
    const script = path.join(dir, 'fixture.ps1'); fs.writeFileSync(script, fixture);
    child = spawn(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { stdio: ['ignore', 'pipe', 'inherit'] });
    const hwnd = await new Promise((resolve, reject) => { readline.createInterface({ input: child.stdout }).once('line', line => resolve(Number(line))); setTimeout(() => reject(new Error('fixture did not start')), 30000); });
    const pointer = screen.getCursorScreenPoint();
    client = new ActClient({ directory: path.join(dir, 'agent'), excludePid: process.pid, toDip: (r, awareness) => awareness === 'unaware' ? r : screen.screenToDipRect(null, r) });
    let started = performance.now();
    const windows = await client.windows();
    const coldMs = performance.now() - started;
    const win = windows.find(w => w.hwnd === hwnd);
    assert.ok(win, 'the fixture is listed: ' + windows.map(w => w.title).join(', '));
    assert.equal(win.title, 'Kite agent fixture'); assert.equal(win.process, 'powershell');
    const target = { hwnd, pid: win.pid };
    const find = (snap, name, role) => snap.elements.find(e => e.name === name && (!role || e.role === role));
    started = performance.now();
    let snap = await client.snapshot(target);
    const snapshotMs = performance.now() - started;
    for (const [name, role] of [['Name', 'Edit'], ['Greet', 'Button'], ['Subscribe', 'CheckBox'], ['Notes'], ['Waiting', 'Text']]) assert.ok(find(snap, name, role), `${role ?? 'control'} ${name}: ` + snap.elements.map(e => `${e.role}:${e.name}`).join(', '));
    assert.ok(find(snap, 'Greet').patterns.includes('invoke')); assert.equal(find(snap, 'Subscribe').toggled, false);
    assert.equal(snap.layers.find(l => l.main).title, 'Kite agent fixture');
    // UI Automation patterns: set a value, press a button, toggle a checkbox.
    assert.deepEqual(await client.act(snap.seq, find(snap, 'Name').ref, 'set', { text: 'Ada' }), { ok: true, via: 'value', pending: false });
    assert.equal((await client.act(snap.seq, find(snap, 'Greet').ref, 'click')).via, 'invoke');
    assert.equal((await client.act(snap.seq, find(snap, 'Subscribe').ref, 'click')).via, 'toggle');
    await delay(150); snap = await client.snapshot(target);
    assert.ok(find(snap, 'Hello, Ada!', 'Text'), 'the button ran its handler'); assert.equal(find(snap, 'Subscribe').toggled, true); assert.equal(find(snap, 'Name').value, 'Ada');
    assert.deepEqual(await client.act(snap.seq - 1, 0, 'click'), { ok: false, code: 'ESTALE' }, 'refs from an old snapshot are refused');
    // Keyboard: the sidecar brings the window to the front, focuses the field, and types Unicode text.
    const notes = find(snap, 'Notes');
    const typed = await client.keys(target, snap.seq, notes.ref, [{ text: 'Kite typed this ✓ café' }]);
    assert.equal(typed.ok, true, JSON.stringify(typed));
    await delay(150); snap = await client.snapshot(target);
    assert.equal(find(snap, 'Notes').value, 'Kite typed this ✓ café');
    assert.ok(find(snap, 'Notes').patterns.includes('text'));
    assert.equal((await client.act(snap.seq, find(snap, 'Notes').ref, 'selectall')).via, 'selectall');
    assert.equal((await client.keys(target, snap.seq, -1, [{ text: 'replaced' }])).ok, true);
    await delay(150); snap = await client.snapshot(target);
    assert.equal(find(snap, 'Notes').value, 'replaced', 'selecting through UI Automation, then typing, replaces the text');
    // Shortcuts with modifiers: Shift+Home selects back to the start, then typing replaces it.
    assert.equal((await client.keys(target, snap.seq, find(snap, 'Name').ref, [{ vk: 0x23, mods: [] }, { vk: 0x24, mods: [0x10] }, { text: 'Lin' }, { vk: 0x08, mods: [], times: 1 }])).ok, true);
    await delay(150); snap = await client.snapshot(target);
    assert.equal(find(snap, 'Name').value, 'Li', 'End, Shift+Home, type, Backspace');
    assert.equal((await client.keys(target, snap.seq, -1, [{ text: 'bad\nline' }])).code, 'EREQUEST', 'line breaks are refused by the sidecar too');
    // End to end: a real TaskSession, driven by a scripted decider instead of a model.
    const decisions = [
      s => ({ type: 'type_text', ref: s.elements.find(e => e.name === 'Name').ref, text: 'Grace', replace: true }),
      s => ({ type: 'click', ref: s.elements.find(e => e.name === 'Greet').ref }),
      s => (s.elements.some(e => e.name === 'Hello, Grace!') ? { type: 'type_text', ref: s.elements.find(e => e.name === 'Notes').ref, text: 'Done by Kite', replace: true } : { type: 'fail', reason: 'greeting missing' }),
      s => (s.elements.find(e => e.name === 'Notes').value === 'Done by Kite' ? { type: 'done', summary: 'I greeted Grace and wrote a note.' } : { type: 'fail', reason: 'note missing' }),
    ];
    // The fixture is hosted by powershell.exe, which the risk rules treat as a terminal: typing asks first.
    const views = [], ended = [], approvals = [];
    const session = new TaskSession(1, 'Greet Grace and leave a note', 'Kite agent fixture', 'task', {
      windows: s => client.windows(s), snapshot: (t, s) => client.snapshot(t, s), act: (q, r, a, e, s) => client.act(q, r, a, e, s), keys: (t, q, f, i, s) => client.keys(t, q, f, i, s),
      launch: async () => false, decide: async prompt => decisions.shift()(prompt.snapshot), displayOf: r => screen.getDisplayMatching({ x: Math.round(r.x), y: Math.round(r.y), width: 1, height: 1 }).bounds,
      emit: v => { views.push(v); if (v?.status === 'approval' && !approvals.includes(v.step)) { approvals.push(v.step); setTimeout(() => session.control('allow'), 20); } }, say: () => {}, audit: () => {}, finished: (message, status) => ended.push({ message, status }),
    }, false, 15, { pointMs: 50, settleMs: 200, retryMs: 300, launchMs: 1000, wallMs: 60000, lingerMs: 100, rateRetries: 0, rateMaxMs: 1000 });
    session.start();
    for (let i = 0; i < 400 && !ended.length; i++) await delay(50);
    assert.deepEqual(ended, [{ message: 'I greeted Grace and wrote a note.', status: 'done' }], JSON.stringify(views.filter(Boolean).at(-1)));
    assert.ok(views.some(v => v?.status === 'acting' && v.target), 'the kite was shown each control before it was used');
    assert.deepEqual(approvals, [1, 3], 'typing into a terminal-hosted window asked first; the click did not');
    await delay(300);
    assert.deepEqual(injected, [], 'no mouse input was synthesized: the pointer was never moved or clicked for the user');
    const moved = JSON.stringify(screen.getCursorScreenPoint()) !== JSON.stringify(pointer);
    console.log(`PASS real task sidecar: value, invoke, toggle, stale refs, Unicode typing, select-all replace, line-break refusal, end-to-end TaskSession; zero injected mouse events${moved ? ' (someone moved the physical mouse meanwhile)' : ', pointer unchanged'}. Sidecar cold ${coldMs.toFixed(0)} ms, snapshot ${snapshotMs.toFixed(0)} ms, ${snap.elements.length} elements.`);
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { client?.stop(); child?.kill(); watcher?.kill(); setTimeout(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* A just-killed sidecar may still hold its script. */ } app.exit(process.exitCode || 0); }, 500); }
});
