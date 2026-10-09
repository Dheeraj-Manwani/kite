import { expect, it } from 'vitest';
import { firstOccurrence, dueOccurrence, resultFingerprint } from '../src/main/background/scheduling';
import { scheduleDraftSchema, scheduleControlSchema } from '../src/shared/schedules';
import { CareerDiscovery } from '../src/main/background/career/discovery';
import { careerOptionsSchema } from '../src/shared/career';
import type { DelegationBudget } from '../src/shared/schedules';
import type { CareerShortlist } from '../src/shared/career';
import type { MailMessage, InboxBriefing } from '../src/shared/mail';
const at = (s: string) => Date.parse(s);
const daily = { kind: 'daily' as const, time: '09:00', timeZone: 'Asia/Kolkata' };
const options = careerOptionsSchema.parse({ boards: ['one','two','three','four'].map(board => ({ provider: 'greenhouse', board })), keywords: '', maxJobs: 4 });
const budget = (concurrency = 2): DelegationBudget => ({ maxChildren: 4, concurrency, maxBytes: 32 * 1024 * 1024, bytes: 0, deadline: Date.now() + 120_000, modelCalls: 0, children: [] });
it('validates recurrence, explicit consent, IDs, and rejects private authority injection', () => {
  const draft = { requestId: '49bb3c28-fc8f-4545-a34c-e19db07118de', agentId: '49bb3c28-fc8f-4545-a34c-e19db07118de', agentRevision: 1, recurrence: daily, consent: true };
  expect(scheduleDraftSchema.safeParse(draft).success).toBe(true);
  expect(scheduleControlSchema.safeParse({ id: draft.requestId, revision: 1, action: 'resume' }).success).toBe(false);
  for (const patch of [{ consent: false }, { policyHash: 'injected' }, { recurrence: { kind: 'interval', minutes: 1 } }, { recurrence: { ...daily, timeZone: 'Fake/Zone' } }]) expect(scheduleDraftSchema.safeParse({ ...draft, ...patch }).success).toBe(false);
});
it('coalesces interval and daily occurrences, retains UTC identity, and waits on backward clock changes', () => {
  const rule = { kind: 'interval' as const, minutes: 15 }, start = at('2026-10-09T00:00:00Z');
  expect(firstOccurrence(rule, start)).toBe(start + 900000);
  expect(dueOccurrence(rule, start, start + 10 * 900000 + 1)).toEqual({ at: start + 10 * 900000, nextAt: start + 11 * 900000 });
  expect(dueOccurrence(rule, start, start - 1)).toBeNull();
  expect(firstOccurrence(daily, at('2026-10-09T02:00:00Z'))).toBe(at('2026-10-09T03:30:00Z'));
  expect(dueOccurrence(daily, at('2026-10-01T03:30:00Z'), at('2026-10-09T05:00:00Z'))).toEqual({ at: at('2026-10-09T03:30:00Z'), nextAt: at('2026-10-10T03:30:00Z') });
});
it('skips nonexistent DST minutes and dispatches a repeated civil minute only once', () => {
  const spring = { kind: 'daily' as const, time: '02:30', timeZone: 'America/New_York' };
  expect(firstOccurrence(spring, at('2026-03-07T08:00:00Z'))).toBe(at('2026-03-09T06:30:00Z'));
  const autumn = { ...spring, time: '01:30' };
  expect(firstOccurrence(autumn, at('2026-11-01T04:00:00Z'))).toBe(at('2026-11-01T05:30:00Z'));
  expect(firstOccurrence(autumn, at('2026-11-01T05:30:00Z'))).toBe(at('2026-11-02T06:30:00Z'));
  expect(dueOccurrence(autumn, at('2026-11-01T05:30:00Z'), at('2026-11-01T06:40:00Z'))?.at).toBe(at('2026-11-01T05:30:00Z'));
});
it('fingerprints content and limits while ignoring fetch time and API ordering', () => {
  const message = (id: string): MailMessage => ({ id, threadId: id, subject: 'Mail', sender: 'sender', receivedAt: 123, excerpt: 'Hello', attachments: [] });
  const briefing: InboxBriefing = { accountId: 'account', email: 'account@kite.test', query: 'in:inbox', fetchedAt: 10, messages: [message('b'),message('a')], moreMatches: false, missingMessages: 0, selectedAttachments: [], skippedAttachments: 0 };
  expect(resultFingerprint(briefing)).toBe(resultFingerprint({ ...briefing, fetchedAt: 30, messages: [...briefing.messages].reverse() }));
  expect(resultFingerprint(briefing)).not.toBe(resultFingerprint({ ...briefing, moreMatches: true }));
  const shortlist: CareerShortlist = { fetchedAt: 1, jobs: [], scanned: 4, truncated: false, criteria: options };
  expect(resultFingerprint(shortlist)).toBe(resultFingerprint({ ...shortlist, fetchedAt: 999 }));
  expect(resultFingerprint(shortlist)).not.toBe(resultFingerprint({ ...shortlist, scanned: 5 }));
});
it('bounds parallel reads, merges in approved order, and measures improvement against serial discovery', async () => {
  let active = 0, maximum = 0;
  const discovery = new CareerDiscovery(async url => {
    active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 80)); active--;
    return new Response(JSON.stringify({ jobs: [{ id: 1, title: String(url).split('/')[5], content: 'Fixture' }] }));
  });
  const start = performance.now(); const serial = await discovery.discover(options, new AbortController().signal, { budget: budget(1), check() { /* This fixture has no mutable permissions. */ }, progress() { /* The fixture has no persistent run store. */ } }); const serialMs = performance.now() - start;
  maximum = 0; const parallelStart = performance.now(); let latest = budget();
  const parallel = await discovery.discover(options, new AbortController().signal, { budget: budget(), check() { /* This fixture has no mutable permissions. */ }, progress(value) { latest = value; } }); const parallelMs = performance.now() - parallelStart;
  expect(parallel.jobs).toEqual(serial.jobs); expect(maximum).toBe(2); expect(latest.children).toHaveLength(4); expect(latest.children.every(c => c.status === 'succeeded')).toBe(true); expect(latest.bytes).toBe(latest.children.reduce((n,c) => n + c.bytes, 0)); expect(parallelMs).toBeLessThan(serialMs * 0.85);
  console.log(`Discovery fixture: serial ${Math.round(serialMs)} ms, bounded parallel ${Math.round(parallelMs)} ms`);
});
it('enforces aggregate bytes, child attempts across recovery, and deadlines before any new request', async () => {
  let reads = 0; const discovery = new CareerDiscovery(async () => { reads++; return new Response(JSON.stringify({ jobs: [] })); });
  const run = (b: DelegationBudget) => discovery.discover(options, new AbortController().signal, { budget: b, check() { /* This fixture has no mutable permissions. */ }, progress() { /* The fixture has no persistent run store. */ } });
  await expect(run({ ...budget(), maxBytes: 25 })).rejects.toThrow('shared discovery byte budget');
  reads = 0;
  await expect(run({ ...budget(), children: [{ id: 'old', name: 'old', status: 'running', bytes: 0 }] })).rejects.toThrow('shared discovery budget'); expect(reads).toBe(0);
  await expect(run({ ...budget(), deadline: Date.now() - 1 })).rejects.toThrow('shared discovery budget'); expect(reads).toBe(0);
});
it('cancels siblings and joins them before returning a failed parent', async () => {
  let stopped = false;
  const discovery = new CareerDiscovery(async (url, init) => {
    if (String(url).includes('/one/')) { await new Promise(r => setTimeout(r, 20)); return new Response('bad', { status: 500 }); }
    return new Promise((_resolve, reject) => { init.signal.addEventListener('abort', () => { stopped = true; reject(init.signal.reason); }, { once: true }); });
  });
  await expect(discovery.discover(options, new AbortController().signal)).rejects.toThrow('unavailable'); expect(stopped).toBe(true);
});
