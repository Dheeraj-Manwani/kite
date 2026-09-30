import { useEffect, useState } from 'react';
import type { ConversationSummary, HistoryDetail } from '../../shared/release';
export default function HistoryView() {
  const [query, setQuery] = useState(''), [rows, setRows] = useState<ConversationSummary[]>([]), [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<HistoryDetail | null>(null), [status, setStatus] = useState('');
  const refresh = () => window.kite.listHistory(query).then(setRows);
  useEffect(() => { let alive = true; const timer = setTimeout(() => { void window.kite.listHistory(query).then(r => { if (alive) setRows(r); }).catch(() => setStatus('Could not load history.')); }, 180); return () => { alive = false; clearTimeout(timer); }; }, [query]);
  useEffect(() => { let alive = true; setDetail(null); if (selected) void window.kite.historyDetail(selected).then(d => { if (alive) setDetail(d); }); return () => { alive = false; }; }, [selected]);
  const remove = async (id: string | null) => { const result = await window.kite.deleteHistory(id); if (result.ok) { setSelected(null); setDetail(null); await refresh(); setStatus('History deleted.'); } else setStatus(result.error ?? 'Deletion cancelled.'); };
  return <main className="history-view"><header><h1>Your conversations</h1><p>Stored on this computer. Search, revisit, or let them go.</p></header>
    <div className="history-toolbar"><input aria-label="Search history" placeholder="Search words in your conversations" value={query} onChange={e => setQuery(e.target.value)} /><button className="danger" onClick={() => void remove(null)}>Clear all history</button></div>
    <p role="status">{status}</p><div className="history-layout"><nav aria-label="Conversations">{rows.length === 0 && <p>No conversations found.</p>}{rows.map((r,i) => {
      const day = new Date(r.started_at).toLocaleDateString();
      return <div key={r.id}>{(!i || new Date(rows[i-1].started_at).toLocaleDateString() !== day) && <h3>{day}</h3>}
        <button className={`history-item ${selected === r.id ? 'selected' : ''}`} onClick={() => setSelected(r.id)}><strong>{r.preview?.split('\n')[0] || 'Empty conversation'}</strong><small>{r.models || 'No reply yet'} · {r.count} messages</small></button></div>;
    })}</nav><article>{selected && <div className="history-toolbar"><button onClick={() => void window.kite.exportHistory(selected).then(r => setStatus(r.ok ? 'Exported.' : r.error ?? 'Export cancelled.'))}>Export Markdown</button><button className="danger" onClick={() => void remove(selected)}>Delete conversation</button></div>}
      {detail?.messages.map(m => <section className="history-message" key={m.id}><h3>{m.role === 'user' ? 'You' : 'Kite'} <small>{m.model}</small></h3><p>{m.content}</p>
        {m.annotation_json && <span className="annotation-badge">Marked: {(() => { try { return JSON.parse(m.annotation_json).marks.map((x: {markType:string}) => x.markType).join(', ') || 'screen capture'; } catch { return 'screen'; } })()}</span>}
        <small>{Math.round(m.total_ms || 0)} ms total{m.voice_to_voice_ms != null ? ` · ${Math.round(m.voice_to_voice_ms)} ms voice-to-voice` : ''}</small>
        {detail.tools.filter(t => t.message_id === m.id).map(t => <details key={t.id}><summary>{t.tool} · {t.decision} · {Math.round(t.duration_ms)} ms</summary><p>{t.summary}</p><pre>{t.error ?? t.result_json}</pre></details>)}
      </section>)}{!selected && <p>Choose a conversation to see its messages and tool decisions.</p>}</article></div>
  </main>;
}
