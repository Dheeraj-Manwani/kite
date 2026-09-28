import { readdir } from 'node:fs/promises';
import path from 'node:path';
import Fuse from 'fuse.js';
export interface AppEntry { displayName: string; lnkPath: string }
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases: Record<string, string> = { vscode: 'visualstudiocode', chrome: 'googlechrome', notepad: 'notepad' };
export function findApps(entries: AppEntry[], name: string): { match?: AppEntry; candidates: AppEntry[] } {
  const query = aliases[normalize(name)] ?? normalize(name);
  const list = entries.map(app => ({ ...app, search: normalize(app.displayName) }));
  const exact = list.filter(a => a.search === query || a.search === normalize(name));
  if (exact.length === 1) return { match: exact[0], candidates: [] };
  const results = new Fuse(list, { keys: ['search'], threshold: 0.45, includeScore: true, ignoreLocation: true }).search(query).slice(0, 5);
  if (results[0] && (results[0].score ?? 1) < 0.3 && (!results[1] || (results[1].score ?? 1) - (results[0].score ?? 1) > 0.12))
    return { match: results[0].item, candidates: [] };
  return { candidates: results.map(r => r.item) };
}
export class AppIndex {
  private entries: AppEntry[] = []; private lastScan = 0; private scanning?: Promise<AppEntry[]>;
  snapshot() { return this.entries.map(e => ({ ...e })); }
  scan() {
    if (this.scanning) return this.scanning;
    if (this.lastScan && Date.now() - this.lastScan < 600000) return Promise.resolve(this.snapshot());
    this.scanning = (async () => {
      const entries: AppEntry[] = [];
      const walk = async (dir: string, depth = 0) => {
        if (depth > 20) return;
        let files; try { files = await readdir(dir, { withFileTypes: true }); } catch { return; }
        for (const file of files) {
          if (file.isSymbolicLink()) continue;
          const full = path.join(dir, file.name);
          if (file.isDirectory()) await walk(full, depth + 1);
          else if (/\.lnk$/i.test(file.name) && !/uninstall|readme|help/i.test(file.name)) entries.push({ displayName: file.name.slice(0, -4), lnkPath: full });
        }
      };
      for (const root of [process.env.APPDATA, process.env.ProgramData]) if (root) await walk(path.join(root, 'Microsoft', 'Windows', 'Start Menu', 'Programs'));
      this.entries = [...new Map(entries.map(e => [e.displayName.toLowerCase(), e])).values()]; this.lastScan = Date.now(); return this.snapshot();
    })().finally(() => { this.scanning = undefined; }); return this.scanning;
  }
}
