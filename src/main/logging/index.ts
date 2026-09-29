import log from 'electron-log/main';
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { redact } from './redact';
export function logEvent(event: string, data: unknown = {}) {
  if (!/^[a-z][a-z0-9:_-]{0,70}$/.test(event)) return;
  log.info(event, redact(data));
}
export function setupLogging(onFault: () => void) {
  app.setAppLogsPath();
  log.transports.file.resolvePathFn = () => path.join(app.getPath('logs'), 'kite.log');
  log.transports.file.maxSize = 5 * 1024 * 1024;
  log.transports.file.archiveLogFn = file => {
    const base = file.path;
    try {
      if (fs.existsSync(`${base}.2`)) fs.unlinkSync(`${base}.2`);
      if (fs.existsSync(`${base}.1`)) fs.renameSync(`${base}.1`, `${base}.2`);
      fs.renameSync(base, `${base}.1`);
    } catch { /* Never crash while rotating diagnostics. */ }
  };
  log.transports.console.level = false;
  // Renderer events cross our narrow, trusted IPC handler; no raw electron-log IPC.
  process.on('uncaughtException', () => { logEvent('process:uncaught', { code: 'UNKNOWN' }); onFault(); });
  process.on('unhandledRejection', () => { logEvent('process:rejection', { code: 'UNKNOWN' }); onFault(); });
}
