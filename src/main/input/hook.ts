import { uIOhook, UiohookKey } from 'uiohook-napi';
import { initialPtt, stepPtt, PttAction } from './pttMachine';
import { settingsConfig } from '../settings/config';

export function startPttHook(onAction: (action: PttAction | 'escape') => void) {
  let state = initialPtt();
  const physical = new Map<number, string>();
  const logical = (code: number) => {
    if (code === UiohookKey.Ctrl || code === UiohookKey.CtrlRight) return 'Control';
    if (code === UiohookKey.Meta || code === UiohookKey.MetaRight) return 'Meta';
    return String(code);
  };
  const handle = (code: number, down: boolean) => {
    const key = logical(code);
    if (down) {
      if (physical.has(code)) return;
      const alreadyDown = [...physical.values()].includes(key);
      physical.set(code, key);
      if (alreadyDown) return;
    } else {
      if (!physical.delete(code) || [...physical.values()].includes(key)) return;
    }
    const result = stepPtt(state, { key, down, now: performance.now() }, settingsConfig.pushToTalk, settingsConfig.minHoldMs);
    state = result.state;
    if (down && code === UiohookKey.Escape) onAction('escape');
    else if (result.action) onAction(result.action);
  };
  const keydown = ({ keycode }: { keycode: number }) => handle(keycode, true);
  const keyup = ({ keycode }: { keycode: number }) => handle(keycode, false);
  uIOhook.on('keydown', keydown); uIOhook.on('keyup', keyup);
  try { uIOhook.start(); } catch (error) {
    uIOhook.removeListener('keydown', keydown); uIOhook.removeListener('keyup', keyup); throw error;
  }
  return () => {
    uIOhook.removeListener('keydown', keydown); uIOhook.removeListener('keyup', keyup);
    uIOhook.stop(); physical.clear(); state = initialPtt();
  };
}
