// Run after package: real document utility process, SQLite and file broker; synthetic files only.
const { app, safeStorage } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PDFDocument, StandardFonts } = require('pdf-lib');
require('./register.cjs');
const { DocumentExecutor } = require('../src/main/background/executors/documents.ts');
const { BackgroundStore } = require('../src/main/background/store.ts');
const { BackgroundRunService } = require('../src/main/background/service.ts');
const { hashOf, inspectPdf } = require('../src/main/background/artifacts.ts');
const { plainPdf } = require('../src/main/background/executors/documentCore.ts');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kite-documents-test-'));
app.setPath('userData', path.join(root, 'profile')); app.on('window-all-closed', () => {});
const cipher = { isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(), encryptString: s => safeStorage.encryptString(s), decryptString: b => safeStorage.decryptString(b) };
const wait = async (read, label) => { for (let i = 0; i < 400; i++) { if (read()) return; await new Promise(r => setTimeout(r, 20)); } throw new Error(label); };
app.whenReady().then(async () => {
  const executor = new DocumentExecutor(path.resolve('.vite/build/documentWorker.js'));
  let store, service;
  try {
    const fixture = await PDFDocument.create({ updateMetadata: false }), font = await fixture.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < 15; i++) fixture.addPage([500, 700]).drawText(`A source page ${i + 1}`, { x: 30, y: 600, font });
    const original = await fixture.save({ useObjectStreams: false }), filename = path.join(root, 'source.pdf'); fs.writeFileSync(filename, original);
    const sourceHash = hashOf(original);
    assert.equal((await executor.inspect({ kind: 'pdf', bytes: original })).pages, 15);
    const output = await executor.convert({ action: 'optimize', kind: 'pdf', bytes: original, targetBytes: 1024 }, new AbortController().signal);
    assert.equal(output.optimization.targetMet, false); assert.equal(output.pages, 15); assert.ok(output.bytes.length < original.length);
    assert.equal(inspectPdf(output.bytes, output.pages).pages, 15);
    const alreadySmall = await executor.convert({ action: 'optimize', kind: 'pdf', bytes: output.bytes }, new AbortController().signal);
    assert.equal(alreadySmall.optimization.changed, false); assert.deepEqual(Buffer.from(alreadySmall.bytes), Buffer.from(output.bytes));
    await assert.rejects(executor.inspect({ kind: 'pdf', bytes: fs.readFileSync('tests/fixtures/documents/encrypted.pdf') }), /password-protected/);
    await assert.rejects(executor.inspect({ kind: 'jpeg', bytes: fs.readFileSync('tests/fixtures/documents/cmyk.jpg') }), /CMYK/);
    const cancelled = new AbortController(); const cancelledJob = executor.convert({ action: 'optimize', kind: 'pdf', bytes: original }, cancelled.signal); cancelled.abort();
    await assert.rejects(cancelledJob, { name: 'AbortError' });
    const inflight = new AbortController(), inflightJob = executor.convert({ action: 'optimize', kind: 'pdf', bytes: original }, inflight.signal);
    await wait(() => executor.active.size === 1, 'worker dispatched'); inflight.abort();
    await assert.rejects(inflightJob, { name: 'AbortError' });
    assert.equal(executor.active.size, 0); assert.equal((await executor.inspect({ kind: 'pdf', bytes: original })).pages, 15);
    const connect = () => {
      store = new BackgroundStore(path.join(root, 'runs.db'), cipher);
      service = new BackgroundRunService({ store, root: path.join(root, 'artifacts'), changed() {},
        inspect: (input, bytes) => executor.inspect({ kind: input.kind, bytes }),
        convert: (input, _style, signal, agent) => {
          const bytes = store.source(input.sourceId); assert.equal(hashOf(bytes), input.hash);
          return executor.convert({ action: agent.workflow === 'pdf_optimize' ? 'optimize' : 'convert', kind: input.kind, bytes, targetBytes: agent.targetBytes }, signal);
        },
      });
    };
    connect(); service.setPaused(true);
    const selected = await service.attachFiles([filename]);
    const run = service.enqueue({ requestId: randomUUID(), title: 'Smaller documents', workflow: 'pdf_optimize', targetBytes: 1024, fileIds: [selected[0].id] }); assert.equal(run.ok, true);
    const frozen = store.get(run.runId).inputs[0]; assert.equal(frozen.text, undefined); assert.equal(store.source(frozen.sourceId).length, original.length);
    assert.ok(!JSON.stringify(store.get(run.runId)).includes(Buffer.from(original).toString('base64')), 'run updates contain source references, not the binary payload');
    // Restart before executing: the frozen encrypted PDF is independent of the original file and picker handles.
    await service.shutdown(); store.close(); fs.writeFileSync(filename, 'User changed the original after selection'); connect(); service.start();
    await wait(() => service.detail(run.runId).run.status === 'succeeded', 'frozen PDF resumes after restart');
    const completed = service.detail(run.runId).run; assert.match(completed.message, /target.*not met/); assert.equal(completed.artifacts[0].optimization.inputBytes, original.length);
    assert.equal((await plainPdf(await service.artifactBytes(run.runId, completed.artifacts[0].id))).getPageCount(), 15);
    fs.writeFileSync(filename, original);
    const imagePaths = ['rgb.png', 'rgba.png', 'rgb.jpg'].map(f => path.resolve('tests/fixtures/documents', f));
    const imageHashes = imagePaths.map(f => hashOf(fs.readFileSync(f)));
    const files = await service.attachFiles(imagePaths);
    assert.equal(service.enqueue({ requestId: randomUUID(), title: 'Wrong task', workflow: 'pdf_optimize', fileIds: files.map(f => f.id) }).ok, false);
    const batch = service.enqueue({ requestId: randomUUID(), title: 'Image batch', workflow: 'document_pdf', fileIds: files.map(f => f.id) }); assert.equal(batch.ok, true);
    await wait(() => service.detail(batch.runId).run.status === 'succeeded', 'image batch completes');
    assert.equal(service.detail(batch.runId).run.artifacts.length, 3);
    imagePaths.forEach((f, i) => assert.equal(hashOf(fs.readFileSync(f)), imageHashes[i])); assert.equal(hashOf(fs.readFileSync(filename)), sourceHash);
    await assert.rejects(service.attachFiles([path.join(root, 'unsupported.docx')]), /Office/);
    // Journal fixture: crash after an optimized file was published but before the run checkpoint.
    service.setPaused(true);
    const grant = await service.attachFiles([filename]); const recover = service.enqueue({ requestId: randomUUID(), title: 'Recover optimization', workflow: 'pdf_optimize', targetBytes: 1024, fileIds: [grant[0].id] });
    const record = store.get(recover.runId), journal = { id: `${record.id}:pdf:0`, runId: record.id, generation: 1, index: 0, inputHash: record.inputs[0].hash, style: 'readable', state: 'prepared', ...inspectPdf(output.bytes, output.pages), optimization: output.optimization };
    store.saveOperation(journal); fs.mkdirSync(path.join(root, 'artifacts', record.id), { recursive: true }); fs.writeFileSync(path.join(root, 'artifacts', record.id, 'output-1.pdf'), output.bytes);
    store.save({ ...record, status: 'verifying', revision: record.revision + 1 }, record.revision, 'crash', 'Prepared optimization');
    await service.shutdown(); store.close(); connect(); service.start();
    await wait(() => service.detail(record.id).run.status === 'succeeded', 'optimized output reconciles');
    assert.equal(service.detail(record.id).run.artifacts[0].optimization.targetMet, false);
    assert.equal(fs.readdirSync(path.join(root, 'artifacts', record.id)).filter(f => f.endsWith('.pdf')).length, 1);
    await service.shutdown(); store.close(); store = null;
    const db = fs.readFileSync(path.join(root, 'runs.db')); assert.ok(!db.includes(Buffer.from(original).toString('base64')), 'binary sources encrypted');
    // Simulate the exact v1 table set, including a pending legacy request and its binding.
    const legacyFile = path.join(root, 'legacy.db'), legacy = new BackgroundStore(legacyFile, cipher);
    const old = { ...record, id: randomUUID(), requestId: randomUUID(), inputs: [{ name: 'old.txt', text: 'Legacy frozen input' }], agent: { ...record.agent, workflow: 'text_pdf' }, status: 'waiting_user', request: { id: randomUUID(), kind: 'approval', binding: 'legacy-bound-input', message: 'Approve text PDF', expiresAt: Date.now() + 60000 }, approvedBinding: null };
    delete old.agent.targetBytes; legacy.insert(old, 'Legacy approval'); legacy.saveAgent(old.agent); legacy.close();
    const Database = require('better-sqlite3'), v1 = new Database(legacyFile); v1.exec('DROP TABLE agent_sources'); v1.pragma('user_version = 1'); v1.close();
    const migrated = new BackgroundStore(legacyFile, cipher);
    assert.equal(migrated.get(old.id).request.binding, 'legacy-bound-input'); assert.equal(migrated.get(old.id).inputs[0].text, 'Legacy frozen input'); assert.equal(migrated.agent(old.agent.id).workflow, 'text_pdf');
    const binaryId = randomUUID(); migrated.insert({ ...record, id: randomUUID(), requestId: randomUUID() }, 'New binary run', [{ id: binaryId, bytes: original }]); assert.equal(hashOf(migrated.source(binaryId)), sourceHash); migrated.close();
    console.log('PASS documents: real utility worker, parsed image/PDF outputs, lossless reduction and no-growth fallback, protected/CMYK rejection, cancellation, encrypted binary snapshots, restart and publication recovery, batch conversion, original hashes, target reporting');
    executor.close(); app.quit();
  } catch (error) { console.error(error); executor.close(); if (store) store.close(); app.exit(1); }
});
setTimeout(() => { console.error('Document test timed out'); app.exit(1); }, 60000).unref();
