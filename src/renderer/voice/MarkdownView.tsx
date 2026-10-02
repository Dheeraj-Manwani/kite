import { useState } from 'react';
import { parseMarkdown, type Inline } from './markdown';
import { displayText } from './reveal';

const host = (url: string) => { try { const u = new URL(url); return u.hostname.replace(/^www\./, '') + (u.pathname.length > 1 ? '/…' : ''); } catch { return url; } };
/** A link is a chip that copies its address: Kite never navigates from an answer (UX-17). */
function LinkChip({ text, url }: { text: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return <>{text !== url && `${text} `}<button type="button" className="link-chip" title={url} aria-label={`Copy link: ${url}`}
    onClick={() => { void window.kite.copyText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? 'Copied' : host(url)}</button></>;
}
function Inlines({ parts }: { parts: Inline[] }) {
  return <>{parts.map((p, i) => p.kind === 'strong' ? <strong key={i}>{p.text}</strong> : p.kind === 'em' ? <em key={i}>{p.text}</em>
    : p.kind === 'code' ? <code key={i}>{p.text}</code> : p.kind === 'link' ? <LinkChip key={i} text={p.text} url={p.url} /> : p.text)}</>;
}
/** An answer's Markdown as React elements: code, headings as bold lines, lists, and inline marks (UX-17). */
export function MarkdownView({ text }: { text: string }) {
  return <>{parseMarkdown(displayText(text)).map((block, i) => {
    if (block.kind === 'code') return <pre key={i}><code>{block.text}</code></pre>;
    if (block.kind === 'heading') return <strong key={i} className="md-heading"><Inlines parts={block.inline} /></strong>;
    if (block.kind === 'text') return <span key={i}><Inlines parts={block.inline} /></span>;
    const items = block.items.map((item, j) => <li key={j} className={item.depth ? `md-depth-${item.depth}` : undefined}><Inlines parts={item.inline} /></li>);
    return block.ordered ? <ol key={i} start={block.start !== 1 ? block.start : undefined}>{items}</ol> : <ul key={i}>{items}</ul>;
  })}</>;
}
