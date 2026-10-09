const { app, safeStorage } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('./register.cjs');
const { createMailFixture } = require('./mail-fixture.cjs');
const { MailStore } = require('../src/main/connectors/mail/store.ts');
const { MailHttp } = require('../src/main/connectors/mail/http.ts');
const { GmailConnector } = require('../src/main/connectors/mail/gmail.ts');
const { BackgroundStore } = require('../src/main/background/store.ts');
const { BackgroundRunService } = require('../src/main/background/service.ts');
const { PdfExecutor } = require('../src/main/background/executors/pdf.ts');
const { hashOf, inspectAttachment } = require('../src/main/background/artifacts.ts');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kite-mail-test-')); app.setPath('userData', path.join(root, 'profile')); app.on('window-all-closed', () => {});
const cipher = { isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(), encryptString: s => safeStorage.encryptString(s), decryptString: b => safeStorage.decryptString(b) };
const until = async (read, label) => { for (let i = 0; i < 500; i++) { const result = read(); if (result) return result; await new Promise(resolve => setTimeout(resolve, 20)); } throw new Error(`Timed out: ${label}`); };
app.whenReady().then(async () => {
  const fixture = await createMailFixture(); let accounts = new MailStore(path.join(root, 'mail.db'), cipher); const pdf = new PdfExecutor();
  let store, service;
  let connector = new GmailConnector(accounts, fixture.openBrowser, id => { if (id) service?.mailChanged(id); }, new MailHttp(fixture.transport));
  const compose = () => { store = new BackgroundStore(path.join(root, 'runs.db'), cipher); service = new BackgroundRunService({ store, root: path.join(root, 'artifacts'), mail: connector, changed() {}, convert: (input, style, signal) => pdf.convert(input, style, signal) }); service.start(); };
  const approve = id => { const run = service.detail(id).run; assert.equal(run.request.kind, 'approval'); return service.answer({ runId: id, expectedRevision: run.revision, requestId: run.request.id, approved: true }); };
  const start = (account, query = 'in:inbox', includeAttachments = true) => service.enqueue({ requestId: randomUUID(), title: 'Inbox fixture', workflow: 'inbox_briefing', mail: { accountId: account.id, query, maxMessages: 2, includeAttachments } });
  try {
    connector.configure({ installed: { client_id: 'fixture-client.apps.googleusercontent.com', client_secret: 'fixture-client-private-value' } });
    const alpha = await connector.connect(); fixture.state.nextAccount = 'beta'; const beta = await connector.connect();
    assert.equal(alpha.email, 'alpha@kite.test'); assert.equal(beta.email, 'beta@kite.test');
    assert.ok(!JSON.stringify(connector.state()).includes('refresh')); assert.ok(!JSON.stringify(connector.state()).includes('clientSecret'));
    fixture.state.scope = 'https://www.googleapis.com/auth/gmail.modify';
    await assert.rejects(connector.connect(beta.id, beta.revision), { code: 'scope' });
    assert.equal(connector.account(beta.id).revision, beta.revision, 'wider grant cannot replace the read-only account');
    delete fixture.state.scope;
    await connector.close(); accounts.close(); accounts = new MailStore(path.join(root, 'mail.db'), cipher);
    connector = new GmailConnector(accounts, fixture.openBrowser, id => { if (id) service?.mailChanged(id); }, new MailHttp(fixture.transport));
    compose(); const beforeRead = fixture.calls.length, first = start(alpha); assert.equal(first.ok, true);
    await until(() => service.detail(first.runId).run.request?.kind === 'approval', 'mail approval'); assert.equal(fixture.calls.length, beforeRead, 'mail not read before approval');
    const pending = service.detail(first.runId).run;
    await service.shutdown(); store.close(); service = null; compose();
    assert.equal(service.detail(first.runId).run.request.id, pending.request.id, 'pending approval survives restart');
    assert.equal(service.answer({ runId: first.runId, requestId: pending.request.id, expectedRevision: pending.revision, approved: true, mail: { accountId: beta.id, query: 'in:inbox' } }).ok, false, 'cannot switch account during approval');
    assert.equal(approve(first.runId).ok, true);
    await until(() => service.detail(first.runId).run.status === 'succeeded', 'briefing completion');
    assert.ok(fixture.calls.filter(c => c.path === '/token').length >= 3, 'stored refresh token used after restart');
    const detail = service.detail(first.runId); assert.equal(detail.briefing.email, alpha.email); assert.equal(detail.briefing.messages.length, 2); assert.equal(detail.run.modelCalls, 0); assert.equal(detail.run.artifacts.length, 2);
    fs.mkdirSync('out', { recursive: true }); fs.writeFileSync('out/mail-briefing.pdf', await service.artifactBytes(first.runId, detail.run.artifacts[0].id));
    assert.equal(detail.briefing.moreMatches, true); assert.equal(detail.briefing.skippedAttachments, 1); assert.ok(!detail.briefing.messages[1].excerpt.includes('script'));
    const file = detail.run.artifacts[1]; assert.equal(file.mediaType, 'application/octet-stream'); assert.deepEqual(Buffer.from(await service.artifactBytes(first.runId, file.id)), fixture.attachment);
    const filename = await service.artifactPath(first.runId, file.id); assert.ok(filename.endsWith('.bin')); fs.writeFileSync(filename, 'tampered'); assert.equal(await service.artifactPath(first.runId, file.id), null); fs.writeFileSync(filename, fixture.attachment);
    // Recover an attachment published before its run checkpoint; no second download or duplicate output.
    service.setPaused(true); const recover = start(alpha), seed = store.get(recover.runId), snapshot = detail.briefing;
    const journal = { id: `${seed.id}:mail:1`, runId: seed.id, generation: seed.generation, index: 1, inputHash: hashOf(JSON.stringify(snapshot)), style: seed.agent.style, mediaType: 'application/octet-stream', state: 'prepared', ...inspectAttachment(fixture.attachment) };
    store.saveOperation(journal); fs.mkdirSync(path.join(root, 'artifacts', seed.id), { recursive: true }); fs.writeFileSync(path.join(root, 'artifacts', seed.id, 'output-2.bin'), fixture.attachment);
    const briefArtifact = { ...detail.run.artifacts[0], id: `${seed.id}:0` }; fs.writeFileSync(path.join(root, 'artifacts', seed.id, 'output-1.pdf'), await service.artifactBytes(first.runId, detail.run.artifacts[0].id));
    store.save({ ...seed, status: 'verifying', revision: seed.revision + 1, completed: 1, briefing: snapshot, artifacts: [briefArtifact], approvedBinding: service.binding(seed) }, seed.revision, 'crash', 'Synthetic crash after attachment publication');
    await service.shutdown(); store.close(); service = null; const readsBeforeRecovery = fixture.calls.length; compose();
    await until(() => service.detail(seed.id).run.status === 'succeeded', 'attachment publication recovery'); assert.equal(fixture.calls.length, readsBeforeRecovery); assert.equal(fs.readdirSync(path.join(root, 'artifacts', seed.id)).length, 2);
    // Disconnect affects only the selected account and invalidates any old approval.
    const blocked = start(alpha); await until(() => service.detail(blocked.runId).run.request?.kind === 'approval', 'approval before disconnect');
    await connector.disconnect(alpha.id, connector.account(alpha.id).revision); assert.equal(service.detail(blocked.runId).run.request.kind, 'mail_access'); assert.equal(connector.account(beta.id).status, 'connected');
    fixture.state.nextAccount = 'beta'; await assert.rejects(connector.connect(alpha.id, connector.account(alpha.id).revision), { code: 'account' });
    fixture.state.nextAccount = 'alpha'; await connector.connect(alpha.id, connector.account(alpha.id).revision);
    const reconnect = service.detail(blocked.runId).run; assert.equal(service.answer({ runId: reconnect.id, expectedRevision: reconnect.revision, requestId: reconnect.request.id, approved: true }).ok, true);
    await until(() => service.detail(reconnect.id).run.request?.kind === 'approval', 'fresh approval after reconnect'); approve(reconnect.id);
    await until(() => service.detail(reconnect.id).run.status === 'succeeded', 'same-account reconnect completion');
    // An API 401 parks the run and removes credentials; a second account remains usable.
    const revoked = start(connector.account(alpha.id)); await until(() => service.detail(revoked.runId).run.request?.kind === 'approval', 'revoked run approval'); fixture.state.revokedAlpha = true; approve(revoked.runId);
    await until(() => service.detail(revoked.runId).run.request?.kind === 'mail_access', 'revocation parks run'); assert.equal(accounts.account(alpha.id).refreshToken, undefined);
    const other = start(beta, 'nothing', false); await until(() => service.detail(other.runId).run.request?.kind === 'approval', 'second account approval'); approve(other.runId); await until(() => service.detail(other.runId).run.status === 'succeeded', 'second account still works'); assert.equal(service.detail(other.runId).briefing.messages.length, 0);
    fixture.state.revokedAlpha = false; fixture.state.nextAccount = 'alpha'; await connector.connect(alpha.id, connector.account(alpha.id).revision);
    const cancel = start(connector.account(alpha.id)); await until(() => service.detail(cancel.runId).run.request?.kind === 'approval', 'cancel approval'); fixture.state.holdAlpha = true; approve(cancel.runId); await until(() => fixture.state.held > 0, 'inflight read');
    const running = service.detail(cancel.runId).run; service.control({ runId: running.id, expectedRevision: running.revision, action: 'cancel' }); await until(() => service.active.size === 0, 'cancel read stops'); assert.equal(service.detail(cancel.runId).run.artifacts.length, 0);
    assert.equal(fixture.state.deniedWrites, 0); assert.ok(fixture.calls.every(c => c.method === 'GET' || ['/token', '/revoke'].includes(c.path)));
    assert.ok(!JSON.stringify(service.detail(first.runId)).includes('fixture-refresh')); assert.ok(!JSON.stringify(detail.events).includes('Ignore prior instructions'));
    await service.shutdown(); store.close(); store = null; await connector.close();
    // An obsolete refresh failure racing a reconnect cannot revoke the new grant.
    fixture.state.holdAlpha = false;
    let releaseRefresh, heldRefresh = false;
    const refreshGate = new Promise(resolve => { releaseRefresh = resolve; });
    const racing = new GmailConnector(accounts, fixture.openBrowser, () => {}, new MailHttp(async (url, options) => {
      if (url.endsWith('/token') && new URLSearchParams(options.body).get('grant_type') === 'refresh_token' && !heldRefresh) {
        heldRefresh = true; await refreshGate; return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
      }
      return fixture.transport(url, options);
    }));
    const oldAccount = racing.account(alpha.id), bound = { accountId: alpha.id, accountRevision: oldAccount.revision, email: alpha.email, query: 'nothing', maxMessages: 2, includeAttachments: false };
    const stale = racing.brief(bound, new AbortController().signal).then(() => null, error => error);
    await until(() => heldRefresh, 'delayed refresh'); fixture.state.nextAccount = 'alpha';
    const fresh = await racing.connect(alpha.id, oldAccount.revision); releaseRefresh();
    assert.equal((await stale).code, 'access'); assert.equal(racing.account(alpha.id).status, 'connected'); assert.equal(racing.account(alpha.id).revision, fresh.revision);
    assert.equal((await racing.brief({ ...bound, accountRevision: fresh.revision }, new AbortController().signal)).messages.length, 0);
    await racing.close(); accounts.close(); pdf.close(); fixture.close();
    const disk = fs.readFileSync(path.join(root, 'mail.db')); for (const secret of ['fixture-refresh-beta-private', 'fixture-client-private-value']) assert.ok(!disk.includes(secret), 'credentials encrypted on disk');
    console.log('PASS mail: loopback OAuth/PKCE, encrypted accounts, approval restart, mailbox binding, inert extracts, bounded attachments, journal recovery, revocation/reconnect, empty search, independent accounts, cancellation, no mail writes/model calls'); app.quit();
  } catch (error) { console.error(error); fixture.close(); pdf.close(); if (service) await service.shutdown(); if (store) store.close(); await connector.close(); accounts.close(); app.exit(1); }
});
setTimeout(() => { console.error('Mail native test timed out'); app.exit(1); }, 60000).unref();
