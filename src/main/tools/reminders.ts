import type { Reminder } from '../../shared/types';
import type { ReminderStore } from './types';
export class ReminderScheduler {
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  constructor(private store: ReminderStore, private fire: (reminder: Reminder) => void, private paused = () => false) {}
  refresh() {
    clearTimeout(this.timer); if (this.stopped) return;
    if (this.paused()) { this.timer = setTimeout(() => this.refresh(), 60000); return; }
    const reminders = this.store.listReminders().sort((a, b) => a.at - b.at);
    const now = Date.now();
    for (const reminder of reminders.filter(r => r.at <= now)) if (this.store.claimReminder(reminder.id)) this.fire(reminder);
    const next = this.store.listReminders().sort((a, b) => a.at - b.at)[0];
    if (next) this.timer = setTimeout(() => this.refresh(), Math.min(60000, Math.max(10, next.at - Date.now())));
  }
  stop() { this.stopped = true; clearTimeout(this.timer); }
}
