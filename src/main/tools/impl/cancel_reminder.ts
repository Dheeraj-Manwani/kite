import { defineTool } from '../define';
import { cancelInput } from '../schemas';
import type { ReminderStore } from '../types';
export function cancelReminder(store: ReminderStore) { return defineTool({ name: 'cancel_reminder', description: 'Cancel a scheduled reminder by its ID. List reminders first when needed.', kind: 'action', inputSchema: cancelInput,
  summarize: ({ id }) => `Cancel reminder #${id}?`, execute: async ({ id }, ctx) => { ctx.signal.throwIfAborted(); const ok = store.cancelReminder(id); return { ok, message: ok ? 'Reminder cancelled.' : 'That reminder is no longer pending.' }; } }); }
