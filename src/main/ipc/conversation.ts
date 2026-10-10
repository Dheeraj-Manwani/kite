import { ipcMain } from 'electron';
import type { OperationResult } from '../../shared/types';
import type { OpenConversation } from '../../shared/release';
import type { VoiceController } from '../voice/controller';
import type { Conversation } from '../ai/conversation';
import type { openDatabase } from '../storage/database';
import { getOverlayWindow, focusOverlayControls } from '../window/overlay';
import { trusted } from './trust';

export function publishConversation(snapshot: OpenConversation) { getOverlayWindow()?.webContents.send('conversation:open', snapshot); }

export function registerConversationIPC(deps: { controller: VoiceController; conversation: Conversation; history: ReturnType<typeof openDatabase>; settle(): Promise<void> }) {
  let switching = false;
  ipcMain.handle('conversation:submit', (event, text: unknown): OperationResult => {
    if (!trusted(event, 'overlay') || typeof text !== 'string' || !text.trim() || text.length > 8000) return { ok: false, error: 'Write a question of up to 8,000 characters.' };
    if (switching || !deps.controller.canSubmitText()) return { ok: false, error: 'Wait for the current request or answer its permission card first.' };
    void deps.controller.submitText(text.trim()); return { ok: true };
  });
  const open = async (id: string | null): Promise<OperationResult> => {
    if (switching) return { ok: false, error: 'A conversation is already opening.' };
    if (id !== null && !deps.history.detail(id).messages.length) return { ok: false, error: 'That conversation is no longer in History.' };
    switching = true;
    try {
      deps.controller.cancel(); await deps.settle();
      const messages = id === null ? [] : deps.history.detail(id).messages;
      if (id === null) deps.conversation.reset();
      else deps.conversation.restore(id, messages.map(message => message.role === 'user'
        ? { role: 'user' as const, content: message.content + (message.attachments ? '\n[An earlier screenshot was shared. Its pixels are not attached to this follow-up.]' : '') }
        : { role: 'assistant' as const, content: message.content }), Date.now());
      const session = deps.conversation.begin(Date.now());
      publishConversation({ id: session.id, messages, reason: id === null ? 'new' : 'resume' });
      focusOverlayControls(); return { ok: true };
    } finally { switching = false; }
  };
  ipcMain.handle('conversation:new', event => trusted(event, 'overlay') ? open(null) : { ok: false });
  ipcMain.handle('conversation:continue', (event, id: unknown) => trusted(event, 'settings') && typeof id === 'string' && id.length > 0 && id.length <= 100 ? open(id) : { ok: false });
  return { isSwitching: () => switching };
}
