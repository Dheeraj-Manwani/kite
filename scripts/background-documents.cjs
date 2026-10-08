const { spawnSync } = require('node:child_process');
const path = require('node:path');
const executable = path.resolve('out/Kite-win32-x64/Kite.exe');
const output = path.resolve(process.argv[2] || 'out/background-documents');
const result = spawnSync(executable, ['--background-documents-spike', output], { encoding: 'utf8', timeout: 60000, windowsHide: true });
if (result.error) { console.error(result.error.message); process.exit(1); }
if (result.stdout) console.log(result.stdout.trim());
if (result.status !== 0 && result.stderr) console.error(result.stderr.trim());
process.exit(result.status ?? 1);
