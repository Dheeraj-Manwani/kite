// ESLint 8 resolver does not understand this package export; TypeScript validates it.
// eslint-disable-next-line import/no-unresolved
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/*.spec.ts'], environment: 'node' } });
