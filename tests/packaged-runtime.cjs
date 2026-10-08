// Load the actual packaged dependency tree, not the repository's node_modules.
const { app } = require('electron');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const assert = require('node:assert/strict');
app.whenReady().then(async () => {
  try {
    const packaged = createRequire(path.resolve('out/Kite-win32-x64/resources/app.asar/package.json'));
    const pdf = createRequire(packaged.resolve('pdf-lib/package.json'));
    assert.equal(pdf('pako/package.json').version, '1.0.11');
    const math = packaged('@mathjax/src');
    await math.init({ loader: { load: ['input/tex', 'output/svg'], require: file => import(pathToFileURL(packaged.resolve(file)).href) }, tex: { packages: ['base', 'ams'] }, svg: { fontCache: 'none' } });
    const result = await math.tex2svgPromise('\\frac{x^2}{2}=3', { display: true });
    assert.ok(math.startup.adaptor.outerHTML(result).includes('<path'));
    console.log('PASS packaged runtime dependencies: nested pako 1.0.11 and MathJax formula paths'); app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
setTimeout(() => { console.error('Packaged runtime test timed out'); app.exit(1); }, 15000).unref();
