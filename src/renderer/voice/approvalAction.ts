import type { ApprovalCard, SettingsSnapshot } from '../../shared/types';
import { routeVision } from '../../shared/vision';
import { jobsModel } from '../../shared/agent';

// The primary button names the action it approves (docs/design.md UX-20); the summary above it asks the question.
const verbs: Record<string, string> = {
  type_text: 'Paste text', write_clipboard: 'Copy to clipboard', read_clipboard: 'Read clipboard', read_screen: 'Look at screen',
  create_note: 'Create note', set_reminder: 'Set reminder', set_timer: 'Start timer', cancel_reminder: 'Cancel reminder',
  web_search: 'Search', show_me_how: 'Start guide', explain_on_whiteboard: 'Draw it', get_datetime: 'Check the time',
  list_reminders: 'Show reminders', do_task: 'Start',
};

export function approvalAction({ toolName, summary }: Pick<ApprovalCard, 'toolName' | 'summary'>): string {
  // 'Open "Spotify"?' and 'Open github.com?' already carry the name the user recognizes.
  const opened = toolName === 'open_app' ? /^Open "(.+)"\?$/.exec(summary) : toolName === 'open_url' ? /^Open (\S+)\?$/.exec(summary) : null;
  if (opened && opened[1].length <= 24) return `Open ${opened[1]}`;
  if (toolName === 'open_app') return opened ? 'Open app' : 'Find apps';
  if (toolName === 'open_url') return 'Open link';
  return verbs[toolName] ?? 'Allow';
}

// Sensitive approvals type, touch the clipboard, read the screen, or act inside an app (UX-21).
const sensitiveTools = new Set(['type_text', 'write_clipboard', 'read_clipboard', 'read_screen', 'show_me_how', 'do_task']);

/**
 * Low-risk approvals stay compact. Sensitive ones say, in one line, what leaves this PC and which model receives it,
 * worked out from the same settings and routing the main process uses.
 */
export function approvalRisk(card: Pick<ApprovalCard, 'toolName' | 'input'>, snapshot: SettingsSnapshot | null): { sensitive: boolean; flow?: string } {
  if (!sensitiveTools.has(card.toolName)) return { sensitive: false };
  const selected = snapshot?.settings.model;
  const main = snapshot && selected ? snapshot.models.find(m => m.provider === selected.provider && m.id === selected.id) : undefined;
  const mainName = main?.label ?? selected?.id ?? 'your model';
  let visionName = 'your vision model';
  if (snapshot && main) {
    try { visionName = routeVision(main, snapshot.settings.visionModel, snapshot.models, provider => !!snapshot.keys[provider]).label; }
    catch { /* No vision model is configured yet; the main process will say so if it's needed. */ }
  }
  // Tasks run on the jobs model, which may not be the model answering.
  const jobs = snapshot ? jobsModel(snapshot.settings, snapshot.models, provider => !!snapshot.keys[provider]) : undefined;
  const named = (card.input as { app?: unknown } | null)?.app;
  const app = typeof named === 'string' && named.trim() ? named.trim() : 'the app';
  const flows: Record<string, string> = {
    read_screen: `A screenshot of this display will be sent to ${visionName}.`,
    read_clipboard: `Up to 4,000 characters from your clipboard will be sent to ${mainName}.`,
    write_clipboard: 'Replaces what’s on your clipboard. Nothing leaves this PC.',
    type_text: 'Pastes into whichever app has focus. Nothing leaves this PC.',
    show_me_how: `Kite reads the controls in ${app} on this PC. If it can’t find one, it may send a screenshot of ${app} to ${visionName}.`,
    do_task: `Each step sends ${app}’s controls and their text to ${jobs?.label ?? mainName}${(jobs ?? main)?.supportsVision ? ', sometimes with a screenshot' : ''}.`,
  };
  return { sensitive: true, flow: flows[card.toolName] };
}
