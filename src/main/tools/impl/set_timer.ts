import { defineTool } from '../define';
import { timerInput } from '../schemas';
import type { ReminderStore } from '../types';
export function setTimer(store: ReminderStore) { return defineTool({ name: 'set_timer', description: 'Schedule a persistent timer with a label, in minutes from now.', kind: 'action', inputSchema: timerInput,
  summarize: ({ minutes, label }) => `Set a ${minutes}-minute timer: "${label}"?`, execute: async ({ minutes, label }, ctx) => { ctx.signal.throwIfAborted(); const at = Date.now() + minutes * 60000; return { ok: true, message: 'Timer saved.', data: { id: store.addReminder(at, label), at, label } }; } }); }
