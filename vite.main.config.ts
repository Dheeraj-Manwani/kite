import { defineConfig } from 'vite';
import { runtimeModules } from './build/runtimeModules';
// Forge merges array externals with its Electron/Node defaults. A function would be replaced.
export default defineConfig({ build: { rollupOptions: { external: ['original-fs', ...runtimeModules, ...runtimeModules.map(name => new RegExp('^' + name + '/'))] } } });
