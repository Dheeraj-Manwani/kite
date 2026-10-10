import type { PasteDestination, PasteTarget } from '../tools/impl/type_text';
import { UiaClient } from '../guide/uia';
import { focusScript } from './focusScript';

/** Remembers the window left for Kite; the native sidecar checks identity again before returning or pasting. */
export class InputFocus implements PasteDestination {
  private client: UiaClient;
  private previous: PasteTarget | null = null;
  constructor(directory: string, private excludePid: number) {
    this.client = new UiaClient({ directory, excludePid, script: focusScript, name: 'focus', toDip: rect => rect });
  }
  async remember() {
    try { const { target, kite } = await this.client.request<{ target: PasteTarget | null; kite: boolean }>({ op: 'foreground', excludePid: this.excludePid }, 3000); if (target || !kite) this.previous = target; }
    catch { this.previous = null; }
  }
  async capture(signal: AbortSignal) {
    signal.throwIfAborted();
    const { target, kite } = await this.client.request<{ target: PasteTarget | null; kite: boolean }>({ op: 'foreground', excludePid: this.excludePid }, 3000, signal);
    return target ?? (kite ? this.previous : null);
  }
  async restore() { return this.previous ? this.perform('restore', this.previous) : false; }
  paste(target: PasteTarget, signal: AbortSignal) { return this.perform('paste', target, signal); }
  private async perform(op: 'restore' | 'paste', target: PasteTarget, signal?: AbortSignal) {
    signal?.throwIfAborted();
    try { const result = await this.client.request<{ active: boolean }>({ op, ...target, excludePid: this.excludePid }, 3000, signal); return result.active; }
    catch { signal?.throwIfAborted(); return false; }
  }
  stop() { this.client.stop(); this.previous = null; }
}
