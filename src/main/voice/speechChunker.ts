export function toSpeakable(text: string): string {
  return text.replace(/<details>[\s\S]*?(?:<\/details>|$)/gi, '')
    .replace(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1 (a link)')
    .replace(/https?:\/\/[^\s<>]+/g, 'a link')
    .replace(/^\s*(?:#{1,6}\s*|>\s*|[-*+]\s+|\d+[.)]\s+)/gm, '')
    .replace(/[*_`~]/g, '').replace(/&/g, ' and ').replace(/%/g, ' percent').replace(/\s+/g, ' ').trim();
}
/** Stateful across tokens: fenced code/details cannot leak when markers split across deltas. */
export class SpeechChunker {
  private raw = '';
  private pending = '';
  private hidden: '```' | '~~~' | '</details>' | null = null;
  constructor(private emit: (text: string) => void) {}
  push(delta: string) { this.raw += delta; this.consume(false); }
  finish() { this.consume(true); this.flush(); }
  private consume(final: boolean) {
    while (this.raw) {
      if (this.hidden) {
        const end = this.raw.indexOf(this.hidden);
        if (end < 0) { this.raw = final ? '' : this.raw.slice(-this.hidden.length + 1); return; }
        this.raw = this.raw.slice(end + this.hidden.length); this.hidden = null; continue;
      }
      const markers = ['```', '~~~', '<details>'];
      const marker = markers.find(m => this.raw.startsWith(m));
      if (marker) { this.hidden = marker === '<details>' ? '</details>' : marker as '```' | '~~~'; this.raw = this.raw.slice(marker.length); continue; }
      if (!final && markers.some(m => m.startsWith(this.raw))) return;
      this.pending += this.raw[0]; this.raw = this.raw.slice(1);
      const n = this.pending.length;
      const sentence = /[.!?]["')\]]?\s$/.test(this.pending);
      const clause = n >= 40 && /(?:[,;—–]|\s-)\s$/.test(this.pending);
      // Flush at a word boundary near 120 characters, never in the middle of a URL.
      if (sentence || clause || (n >= 120 && /\s$/.test(this.pending))) this.flush();
      else if (n >= 120 && !/https?:\/\/\S*$/.test(this.pending)) this.flush();
    }
  }
  private flush() { const text = toSpeakable(this.pending); this.pending = ''; if (text) this.emit(text + ' '); }
}
