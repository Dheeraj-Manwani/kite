import fs from 'node:fs/promises';
import path from 'node:path';
/** Vite externals and the packaging dependency roots share this source of truth. */
export const runtimeModules = ['better-sqlite3', 'uiohook-napi', 'ws', 'electron-log', 'update-electron-app', 'elkjs', '@mathjax/src'];
async function packageRoot(name: string, from: string) {
  try { return path.dirname(require.resolve(`${name}/package.json`, { paths: [from] })); }
  catch {
    let folder = path.dirname(require.resolve(name, { paths: [from] }));
    while (folder) {
      try { const pkg = JSON.parse(await fs.readFile(path.join(folder, 'package.json'), 'utf8')); if (pkg.name === name) return folder; } catch { /* Walk up through exports-only packages. */ }
      const parent = path.dirname(folder); if (parent === folder) throw new Error(`Package root not found: ${name}`); folder = parent;
    }
    throw new Error(`Package root not found: ${name}`);
  }
}
export async function copyRuntimeModules(buildPath: string, source = process.cwd()) {
  const copy = async (name: string, from: string, destination: string, ancestors: string[]) => {
    const root = await packageRoot(name, from);
    if (ancestors.includes(root)) return;
    const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
    const target = path.join(destination, 'node_modules', name);
    await fs.cp(root, target, { recursive: true, filter: file => !path.relative(root, file).split(path.sep).includes('node_modules') });
    const deps = { ...pkg.dependencies, ...pkg.optionalDependencies };
    for (const dep of Object.keys(deps)) {
      try { await copy(dep, root, target, [...ancestors, root]); }
      catch (error) { if (!(dep in (pkg.optionalDependencies ?? {}))) throw error; }
    }
    console.log(`[runtime] ${pkg.name}@${pkg.version}`);
  };
  for (const name of runtimeModules) await copy(name, source, buildPath, []);
}
