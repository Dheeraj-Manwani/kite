import { defineTool } from '../define';
import { reminderInput } from '../schemas';
import type { ReminderStore } from '../types';
export function setReminder(store: ReminderStore) { return defineTool({ name: 'set_reminder', description: 'Save a persistent reminder for a future ISO datetime with an explicit timezone offset. Use get_datetime to resolve relative dates.', kind: 'action', inputSchema: reminderInput,
  summarize: ({ at, label }) => `Remind you at ${at}: "${label}"?`, execute: async ({ at, label }, ctx) => { ctx.signal.throwIfAborted(); return { ok: true, message: 'Reminder saved.', data: { id: store.addReminder(Date.parse(at), label), at, label } }; } }); }
