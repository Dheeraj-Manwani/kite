const { app, safeStorage } = require('electron');
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { randomUUID } = require('node:crypto');
const Database = require('better-sqlite3');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kite-schedules-'));
app.setPath('userData', path.join(root, 'profile')); process.env.KITE_TEST_MODE = '1';
app.on('window-all-closed', () => {}); require('./register.cjs');
const { BackgroundStore } = require('../src/main/background/store.ts');
const { BackgroundRunService } = require('../src/main/background/service.ts');
const { CareerDiscovery } = require('../src/main/background/career/discovery.ts');
const { PdfExecutor } = require('../src/main/background/executors/pdf.ts');
const { defaultPermissions, withCategory } = require('../src/shared/permissions.ts');
const cipher = { isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(), encryptString: x => safeStorage.encryptString(x), decryptString: x => safeStorage.decryptString(x) };
const waitFor = async (check, label) => { const end = Date.now() + 15000; while (!check()) { assert.ok(Date.now() < end, label); await new Promise(r => setTimeout(r, 10)); } };
const deadline = setTimeout(() => { console.error('Schedule native timeout'); app.exit(1); }, 90000);
app.whenReady().then(async () => {
  const pdf = new PdfExecutor(); let service, store;
  try {
    const database = path.join(root, 'background.db'), notices = []; let reads = 0, conversions = 0, changed = false, settings = { permissions: defaultPermissions, dryRun: false };
    const career = new CareerDiscovery(async () => { reads++; return new Response(JSON.stringify({ jobs: [{ id: 1, title: changed ? 'Changed job' : 'Initial job', content: 'Private fixture description' }] })); });
    const compose = () => {
      store = new BackgroundStore(database, cipher);
      service = new BackgroundRunService({ store, root, career, convert: async (...args) => { conversions++; return pdf.convert({ name: args[0].name, text: args[0].text }, args[1], args[2]); }, changed() {}, notice: r => notices.push(r) });
      service.setSettings(() => settings);
    };
    compose();
    const helper = service.saveAgent({ name: 'Scheduled scout', instructions: '', workflow: 'career_scout', style: 'readable', career: { boards: [{ provider: 'greenhouse', board: 'fixture', region: 'global' }], keywords: '', location: '', maxJobs: 4 } }); assert.equal(helper.ok, true);
    const draft = { requestId: randomUUID(), agentId: helper.agentId, agentRevision: 1, recurrence: { kind: 'interval', minutes: 15 }, consent: true };
    const saved = service.saveSchedule(draft); assert.equal(saved.ok, true); const id = saved.scheduleId;
    assert.equal(service.saveSchedule(draft).scheduleId, id); assert.equal(service.saveSchedule({ ...draft, recurrence: { kind: 'interval', minutes: 30 } }).ok, false);
    assert.equal(service.saveSchedule({ ...draft, requestId: randomUUID(), consent: false }).ok, false);
    const due = store.schedule(id).nextAt, late = due + 900000 * 10;
    service.tickSchedules(late); service.tickSchedules(late);
    assert.equal(service.scheduleHistory({ id }).runs.length, 1, 'missed occurrences coalesce to one');
    let first = store.schedule(id).lastRunId;
    await waitFor(() => store.get(first).status === 'succeeded', 'first scheduled read');
    assert.equal(store.get(first).schedule.at, late); assert.equal(store.get(first).agent.revision, 1); assert.equal(reads, 1); assert.equal(conversions, 1); assert.equal(notices.length, 1);
    assert.equal(store.get(first).delegation.children[0].status, 'succeeded');
    // Freeze helper settings. Editing a helper cannot change an existing schedule's targets.
    assert.equal(service.saveAgent({ id: helper.agentId, expectedRevision: 1, name: 'Edited scout', instructions: '', workflow: 'career_scout', style: 'compact', career: { boards: [{ provider: 'greenhouse', board: 'different', region: 'global' }], keywords: '', location: '', maxJobs: 1 } }).ok, true);
    await service.shutdown(); store.close(); compose();
    service.tickSchedules(late); assert.equal(service.scheduleHistory({ id }).runs.length, 1, 'restart cannot repeat an occurrence');
    service.tickSchedules(late + 900000); const second = store.schedule(id).lastRunId;
    await waitFor(() => store.get(second).status === 'succeeded', 'quiet second check');
    assert.equal(store.get(second).unchanged, true); assert.equal(store.get(second).artifacts.length, 0); assert.equal(conversions, 1); assert.equal(notices.length, 1); assert.equal(store.get(second).agent.career.boards[0].board, 'fixture');
    changed = true; service.tickSchedules(late + 1800000); const third = store.schedule(id).lastRunId;
    await waitFor(() => store.get(third).status === 'succeeded', 'changed result'); assert.equal(conversions, 2); assert.equal(notices.length, 2);
    // Sleep/pause dispatch is suspended. Resume coalesces once; holding a run prevents another dispatch.
    service.setPaused(true, 'sleep'); service.tickSchedules(late + 9000000); assert.equal(store.schedule(id).lastRunId, third); service.setPaused(false, 'sleep');
    service.tickSchedules(late + 2700000); const fourth = store.schedule(id).lastRunId;
    service.control({ runId: fourth, expectedRevision: store.get(fourth).revision, action: 'pause' });
    service.tickSchedules(late + 9000000); assert.equal(store.schedule(id).lastRunId, fourth, 'paused outstanding run blocks later checks');
    assert.equal(service.controlSchedule({ id, revision: store.schedule(id).revision, action: 'renew' }).ok, false);
    service.control({ runId: fourth, expectedRevision: store.get(fourth).revision, action: 'cancel' });
    // Changed policy, even from Allow to Ask, invalidates captured consent and makes no network read.
    const previousReads = reads; settings = { permissions: withCategory(defaultPermissions, 'look', 'ask'), dryRun: false };
    service.tickSchedules(late + 9000000); const blocked = store.schedule(id).lastRunId;
    await waitFor(() => store.get(blocked).status === 'failed', 'policy change blocks schedule'); assert.equal(reads, previousReads); assert.equal(store.schedule(id).state, 'blocked');
    const count = notices.length; service.tickSchedules(late + 18000000); assert.equal(notices.length, count); assert.equal(store.schedule(id).lastRunId, blocked);
    const stale = store.schedule(id).revision; assert.equal(service.controlSchedule({ id, revision: stale - 1, action: 'renew' }).ok, false);
    assert.equal(service.controlSchedule({ id, revision: stale, action: 'renew' }).ok, true);
    service.tickSchedules(store.schedule(id).nextAt); const renewed = store.schedule(id).lastRunId; await waitFor(() => store.get(renewed).status === 'succeeded', 'explicit scoped renewal permits Ask reads');
    assert.equal(store.get(renewed).unchanged, true);
    // Durable occurrence uniqueness rolls back both the duplicate run and a schedule cursor update.
    const current = store.schedule(id), copy = { ...store.get(first), id: randomUUID(), requestId: randomUUID() };
    assert.throws(() => store.dispatch({ ...current, revision: current.revision + 1 }, current.revision, copy), /UNIQUE/); assert.equal(store.get(copy.id), null); assert.equal(store.schedule(id).revision, current.revision);
    // History pagination uses SQLite identity, not millisecond timestamps or the recent-200 snapshot.
    let schedule = store.schedule(id);
    for (let i = 0; i < 205; i++) { const record = { ...store.get(first), id: randomUUID(), requestId: randomUUID(), createdAt: first.createdAt ?? Date.now(), schedule: { ...store.get(first).schedule, at: late + 100000000 + i } }; const next = { ...schedule, revision: schedule.revision + 1, lastRunId: record.id }; store.dispatch(next, schedule.revision, record); schedule = next; }
    let cursor, ids = [];
    do { const page = service.scheduleHistory({ id, ...(cursor ? { before: cursor } : {}) }); ids.push(...page.runs.map(r => r.id)); cursor = page.nextCursor; } while (cursor);
    assert.ok(ids.includes(first)); assert.equal(new Set(ids).size, ids.length); assert.equal(ids.length, 211);
    // A v2 store with real encrypted rows migrates without losing runs or artifacts.
    await service.shutdown(); store.close(); const db = new Database(database); db.exec('DROP TABLE agent_dispatches; DROP TABLE agent_schedules; PRAGMA user_version=2;'); db.close();
    compose(); assert.ok(store.get(first).artifacts.length); assert.equal(store.schedules().length, 0); await service.shutdown(); store.close();
    const bytes = fs.readFileSync(database); assert.ok(!bytes.includes(Buffer.from('Private fixture description')), 'schedule results remain encrypted on disk');
    // Bound Gmail grant, account identity, revocation, and unchanged extraction.
    const mailDb = path.join(root, 'mail-runs.db'), accountId = randomUUID(); let account = { id: accountId, email: 'same@kite.test', revision: 1, status: 'connected' }, mailReads = 0;
    const mail = { account: () => account, brief: async bound => { mailReads++; return { accountId, email: bound.email, query: bound.query, fetchedAt: Date.now(), messages: [], selectedAttachments: [], moreMatches: false, missingMessages: 0, skippedAttachments: 0 }; } };
    store = new BackgroundStore(mailDb, cipher); service = new BackgroundRunService({ store, root, mail, changed() {}, convert: (input,style,signal) => pdf.convert(input,style,signal) });
    const mailHelper = service.saveAgent({ name: 'Mail monitor', instructions: '', workflow: 'inbox_briefing', style: 'readable', mail: { accountId, query: 'in:inbox', maxMessages: 5, includeAttachments: false } });
    const mailSchedule = service.saveSchedule({ ...draft, requestId: randomUUID(), agentId: mailHelper.agentId }); assert.equal(mailSchedule.ok, true); const mid = mailSchedule.scheduleId;
    let when = store.schedule(mid).nextAt; service.tickSchedules(when); let mr = store.schedule(mid).lastRunId; await waitFor(() => store.get(mr).status === 'succeeded', 'Gmail recurring consent'); assert.equal(mailReads, 1);
    service.tickSchedules(when + 900000); mr = store.schedule(mid).lastRunId; await waitFor(() => store.get(mr).status === 'succeeded', 'Gmail unchanged'); assert.equal(store.get(mr).unchanged, true);
    account = { ...account, revision: 2, status: 'disconnected' }; service.tickSchedules(when + 1800000); mr = store.schedule(mid).lastRunId; await waitFor(() => store.get(mr).status === 'failed', 'Gmail access revoked'); assert.equal(mailReads, 2);
    account = { ...account, status: 'connected', email: 'different@kite.test' }; assert.equal(service.controlSchedule({ id: mid, revision: store.schedule(mid).revision, action: 'renew' }).ok, false, 'cannot renew against another mailbox');
    account = { ...account, email: 'same@kite.test' }; assert.equal(service.controlSchedule({ id: mid, revision: store.schedule(mid).revision, action: 'renew' }).ok, true); assert.equal(store.schedule(mid).mail.accountRevision, 2);
    await service.shutdown(); store.close(); pdf.close(); clearTimeout(deadline);
    console.log('PASS schedules native: encrypted v2 migration, atomic dispatch rollback, restart/sleep/coalescing, frozen scope, outstanding-run backpressure, quiet results, policy/Gmail revocation and renewal, deduplicated notices, durable history beyond 200 runs and child budget checkpoints'); app.quit();
  } catch (error) { console.error(error); await service?.shutdown(); try { store?.close(); } catch {} pdf.close(); clearTimeout(deadline); app.exit(1); }
});
