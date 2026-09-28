import { defineTool } from '../define';
import { emptyInput } from '../schemas';
export const getDatetime = defineTool({ name: 'get_datetime', description: 'Get the local date, time, timezone, and ISO timestamp.', kind: 'info', inputSchema: emptyInput,
  summarize: () => 'Check the current local date and time.', execute: async () => ({ ok: true, message: 'Current local time.', data: { local: new Date().toLocaleString(), iso: new Date().toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } }) });
