import type { Recurrence } from '../../shared/schedules';
import type { InboxBriefing } from '../../shared/mail';
import type { CareerShortlist } from '../../shared/career';
import { hashOf } from './artifacts';

const minute = 60_000;
function localParts(at: number, formatter: Intl.DateTimeFormat) {
  const parts = formatter.formatToParts(at);
  const value = (type: string) => parts.find(p => p.type === type)?.value;
  return { date: `${value('year')}-${value('month')}-${value('day')}`, time: `${value('hour')}:${value('minute')}` };
}
// A civil date has at most one occurrence. Missing DST times are skipped; repeated times use the first.
function daily(rule: Extract<Recurrence, { kind: 'daily' }>, from: number, direction: 1 | -1): number {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: rule.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const start = Math.floor(from / minute) * minute;
  for (let i = direction === 1 ? 1 : 0; i <= 3 * 24 * 60; i++) {
    const at = start + i * minute * direction;
    const here = localParts(at, formatter);
    if (here.time !== rule.time) continue;
    let first = at;
    // Offset transitions can repeat an hour (or longer). Select the earliest matching minute of this date.
    for (let back = 1; back <= 180; back++) {
      const prior = at - back * minute, part = localParts(prior, formatter);
      if (part.date === here.date && part.time === rule.time) first = prior;
    }
    if (direction === 1 && first <= from) continue;
    return first;
  }
  throw new Error('No daily occurrence found in this time zone.');
}
export function firstOccurrence(rule: Recurrence, now: number): number {
  return rule.kind === 'interval' ? now + rule.minutes * minute : daily(rule, now, 1);
}
export function dueOccurrence(rule: Recurrence, nextAt: number, now: number): { at: number; nextAt: number } | null {
  if (now < nextAt) return null;
  const at = rule.kind === 'interval' ? nextAt + Math.floor((now - nextAt) / (rule.minutes * minute)) * rule.minutes * minute : daily(rule, now, -1);
  return { at, nextAt: rule.kind === 'interval' ? at + rule.minutes * minute : daily(rule, at, 1) };
}
// Fetch timestamps and API ordering do not make a recurring result new.
export function resultFingerprint(value: InboxBriefing | CareerShortlist): string {
  if ('jobs' in value) return hashOf(JSON.stringify({ criteria: value.criteria, scanned: value.scanned, truncated: value.truncated, jobs: [...value.jobs].sort((a, b) => a.key.localeCompare(b.key)) }));
  return hashOf(JSON.stringify({ accountId: value.accountId, email: value.email, query: value.query, moreMatches: value.moreMatches, missingMessages: value.missingMessages, skippedAttachments: value.skippedAttachments,
    messages: [...value.messages].sort((a, b) => a.id.localeCompare(b.id)).map(m => ({ ...m, attachments: [...m.attachments].sort((a,b) => a.partId.localeCompare(b.partId)) })),
    selectedAttachments: [...value.selectedAttachments].sort((a,b) => `${a.messageId}:${a.partId}`.localeCompare(`${b.messageId}:${b.partId}`)),
  }));
}
