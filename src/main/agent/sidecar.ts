import { SidecarError, UiaClient, type Box, type UiaOptions } from '../guide/uia';
import type { AgentElement, AgentSnapshot, AgentWindow } from '../../shared/agent';
import { actScript } from './actScript';
type RawWindow = Omit<AgentWindow, 'rect'> & { rect: Box; minimized?: boolean };
type RawSnapshot = Omit<AgentSnapshot, 'window' | 'elements'> & { window: RawWindow; elements: (Omit<AgentElement, 'rect'> & { rect: Box })[] };
/** Keyboard input for the task's window: Unicode text, or a virtual key with Ctrl/Shift/Alt, repeated. */
export type KeyItem = { text: string } | { vk: number; mods: number[]; times?: number };
export interface ActResult { ok: boolean; code?: string; via?: string; pending?: boolean; typed?: number; active?: boolean }
export interface Target { hwnd: number; pid: number }
const aborted = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';
/** The task agent's sidecar (see actScript): started for an approved task, idled out afterwards. */
export class ActClient {
  private uia: UiaClient;
  constructor(private options: Omit<UiaOptions, 'script' | 'name'>) {
    this.uia = new UiaClient({ ...options, script: actScript, name: 'act' });
  }
  get supported() { return this.uia.supported; }
  async windows(signal?: AbortSignal): Promise<AgentWindow[]> {
    const raw = await this.uia.request<{ windows: RawWindow[] }>({ op: 'windows', excludePid: this.options.excludePid }, 8000, signal);
    return raw.windows.filter(w => !w.minimized || w.foreground).map(w => ({ ...w, rect: this.uia.dip(w.rect) }));
  }
  /** Controls of the target app's front window and its popups. Rejects with a SidecarError code (ENOWINDOW, EOTHERAPP, EKITE…). */
  async snapshot(target: Target, signal?: AbortSignal): Promise<AgentSnapshot> {
    const raw = await this.uia.request<RawSnapshot>({ op: 'snapshot', hwnd: target.hwnd, pid: target.pid, excludePid: this.options.excludePid, limit: 400 }, 12000, signal);
    return { seq: raw.seq, layers: raw.layers, window: { ...raw.window, rect: this.uia.dip(raw.window.rect) },
      elements: raw.elements.map(e => ({ ...e, name: e.name ?? '', automationId: e.automationId ?? '', help: e.help ?? '', patterns: e.patterns ?? [], rect: this.uia.dip(e.rect) })) };
  }
  private async result(payload: Record<string, unknown>, timeoutMs: number, signal?: AbortSignal): Promise<ActResult> {
    try {
      const reply = await this.uia.request<Omit<ActResult, 'ok'>>(payload, timeoutMs, signal), result: ActResult = { ok: true };
      for (const key of ['via', 'pending', 'typed', 'active'] as const) if (reply[key] !== undefined) (result as unknown as Record<string, unknown>)[key] = reply[key];
      return result;
    }
    catch (error) { if (aborted(error)) throw error; return { ok: false, code: error instanceof SidecarError ? error.code : 'EUIA' }; }
  }
  act(seq: number, ref: number, action: 'click' | 'focus' | 'set' | 'scroll' | 'selectall', extra: { text?: string; direction?: string } = {}, signal?: AbortSignal) {
    return this.result({ op: 'act', seq, ref, action, ...extra }, 8000, signal);
  }
  keys(target: Target, seq: number, focus: number, items: KeyItem[], signal?: AbortSignal) {
    const chars = items.reduce((n, item) => n + ('text' in item ? item.text.length : 1), 0);
    return this.result({ op: 'keys', hwnd: target.hwnd, pid: target.pid, seq, focus, items }, 8000 + chars * 20, signal);
  }
  async activate(target: Target, signal?: AbortSignal) {
    const result = await this.result({ op: 'activate', hwnd: target.hwnd, pid: target.pid }, 6000, signal);
    return result.ok && !!result.active;
  }
  stop() { this.uia.stop(); }
}
