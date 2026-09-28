import { defineTool } from '../define';
import { emptyInput } from '../schemas';
import type { ReminderStore } from '../types';
export function listReminders(store: ReminderStore) { return defineTool({ name: 'list_reminders', description: 'List scheduled reminders, including their IDs.', kind: 'info', inputSchema: emptyInput,
  summarize: () => 'List your scheduled reminders.', execute: async () => ({ ok: true, message: 'Scheduled reminders.', data: store.listReminders() }) }); }
