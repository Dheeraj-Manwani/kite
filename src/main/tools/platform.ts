import { app, clipboard, shell } from 'electron';
import { uIOhook, UiohookKey } from 'uiohook-napi';
import type { AppSettings } from '../../shared/types';
import type { ReminderStore } from './types';
import type { AppIndex } from './appIndex';
import { getDatetime } from './impl/get_datetime';
import { openApp } from './impl/open_app';
import { openUrl } from './impl/open_url';
import { webSearch } from './impl/web_search';
import { typeText } from './impl/type_text';
import { readClipboard } from './impl/read_clipboard';
import { writeClipboard } from './impl/write_clipboard';
import { setTimer } from './impl/set_timer';
import { setReminder } from './impl/set_reminder';
import { listReminders } from './impl/list_reminders';
import { cancelReminder } from './impl/cancel_reminder';
import { createNote } from './impl/create_note';
import { electronClipboard } from './electronClipboard';
export function createTools(apps: AppIndex, store: ReminderStore, settings: AppSettings) {
  return [getDatetime, openApp(apps.snapshot(), value => shell.openPath(value)), openUrl(value => shell.openExternal(value)),
    webSearch(settings.searchEngine, value => shell.openExternal(value)), typeText(electronClipboard, () => uIOhook.keyTap(UiohookKey.V, [UiohookKey.Ctrl])),
    readClipboard(() => clipboard.readText()), writeClipboard(text => clipboard.writeText(text)), setTimer(store), setReminder(store), listReminders(store), cancelReminder(store),
    createNote(app.getPath('documents'), value => shell.openPath(value))];
}
