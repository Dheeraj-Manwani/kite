const { app, safeStorage, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kite-background-tests-'));
app.setPath('userData', path.join(root, 'profile')); process.env.KITE_TEST_MODE = '1';
app.on('window-all-closed', () => {});
require('./register.cjs');
const { BackgroundStore } = require('../src/main/background/store.ts');
const { BackgroundRunService } = require('../src/main/background/service.ts');
const { PdfExecutor } = require('../src/main/background/executors/pdf.ts');
const { startBackground } = require('../src/main/tools/impl/start_background.ts');
const { defaultPermissions } = require('../src/shared/permissions.ts');
const { hashOf, inspectPdf } = require('../src/main/background/artifacts.ts');
const cipher = { isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(), encryptString: x => safeStorage.encryptString(x), decryptString: x => safeStorage.decryptString(x) };
const waitFor = async (check, message) => { const end = Date.now() + 15000; while (!check()) { assert.ok(Date.now() < end, message); await new Promise(r => setTimeout(r, 10)); } };
const input = text => ({ requestId: randomUUID(), title: 'Test PDF', ...(text === undefined ? {} : { text }) });
const create = (name, convert) => {
  const directory = path.join(root, name); fs.mkdirSync(directory, { recursive: true });
  const store = new BackgroundStore(path.join(directory, 'runs.db'), cipher);
  const service = new BackgroundRunService({ store, root: directory, convert, changed() {} });
  return { directory, store, service };
};
app.whenReady().then(async () => {
  const pdf = new PdfExecutor();
  try {
    const realPdf = await pdf.convert({ name: 'Readable fixture.txt', text: 'A document that stays local.\n\nSecond paragraph.' }, 'readable', new AbortController().signal);
    assert.equal(inspectPdf(realPdf).pages, 1);
    assert.equal(BrowserWindow.getAllWindows().length, 0, 'converter releases its hidden renderer');

    // The actual foreground tool returns after persistence and transfers ownership away from the voice signal.
    let releaseVoice;
    const delegated = create('voice-handoff', () => new Promise(resolve => { releaseVoice = resolve; }));
    const tool = startBackground(delegated.service), foreground = new AbortController();
    assert.equal(tool.approvalRequired, true);
    const preview = await tool.execute({ title: 'Preview', text: 'Not saved' }, { dryRun: true, signal: foreground.signal });
    assert.equal(preview.dryRun, true); assert.equal(delegated.service.snapshot().runs.length, 0);
    const handedOff = await tool.execute({ title: 'Voice handoff', text: 'Exact supplied source' }, { dryRun: false, signal: foreground.signal });
    assert.equal(handedOff.ok, true);
    await waitFor(() => !!releaseVoice, 'background worker owns accepted run');
    foreground.abort(); // Equivalent to a new hold cancelling the prior voice interaction.
    releaseVoice(realPdf);
    await waitFor(() => delegated.service.detail(handedOff.data.runId).run.status === 'succeeded', 'foreground cancellation does not cancel accepted run');
    await delegated.service.shutdown(); delegated.store.close();

    // Two independent runs, immutable agent revisions, persisted request deduplication, and stale output fencing.
    const releases = [];
    const first = create('concurrent', () => new Promise(resolve => releases.push(resolve)));
    const agent = first.service.saveAgent({ name: 'My PDF agent', instructions: 'Personal brief', workflow: 'text_pdf', style: 'compact' });
    assert.equal(agent.ok, true);
    const request = { ...input('Secret test source 6ae39b'), agentId: agent.agentId };
    const a = first.service.enqueue(request), b = first.service.enqueue(input('Independent PDF'));
    assert.equal(first.service.enqueue(request).runId, a.runId, 'duplicate IPC does not duplicate the run');
    assert.equal(first.service.enqueue({ ...request, text: 'changed' }).ok, false);
    await waitFor(() => releases.length === 2, 'both runs execute independently');
    assert.equal(first.service.saveAgent({ id: agent.agentId, expectedRevision: 1, name: 'Updated agent', instructions: '', workflow: 'text_pdf', style: 'readable' }).ok, true);
    assert.equal(first.store.get(a.runId).agent.style, 'compact');
    assert.equal(first.store.get(a.runId).agent.revision, 1);
    const runA = first.service.detail(a.runId).run;
    assert.equal(first.service.control({ runId: a.runId, expectedRevision: runA.revision, action: 'cancel' }).ok, true);
    releases[0](realPdf); releases[1](realPdf);
    await waitFor(() => first.service.detail(b.runId).run.status === 'succeeded', 'other run completes');
    assert.equal(first.service.detail(a.runId).run.artifacts.length, 0, 'late callback cannot publish cancelled output');
    assert.equal(first.service.detail(a.runId).run.status, 'cancelled');
    assert.equal(first.service.control({ runId: b.runId, expectedRevision: 1, action: 'cancel' }).ok, false, 'stale panel command rejected');
    const complete = first.service.detail(b.runId);
    assert.ok(complete.events.every((e, i) => i === 0 || e.sequence > complete.events[i - 1].sequence));
    assert.equal(first.service.detail(b.runId, complete.events[1].sequence).events[0].sequence, complete.events[1].sequence + 1, 'event replay cursor');
    const bytes = await first.service.artifactBytes(b.runId, complete.run.artifacts[0].id); assert.equal(hashOf(bytes), complete.run.artifacts[0].hash);
    fs.writeFileSync(path.join(first.directory, b.runId, 'output-1.pdf'), 'tampered');
    assert.equal(await first.service.artifactPath(b.runId, complete.run.artifacts[0].id), null, 'tampered artifact cannot be opened');
    await first.service.shutdown(); first.store.close();
    for (const filename of fs.readdirSync(first.directory).filter(f => f.startsWith('runs.db'))) assert.ok(!fs.readFileSync(path.join(first.directory, filename)).includes('Secret test source 6ae39b'), 'stored document text encrypted');

    // Input questions and approvals survive closing the service/database. No held Promise is necessary.
    let pending = create('questions', async () => realPdf);
    const question = pending.service.enqueue(input());
    assert.equal(pending.service.detail(question.runId).run.status, 'waiting_user');
    await pending.service.shutdown(); pending.store.close();
    pending = create('questions', async () => realPdf);
    pending.service.setSettings(() => ({ permissions: { ...defaultPermissions, mode: 'ask' }, dryRun: false }));
    let waiting = pending.service.detail(question.runId).run;
    assert.equal(pending.service.answer({ runId: waiting.id, requestId: waiting.request.id, expectedRevision: waiting.revision, text: 'Text added after restart' }).ok, true);
    await waitFor(() => pending.service.detail(question.runId).run.status === 'waiting_user', 'permission approval is durable');
    waiting = pending.service.detail(question.runId).run;
    assert.equal(waiting.request.kind, 'approval');
    const requestId = waiting.request.id;
    await pending.service.shutdown(); pending.store.close(); pending = create('questions', async () => realPdf);
    pending.service.setSettings(() => ({ permissions: { ...defaultPermissions, mode: 'ask' }, dryRun: false }));
    waiting = pending.service.detail(question.runId).run; assert.equal(waiting.request.id, requestId);
    assert.equal(pending.service.answer({ runId: waiting.id, requestId, expectedRevision: waiting.revision, approved: true }).ok, true);
    assert.equal(pending.service.answer({ runId: waiting.id, requestId, expectedRevision: waiting.revision, approved: true }).ok, false, 'approval cannot be reused');
    await waitFor(() => pending.service.detail(question.runId).run.status === 'succeeded', 'approved run completes');
    await pending.service.shutdown(); pending.store.close();

    // Reconcile crash after file publication but before SQLite acknowledgement: no second conversion or output.
    let recover = create('recovery', async () => { throw new Error('must not reconvert'); });
    recover.service.setPaused(true);
    const recoveryRun = recover.service.enqueue(input('Checkpoint test'));
    let record = recover.store.get(recoveryRun.runId);
    const operation = { id: `${record.id}:pdf:0`, runId: record.id, generation: 1, index: 0, inputHash: hashOf(record.inputs[0].text), style: record.agent.style, state: 'prepared', ...inspectPdf(realPdf) };
    recover.store.saveOperation(operation);
    fs.mkdirSync(path.join(recover.directory, record.id)); fs.writeFileSync(path.join(recover.directory, record.id, 'output-1.pdf'), realPdf);
    recover.store.save({ ...record, status: 'verifying', attempts: 1, revision: record.revision + 1 }, record.revision, 'crash-fixture', 'Simulated crash after publication');
    await recover.service.shutdown(); recover.store.close();
    recover = create('recovery', async () => { throw new Error('must not reconvert'); }); recover.service.start();
    await waitFor(() => recover.service.detail(recoveryRun.runId).run.status === 'succeeded', 'prepared output is reconciled');
    assert.equal(recover.service.detail(recoveryRun.runId).run.artifacts.length, 1);
    assert.equal(fs.readdirSync(path.join(recover.directory, record.id)).filter(f => f.endsWith('.pdf')).length, 1);
    await recover.service.shutdown(); recover.store.close();

    // Voluntary pauses do not consume crash-recovery budget, even after several starts.
    const pauseReleases = [];
    const pausing = create('pauses', () => new Promise(resolve => pauseReleases.push(resolve)));
    const pauseRun = pausing.service.enqueue(input('Can pause more than three times'));
    for (let i = 0; i < 4; i++) {
      await waitFor(() => pauseReleases.length === i + 1, 'resumed worker starts');
      const current = pausing.service.detail(pauseRun.runId).run;
      assert.equal(pausing.service.control({ runId: current.id, expectedRevision: current.revision, action: 'pause' }).ok, true);
      pauseReleases[i](realPdf);
      await new Promise(resolve => setTimeout(resolve, 30));
      const paused = pausing.service.detail(pauseRun.runId).run;
      assert.equal(pausing.service.control({ runId: paused.id, expectedRevision: paused.revision, action: 'resume' }).ok, true);
    }
    await waitFor(() => pauseReleases.length === 5, 'fifth start allowed'); pauseReleases[4](realPdf);
    await waitFor(() => pausing.service.detail(pauseRun.runId).run.status === 'succeeded', 'paused run completes');
    await pausing.service.shutdown(); pausing.store.close();

    // Repeated unexpected interruptions stop automatically rather than creating an endless restart loop.
    let crashing = create('crash-budget', async () => realPdf); crashing.service.setPaused(true);
    const crashRun = crashing.service.enqueue(input('Repeated crash fixture'));
    for (let i = 0; i < 3; i++) {
      const record = crashing.store.get(crashRun.runId);
      crashing.store.save({ ...record, status: 'running', revision: record.revision + 1 }, record.revision, 'crash-fixture', 'Interrupted execution');
      await crashing.service.shutdown(); crashing.store.close();
      crashing = create('crash-budget', async () => realPdf);
    }
    assert.equal(crashing.service.detail(crashRun.runId).run.status, 'failed');
    await crashing.service.shutdown(); crashing.store.close();

    // A failed executor leaves another run usable; global pause, input grants and policy are enforced.
    let calls = 0;
    const failures = create('failures', async () => { if (++calls === 1) throw new Error('conversion failed'); return realPdf; });
    failures.service.setPaused(true);
    const fail = failures.service.enqueue(input('Will fail')), ok = failures.service.enqueue(input('Will succeed'));
    await new Promise(r => setTimeout(r, 30)); assert.equal(calls, 0, 'global pause blocks dispatch');
    failures.service.setPaused(false);
    await waitFor(() => failures.service.detail(ok.runId).run.status === 'succeeded', 'independent executor failure isolated');
    assert.equal(failures.service.detail(fail.runId).run.status, 'failed');
    const source = path.join(root, 'source.md'); fs.writeFileSync(source, 'Original content');
    const grants = await failures.service.attachFiles([source]); fs.writeFileSync(source, 'User changed the original');
    failures.service.setPaused(true);
    const selected = failures.service.enqueue({ requestId: randomUUID(), title: 'Frozen file', fileIds: [grants[0].id] });
    assert.equal(failures.store.get(selected.runId).inputs[0].text, 'Original content', 'picker freezes exactly selected content');
    assert.equal(failures.service.enqueue({ requestId: randomUUID(), title: 'Unknown file', fileIds: [randomUUID()] }).ok, false);
    failures.service.setSettings(() => ({ permissions: { ...defaultPermissions, mode: 'custom', custom: { ...defaultPermissions.custom, add: 'never' } }, dryRun: false }));
    assert.equal(failures.service.enqueue(input('Blocked')).ok, false);
    failures.service.setPaused(false);
    await waitFor(() => failures.service.detail(selected.runId).run.status === 'failed', 'current permission revocation checked');
    await failures.service.shutdown(); failures.store.close();

    let finishPolicy;
    const revoking = create('revoked-during-conversion', () => new Promise(resolve => { finishPolicy = resolve; }));
    const revoked = revoking.service.enqueue(input('Permission changes during conversion'));
    await waitFor(() => !!finishPolicy, 'conversion started under original policy');
    revoking.service.setSettings(() => ({ permissions: { ...defaultPermissions, mode: 'custom', custom: { ...defaultPermissions.custom, add: 'never' } }, dryRun: false }));
    finishPolicy(realPdf);
    await waitFor(() => revoking.service.detail(revoked.runId).run.status === 'failed', 'revoked policy prevents publication');
    assert.equal(revoking.service.detail(revoked.runId).run.artifacts.length, 0);
    assert.equal(fs.existsSync(path.join(revoking.directory, revoked.runId, 'output-1.pdf')), false);
    await revoking.service.shutdown(); revoking.store.close();

    // An old unanswered question must remain reachable when recent completed history exceeds the list limit.
    const history = create('history-window', async () => realPdf);
    const oldQuestion = history.service.enqueue(input());
    const questionRecord = history.store.get(oldQuestion.runId);
    for (let i = 0; i < 201; i++) history.store.insert({ ...questionRecord, id: randomUUID(), requestId: randomUUID(), status: 'cancelled', request: null, createdAt: questionRecord.createdAt + i + 1 }, 'Finished fixture');
    assert.equal(history.service.snapshot().runs.length, 200);
    assert.ok(history.service.snapshot().runs.some(r => r.id === oldQuestion.runId), 'unfinished work is never hidden by recent history');
    await history.service.shutdown(); history.store.close();

    console.log('PASS background runtime: real PDF, encrypted SQLite, concurrent runs, immutable revisions, approval recovery, event replay, cancellation fencing, publication recovery, grants, policy and failure isolation');
    pdf.close(); app.quit();
  } catch (error) { console.error(error); pdf.close(); app.exit(1); }
});
setTimeout(() => { console.error('Background runtime test timed out'); app.exit(1); }, 60000).unref();
