import { useEffect, useState } from 'react';
import type { ConversationSummary, HistoryDetail, HistoryMessage } from '../../shared/release';
import type { ToolAudit } from '../../shared/types';
import { SailMark } from '../kite/SailMark';
import { useSettings } from '../hooks/useSettings';
import { ExportIcon, SearchIcon, TrashIcon } from '../icons';
import { Keycaps } from './Keycaps';
import { dayLabel, duration, markLabel, snippetParts, toolLine } from './historyText';

const time = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** The screen you marked, kept with your question when "Keep screenshots in history" is on (UX-74). Click to see it larger. */
function Screenshot({ messageId }: { messageId: number }) {
  const [src, setSrc] = useState<string | null>(null), [large, setLarge] = useState(false);
  useEffect(() => { let alive = true; void window.kite.historyScreenshot(messageId).then(url => { if (alive) setSrc(url); }); return () => { alive = false; }; }, [messageId]);
  if (!src) return null;
  return <button type="button" className={`chat-shot${large ? ' large' : ''}`} aria-expanded={large} aria-label={large ? 'Show the screenshot smaller' : 'Show the screenshot larger'}
    onClick={() => setLarge(v => !v)}><img src={src} alt="The screen you marked" /></button>;
}

/** History as a readable chat: the content first, details on request (docs/ui-ux-improvements.md UX-70 to UX-73). */
export default function HistoryView() {
  const settings = useSettings();
  const [query, setQuery] = useState(''), [rows, setRows] = useState<ConversationSummary[] | null>(null), [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<HistoryDetail | null>(null), [toast, setToast] = useState('');
  // Keep the open conversation while it's still listed; otherwise open the first one, so the two panes always agree.
  const load = (q: string) => window.kite.listHistory(q).then(list => { setRows(list); setSelected(current => list.some(r => r.id === current) ? current : list[0]?.id ?? null); return list; });
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => { if (alive) load(query).catch(() => setToast('Couldn’t load history.')); }, 180);
    return () => { alive = false; clearTimeout(timer); };
  }, [query]);
  useEffect(() => { let alive = true; setDetail(null); if (selected) void window.kite.historyDetail(selected).then(d => { if (alive) setDetail(d); }); return () => { alive = false; }; }, [selected]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer); }, [toast]);
  // The main process asks for confirmation before anything is deleted.
  const remove = async (id: string | null) => {
    const result = await window.kite.deleteHistory(id);
    if (result.ok) { await load(query); setToast(id ? 'Conversation deleted.' : 'History cleared.'); }
    else if (result.error) setToast(result.error);
  };
  const modelName = (m: HistoryMessage) => settings?.models.find(e => e.provider === m.provider && e.id === m.model)?.label ?? m.model;
  // Tools are recorded against the user's message or Kite's; show them with Kite's reply to that question when there is one.
  const toolsFor = (index: number, messages: HistoryMessage[], all: ToolAudit[]) => {
    const m = messages[index];
    if (m.role === 'user') return messages[index + 1]?.role === 'assistant' ? [] : all.filter(t => t.message_id === m.id);
    const asked = messages[index - 1]?.role === 'user' ? messages[index - 1].id : null;
    return all.filter(t => t.message_id === m.id || t.message_id === asked);
  };
  const current = rows?.find(r => r.id === selected);
  const hotkey = settings?.settings.hotkey ?? ['Control', 'Meta'];
  const empty = rows !== null && rows.length === 0;

  return <main className="history-view">
    <h1>History</h1>
    <p className="group-hint">Stored on this computer. Search, read again, or let conversations go.</p>
    {empty && !query ? <div className="history-empty"><SailMark size={40} /><p>Hold <Keycaps keys={hotkey} /> to ask your first question.</p></div> :
    <div className="history-layout">
      <nav className="history-list" aria-label="Conversations">
        <label className="search"><SearchIcon /><input aria-label="Search history" placeholder="Search your conversations" value={query} onChange={e => setQuery(e.target.value)} /></label>
        {empty && <p className="history-none">No conversations match “{query}”.</p>}
        {rows?.map((r, i) => {
          const day = dayLabel(r.started_at);
          return <div key={r.id}>{(!i || dayLabel(rows[i - 1].started_at) !== day) && <h3 className="history-day">{day}</h3>}
            <button className={`history-item${selected === r.id ? ' selected' : ''}`} aria-current={selected === r.id ? 'true' : undefined} onClick={() => setSelected(r.id)}>
              <strong>{r.preview?.split('\n')[0] || 'Empty conversation'}</strong>
              {r.snippet ? <small className="history-snippet">{snippetParts(r.snippet).map((p, k) => p.match ? <mark key={k}>{p.text}</mark> : <span key={k}>{p.text}</span>)}</small>
                : <small>{time(r.started_at)} · {r.count} {r.count === 1 ? 'message' : 'messages'}</small>}
            </button></div>;
        })}
        {!!rows?.length && <button className="ghost danger history-clear" onClick={() => void remove(null)}>Clear all history</button>}
      </nav>
      <article className="history-conversation">
        {selected && current && <header className="conversation-head"><span>{dayLabel(current.started_at)} · {time(current.started_at)}</span>
          <button className="ghost icon-button" aria-label="Export as Markdown" title="Export as Markdown" onClick={() => void window.kite.exportHistory(selected).then(r => { if (r.ok) setToast('Exported.'); else if (r.error) setToast(r.error); })}><ExportIcon /></button>
          <button className="ghost icon-button danger" aria-label="Delete conversation" title="Delete conversation" onClick={() => void remove(selected)}><TrashIcon /></button></header>}
        {detail?.messages.map((m, i) => {
          const tools = toolsFor(i, detail.messages, detail.tools), mark = markLabel(m.annotation_json);
          const details = m.role === 'assistant' || tools.length > 0;
          return <section className={`history-message ${m.role === 'user' ? 'from-user' : 'from-kite'}`} key={m.id}>
            {m.role !== 'user' && <span className="chat-avatar" aria-label="Kite"><SailMark size={16} /></span>}
            <div className="chat-body">
              <p>{m.content}</p>
              {m.role === 'user' && !!m.attachments && <Screenshot messageId={m.id} />}
              {mark && <span className="annotation-badge">{mark}</span>}
              {details && <details className="chat-details"><summary>Details</summary>
                {m.role === 'assistant' && <p className="chat-meta">{modelName(m)} · answered in {duration(m.total_ms || 0)}{m.voice_to_voice_ms != null ? ` · ${duration(m.voice_to_voice_ms)} voice to voice` : ''}</p>}
                {tools.map(t => <details className="tool-line" key={t.id}><summary>{toolLine(t)}</summary><p>{t.summary}</p><pre>{t.error ?? t.result_json}</pre></details>)}
              </details>}
            </div>
          </section>;
        })}
        {!selected && !empty && <p className="history-none">Choose a conversation to read it again.</p>}
      </article>
    </div>}
    {toast && <div className="toast" role="status">{toast}</div>}
  </main>;
}
