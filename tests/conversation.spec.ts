import { beforeEach, expect, it, vi } from 'vitest';
import { Conversation } from '../src/main/ai/conversation';
import type { HistoryMessage, HistoryDetail } from '../src/shared/release';

const fixture = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => unknown>(), send: vi.fn(), focus: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle: (name: string, handler: (...args: unknown[]) => unknown) => fixture.handlers.set(name, handler) } }));
vi.mock('../src/main/window/overlay', () => ({ getOverlayWindow: () => ({ webContents: { send: fixture.send } }), focusOverlayControls: fixture.focus }));
vi.mock('../src/main/ipc/trust', () => ({ trusted: (event: { surface?: string }, target: string) => event.surface === target }));
import { registerConversationIPC } from '../src/main/ipc/conversation';

beforeEach(() => { fixture.handlers.clear(); fixture.send.mockClear(); fixture.focus.mockClear(); });
const call = (name: string, surface: string, value?: unknown) => fixture.handlers.get(name)?.({ surface }, value);
const message = (role: string, content: string, id: number): HistoryMessage => ({ id, role, content, provider: 'moonshot', model: 'test', created_at: 1, total_ms: 1, first_token_ms: 1, voice_to_voice_ms: null, annotation_json: null });
function setup(settle: () => Promise<void> = async () => undefined) {
  const conversation = new Conversation(() => 'fresh', 10, Infinity);
  const controller = { cancel: vi.fn(), submitText: vi.fn(), canSubmitText: vi.fn(() => true) };
  const history = { detail: (id: string): HistoryDetail => ({ messages: id === 'saved' ? [ { ...message('user', 'What is this chart?', 1), attachments: 1 }, message('assistant', 'It shows growth.', 2) ] : [], tools: [] }) };
  const state = registerConversationIPC({ conversation, controller, history, settle } as unknown as Parameters<typeof registerConversationIPC>[0]);
  return { conversation, controller, state };
}
it('only the overlay can submit valid text; an active request or approval is preserved', () => {
  const { controller } = setup();
  expect(call('conversation:submit', 'settings', 'Hello')).toMatchObject({ ok: false });
  for (const input of ['', '   ', 'x'.repeat(8001), null]) expect(call('conversation:submit', 'overlay', input)).toMatchObject({ ok: false });
  controller.canSubmitText.mockReturnValue(false); expect(call('conversation:submit', 'overlay', 'Follow up')).toMatchObject({ ok: false });
  expect(controller.submitText).not.toHaveBeenCalled(); expect(controller.cancel).not.toHaveBeenCalled();
  controller.canSubmitText.mockReturnValue(true); expect(call('conversation:submit', 'overlay', '  Follow up  ')).toMatchObject({ ok: true });
  expect(controller.submitText).toHaveBeenCalledWith('Follow up');
});
it('History continuation keeps identity and text, without replaying old actions or attaching old screenshot pixels', async () => {
  const { conversation, controller } = setup();
  expect(await call('conversation:continue', 'overlay', 'saved')).toMatchObject({ ok: false });
  expect(await call('conversation:continue', 'settings', 'missing')).toMatchObject({ ok: false });
  expect(controller.cancel).not.toHaveBeenCalled();
  expect(await call('conversation:continue', 'settings', 'saved')).toMatchObject({ ok: true });
  expect(conversation.begin(3_600_000).id).toBe('saved');
  expect(conversation.context()[0].content).toContain('Its pixels are not attached');
  expect(conversation.context()[1].content).toBe('It shows growth.');
  expect(fixture.send).toHaveBeenCalledWith('conversation:open', expect.objectContaining({ id: 'saved', reason: 'resume' }));
  expect(controller.submitText).not.toHaveBeenCalled(); expect(fixture.focus).toHaveBeenCalledOnce();
});
it('New conversation resets deliberately and rejects sends while the old tools are settling', async () => {
  let finish!: () => void;
  const { conversation, controller, state } = setup(() => new Promise<void>(resolve => { finish = resolve; }));
  conversation.restore('saved', [{ role: 'user', content: 'Earlier question' }], 1);
  const opening = call('conversation:new', 'overlay'); expect(state.isSwitching()).toBe(true);
  expect(call('conversation:submit', 'overlay', 'Too soon')).toMatchObject({ ok: false });
  expect(await call('conversation:new', 'overlay')).toMatchObject({ ok: false });
  finish(); expect(await opening).toMatchObject({ ok: true });
  expect(state.isSwitching()).toBe(false); expect(conversation.context()).toEqual([]);
  expect(conversation.begin(3_600_000).id).toBe('fresh'); expect(controller.cancel).toHaveBeenCalledOnce();
  expect(fixture.send).toHaveBeenCalledWith('conversation:open', { id: 'fresh', messages: [], reason: 'new' });
});
