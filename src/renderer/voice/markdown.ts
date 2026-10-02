/**
 * A tiny allowlist Markdown reader for answers (docs/design.md UX-17). It knows fenced code, headings,
 * bullet and numbered lists, bold, italics, inline code, and links; everything else stays text. Nothing here becomes HTML:
 * the bubble builds React elements from these blocks, and links are never followed (navigation is denied), only copied.
 */
export type Inline = { kind: 'text' | 'strong' | 'em' | 'code'; text: string } | { kind: 'link'; text: string; url: string };
export interface ListItem { depth: number; inline: Inline[] }
export type Block = { kind: 'code'; text: string } | { kind: 'heading'; inline: Inline[] }
  | { kind: 'list'; ordered: boolean; start: number; items: ListItem[] } | { kind: 'text'; inline: Inline[] };

const ITEM = /^(\s*)(?:[-*+•]|(\d{1,3})[.)])\s+(.*)$/, HEADING = /^#{1,6}\s+(.*)$/;
// Bold, inline code, [label](url), a bare URL, then italics with * or _ that don't sit inside a word (so snake_case stays).
const INLINE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s<>()]+|(?<![\w*])\*[^*\s](?:[^*\n]*[^*\s])?\*(?![\w*])|(?<![\w_])_[^_\s](?:[^_\n]*[^_\s])?_(?![\w_]))/;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const add = (part: Inline) => { const last = out.at(-1); if (part.kind === 'text' && last?.kind === 'text') last.text += part.text; else if (part.kind !== 'text' || part.text) out.push(part); };
  text.split(INLINE).forEach((part, i) => {
    if (i % 2 === 0) { add({ kind: 'text', text: part }); return; }
    const link = /^\[([^\]]+)\]\((.+)\)$/.exec(part);
    if (link) add({ kind: 'link', text: link[1], url: link[2] });
    else if (part.startsWith('http')) {
      // A sentence's closing punctuation isn't part of the address.
      const url = part.replace(/[.,;:!?'"]+$/, '');
      add({ kind: 'link', text: url, url }); add({ kind: 'text', text: part.slice(url.length) });
    } else if (part.startsWith('**') || part.startsWith('__')) add({ kind: 'strong', text: part.slice(2, -2) });
    else if (part.startsWith('`')) add({ kind: 'code', text: part.slice(1, -1) });
    else add({ kind: 'em', text: part.slice(1, -1) });
  });
  return out;
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of source.split(/(```[\s\S]*?(?:```|$))/)) {
    if (!chunk) continue;
    if (chunk.startsWith('```')) { blocks.push({ kind: 'code', text: chunk.replace(/^```[^\n]*\n?/, '').replace(/```$/, '') }); continue; }
    const lines = chunk.split('\n');
    let text: string[] = [], list: Extract<Block, { kind: 'list' }> | null = null, raw: string[] = [];
    const flush = () => {
      const joined = text.join('\n').replace(/^\n+|\n+$/g, '');
      if (joined) blocks.push({ kind: 'text', inline: parseInline(joined) });
      text = [];
    };
    const closeItem = () => { if (list && raw.length) list.items[list.items.length - 1].inline = parseInline(raw.join('\n')); raw = []; };
    lines.forEach((line, i) => {
      const item = ITEM.exec(line), heading = HEADING.exec(line);
      if (item) {
        closeItem(); flush();
        const ordered = item[2] !== undefined, depth = Math.min(2, Math.floor(item[1].replace(/\t/g, '  ').length / 2));
        // Nested items join the list above them; a new top-level kind of list starts a new one.
        if (!list || (depth === 0 && list.ordered !== ordered)) { list = { kind: 'list', ordered, start: ordered ? Number(item[2]) : 1, items: [] }; blocks.push(list); }
        list.items.push({ depth: list.items.length ? depth : 0, inline: [] }); raw = [item[3]];
      } else if (list && line.trim() && /^\s{2,}/.test(line)) raw.push(line.trim());
      else if (list && !line.trim()) {
        // A blank line inside a list only ends it if no item follows.
        const next = lines.slice(i + 1).find(l => l.trim());
        if (!next || !ITEM.test(next)) { closeItem(); list = null; }
      } else if (heading) { closeItem(); list = null; flush(); blocks.push({ kind: 'heading', inline: parseInline(heading[1]) }); }
      else { closeItem(); list = null; text.push(line); }
    });
    closeItem(); flush();
  }
  return blocks;
}
