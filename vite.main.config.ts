import { defineConfig } from 'vite';

// Keep ws in Node: its optional native accelerators are guarded by try/catch.
// Bundling it can turn those optional requires into eager, failing imports.
export default defineConfig({ build: { rollupOptions: { external: ['uiohook-napi', 'better-sqlite3', 'ws'] } } });
