import { app, BrowserWindow, session } from 'electron';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { statSync } from 'original-fs';
import path from 'node:path';
import { createBrowserSpike } from './browserSpike';
import { PdfExecutor } from './executors/pdf';
import { inspectPdf } from './artifacts';
import { backgroundHealth } from './health';

/** Reproducible packaged phase-0 probe. Synthetic documents and a local login fixture; no real accounts. */
export async function runBackgroundSpike(directory: string) {
  await mkdir(directory, { recursive: true });
  const startupMs = Math.round(process.uptime() * 1000);
  const workingSetKiB = () => app.getAppMetrics().reduce((sum, p) => sum + p.memory.workingSetSize, 0);
  const idleWorkingSetKiB = workingSetKiB();
  const pdf = new PdfExecutor(), samples: { name: string; ms: number; bytes: number; pages: number; hash: string }[] = [];
  const fixtures = [
    { name: 'multiline.txt', text: Array.from({ length: 120 }, (_, i) => `Line ${i + 1}: Background work keeps the document on this PC.\nUTF-8: café, naïve, résumé. A long line still wraps inside the page.`).join('\n') },
    { name: 'markdown-source.md', text: '# A Markdown source document\n\n## What is preserved\n\n- This is source text, not interpreted markup.\n- <script>fetch("https://example.com")</script> stays literal.\n\nA new PDF leaves the original untouched.\n\n' + 'Wrap check: '.repeat(200) },
  ];
  const responsiveness: number[] = [], interval = setInterval(() => responsiveness.push(performance.now()), 20);
  const server = createServer((req, res) => {
    if (req.url === '/signed-in') res.setHeader('Set-Cookie', 'spike_login=synthetic-only; HttpOnly; SameSite=Lax');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><title>Kite login fixture</title><h1>Isolated browser fixture</h1><a href="/signed-in">Simulate manual sign-in</a>');
  });
  let browser: BrowserWindow | undefined;
  try {
    for (const fixture of fixtures) {
      const at = performance.now();
      const output = await pdf.convert(fixture, 'readable', new AbortController().signal);
      const result = inspectPdf(output); await writeFile(path.join(directory, fixture.name.replace(/\.(txt|md)$/, '.pdf')), output);
      samples.push({ name: fixture.name, ms: Math.round(performance.now() - at), ...result });
    }
    const afterConversionKiB = workingSetKiB();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Fixture server unavailable');
    const origin = `http://127.0.0.1:${address.port}`, partition = 'persist:kite-phase0-synthetic';
    const browserAt = performance.now();
    browser = createBrowserSpike(origin, { visible: false, partition, testOrigin: origin });
    await browser.loadURL(`${origin}/signed-in`);
    const privilegedBridgeAbsent = await browser.webContents.executeJavaScript("typeof window.kite === 'undefined' && typeof require === 'undefined'");
    const defaultProfileUntouched = (await session.defaultSession.cookies.get({ url: origin })).length === 0;
    const browserWorkingSetKiB = workingSetKiB();
    const browserStartupMs = Math.round(performance.now() - browserAt);
    browser.webContents.session.flushStorageData(); browser.destroy();
    browser = createBrowserSpike(origin, { visible: false, partition, testOrigin: origin });
    await browser.loadURL(origin);
    const persistedLogin = (await browser.webContents.session.cookies.get({ url: origin })).some(c => c.name === 'spike_login');
    if (!persistedLogin || !defaultProfileUntouched || !privilegedBridgeAbsent) throw new Error('Browser isolation probe failed');
    let asarBytes: number | null = null;
    try { if (app.isPackaged) asarBytes = statSync(app.getAppPath()).size; } catch { /* Source harness has no packaged archive. */ }
    const gaps = responsiveness.slice(1).map((time, i) => time - responsiveness[i]);
    const report = { date: '2026-10-09', scope: 'Single workstation, synthetic fixtures, no provider traffic or real sign-in', packaged: app.isPackaged, versions: { electron: process.versions.electron, chromium: process.versions.chrome }, health: backgroundHealth(),
      startupMs, idleWorkingSetKiB, afterConversionKiB, browserWorkingSetKiB, browserStartupMs,
      eventLoop: { targetIntervalMs: 20, samples: gaps.length, maxGapMs: gaps.length ? Math.round(Math.max(...gaps)) : null },
      conversions: samples, browser: { isolatedPersistentProfile: true, persistedSyntheticLogin: persistedLogin, defaultProfileUntouched, privilegedBridgeAbsent, realAccountSignIn: 'not tested' },
      dependencies: { addedRuntimePackages: 0, bundledConverter: 'Existing Electron Chromium', officeAdapter: 'deferred; detection only', packagedAsarBytes: asarBytes, incrementalInstallerBytes: 'not measured against an identical baseline build' },
      modelUsage: { calls: 0, tokens: 0, reason: 'Deterministic workflow has no model planner' },
    };
    await writeFile(path.join(directory, 'phase0.json'), JSON.stringify(report, null, 2) + '\n');
    return report;
  } finally { clearInterval(interval); browser?.destroy(); pdf.close(); server.close(); }
}
