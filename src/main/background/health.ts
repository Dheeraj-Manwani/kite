import { existsSync } from 'node:fs';
import path from 'node:path';
import type { BackgroundHealth } from '../../shared/background';
import { createRequire } from 'node:module';

export function backgroundHealth(): BackgroundHealth {
  const office = ['ProgramFiles', 'ProgramFiles(x86)'].map(root => path.join(process.env[root] ?? '', 'LibreOffice', 'program', 'soffice.com')).find(file => existsSync(file));
  let version = 'unavailable'; try { version = (createRequire(path.join(__dirname, 'documentWorker.js'))('pdf-lib/package.json') as { version: string }).version; } catch { /* Missing optional worker dependency disables binary workflows. */ }
  const available = version !== 'unavailable' && existsSync(path.join(__dirname, 'documentWorker.js'));
  return { pdf: { available: true, engine: 'Chromium PDF', version: process.versions.chrome ?? 'unknown', formats: ['txt', 'md'] }, documents: { available, engine: 'pdf-lib', version, formats: ['png', 'jpg', 'jpeg', 'pdf'], message: available ? 'Images to PDF and lossless optimization of plain PDFs. No image downsampling; size targets may not be met.' : 'The document worker or library is missing. Repair or rebuild Kite to use image conversion and PDF optimization.' }, office: { available: !!office, engine: 'LibreOffice', message: office ? 'Installation detected. Office support is gated on converter and fidelity fixtures.' : 'Office converter not installed. Office files are not supported by this release.' }, browser: { engine: 'Isolated Chromium profile (spike)', version: process.versions.chrome ?? 'unknown', automation: false } };
}
