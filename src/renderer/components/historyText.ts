import type { ToolAudit } from '../../shared/types';

/** "Today", "Yesterday", a weekday within the last week, then a date (docs/ui-ux-improvements.md UX-71). */
export function dayLabel(time: number, now = Date.now()): string {
  const midnight = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const days = Math.round((midnight(now) - midnight(time)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days > 1 && days < 7) return new Date(time).toLocaleDateString(undefined, { weekday: 'long' });
  const sameYear = new Date(time).getFullYear() === new Date(now).getFullYear();
  return new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** A duration a person reads at a glance: "120 ms", "1.4 s". */
export const duration = (ms: number) => ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;

// Mark types as the user did them, not as the code names them (UX-72).
const markNames: Record<string, string> = { enclosure: 'Circled', underline: 'Underlined', arrow: 'Pointed at', tap: 'Tapped' };
export function markLabel(annotationJson: string | null): string | null {
  if (!annotationJson) return null;
  try {
    const kinds = [...new Set((JSON.parse(annotationJson) as { marks: { markType: string }[] }).marks.map(mark => mark.markType))];
    return kinds.map(kind => markNames[kind] ?? 'Marked').join(', ') || 'Looked at your screen';
  } catch { return 'Looked at your screen'; }
}

// Each tool as [what Kite did, what Kite would have done], so declined steps don't read as if they happened.
const tools: Record<string, [string, string]> = {
  open_app: ['Opened an app', 'open an app'], open_url: ['Opened a link', 'open a link'], web_search: ['Searched the web', 'search the web'],
  type_text: ['Pasted text', 'paste text'], write_clipboard: ['Copied to your clipboard', 'copy to your clipboard'], read_clipboard: ['Read your clipboard', 'read your clipboard'],
  read_screen: ['Looked at your screen', 'look at your screen'], create_note: ['Saved a note', 'save a note'], set_reminder: ['Set a reminder', 'set a reminder'],
  set_timer: ['Started a timer', 'start a timer'], cancel_reminder: ['Cancelled a reminder', 'cancel a reminder'], list_reminders: ['Checked your reminders', 'check your reminders'],
  get_datetime: ['Checked the time', 'check the time'], show_me_how: ['Started a guide', 'start a guide'], explain_on_whiteboard: ['Drew on the whiteboard', 'draw on the whiteboard'],
  do_task: ['Did a task', 'do a task'],
};
/** A tool call as a past-tense sentence, then who decided: "Saved a note · you approved" (UX-72). */
export function toolLine({ tool, decision, error }: Pick<ToolAudit, 'tool' | 'decision' | 'error'>): string {
  const [did, doIt] = tools[tool] ?? [`Used ${tool.replaceAll('_', ' ')}`, `use ${tool.replaceAll('_', ' ')}`];
  if (decision === 'denied') return `Didn’t ${doIt} · you declined`;
  if (decision === 'timeout') return `Didn’t ${doIt} · no answer in time`;
  if (error) return `Tried to ${doIt} · it didn’t work`;
  return `${did} · ${decision === 'approved' ? 'you approved' : 'no approval needed'}`;
}

/** Split an FTS snippet into plain text and matched words, for rendering matches without any HTML. */
export function snippetParts(snippet: string): { text: string; match: boolean }[] {
  return snippet.split('\u0002').flatMap((part, i) => {
    if (i === 0) return part ? [{ text: part, match: false }] : [];
    const [matched, rest = ''] = part.split('\u0003');
    return [{ text: matched, match: true }, ...(rest ? [{ text: rest, match: false }] : [])];
  });
}
