import { existsSync } from 'node:fs';
import path from 'node:path';
import type { BackgroundHealth } from '../../shared/background';

export function backgroundHealth(): BackgroundHealth {
  const office = ['ProgramFiles', 'ProgramFiles(x86)'].map(root => path.join(process.env[root] ?? '', 'LibreOffice', 'program', 'soffice.com')).find(file => existsSync(file));
  return { pdf: { available: true, engine: 'Chromium PDF', version: process.versions.chrome ?? 'unknown', formats: ['txt', 'md'] }, office: { available: !!office, engine: 'LibreOffice', message: office ? 'Installation detected. Office conversion needs the phase 2 adapter and fidelity checks.' : 'Not installed. Office conversion will be added after the converter and layout checks.' }, browser: { engine: 'Isolated Chromium profile (spike)', version: process.versions.chrome ?? 'unknown', automation: false } };
}
