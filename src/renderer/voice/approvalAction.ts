import type { ApprovalCard } from '../../shared/types';

// The primary button names the action it approves (docs/ui-ux-improvements.md UX-20); the summary above it asks the question.
const verbs: Record<string, string> = {
  type_text: 'Paste text', write_clipboard: 'Copy to clipboard', read_clipboard: 'Read clipboard', read_screen: 'Look at screen',
  create_note: 'Create note', set_reminder: 'Set reminder', set_timer: 'Start timer', cancel_reminder: 'Cancel reminder',
  web_search: 'Search', show_me_how: 'Start guide', explain_on_whiteboard: 'Draw it', get_datetime: 'Check the time',
  list_reminders: 'Show reminders', do_task: 'Allow this task',
};

export function approvalAction({ toolName, summary }: Pick<ApprovalCard, 'toolName' | 'summary'>): string {
  // 'Open "Spotify"?' and 'Open github.com?' already carry the name the user recognizes.
  const opened = toolName === 'open_app' ? /^Open "(.+)"\?$/.exec(summary) : toolName === 'open_url' ? /^Open (\S+)\?$/.exec(summary) : null;
  if (opened && opened[1].length <= 24) return `Open ${opened[1]}`;
  if (toolName === 'open_app') return opened ? 'Open app' : 'Find apps';
  if (toolName === 'open_url') return 'Open link';
  return verbs[toolName] ?? 'Allow';
}
