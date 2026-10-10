import { ApprovalCard } from './ApprovalCard';
import { useEffect, useRef, useState } from 'react';
import type { VoiceEvent, ApprovalCard as Card } from '../../shared/types';
import { useKiteStore } from '../store/kite';
import { runtime } from '../kite/runtime';
import { voiceRuntime, react } from './runtime';
import { VoiceRecorder } from './recorder';
import { VoicePlayback } from './playback';
import { displayText } from './reveal';
import { MarkdownView } from './MarkdownView';
import { earcon } from './earcons';
import { modelLabel, useSettings } from '../hooks/useSettings';
import { AlertIcon, BusyDots, ChevronIcon, CopyIcon, HistoryIcon, SetupIcon, Working } from '../icons';
interface Bubble { id: number; visible: boolean; transcript: string; text: string; streaming: boolean; settings: boolean; fallback: string; vision?: string; attachment?: import('../../shared/vision').ScreenAttachment; voiceStatus: string; approval?: Card; toolStatus?: string; alarm?: boolean; quiet?: boolean; compact?: boolean; turn?: boolean; status?: Status; error?: { title: string; text: string; setup?: boolean } }
interface PastTurn { key: string; question: string; answer: string; error?: string; model?: string; attachment?: import('../../shared/vision').ScreenAttachment }
type Status = 'listening' | 'thinking';
/** An answer's first line as plain words, for the folded answer below a decision (UX-23). */
const firstLine = (text: string) => displayText(text).split('\n').map(l => l.replace(/^\s*(#{1,6}|[-*+•]|\d{1,3}[.)])\s+/, '').replace(/\*\*|__|`/g, '').trim()).find(Boolean) ?? '';
const empty: Bubble = { id: 0, visible: false, transcript: '', text: '', streaming: false, settings: false, fallback: '', voiceStatus: '' };
/**
 * Listening and thinking as a compact pill beside the kite (UX-12), sharing the tail's three-dot rhythm.
 * Listening: the dots are a live level meter, the later dots lagging so the voice flows down them; after 2 s of
 * silence the hint asks the user to check their mic. Thinking: the dots pulse, and after 3 s the model is named.
 */
function StatusLine({ status }: { status: Status }) {
  const dots = useRef<HTMLSpanElement>(null), [silent, setSilent] = useState(false), [still, setStill] = useState(false);
  const model = modelLabel(useSettings());
  useEffect(() => {
    setSilent(false); setStill(false);
    if (status === 'thinking') { const timer = setTimeout(() => setStill(true), 3000); return () => clearTimeout(timer); }
    const levels = [0, 0, 0];
    let heard = performance.now(), quiet = false, frame = 0;
    const tick = (now: number) => {
      const level = runtime.audioLevel ?? 0;
      levels[0] = level; levels[1] += (levels[0] - levels[1]) * .25; levels[2] += (levels[1] - levels[2]) * .25;
      levels.forEach((value, i) => dots.current?.style.setProperty(`--l${i + 1}`, value.toFixed(3)));
      if (level > .06) heard = now;
      if (now - heard > 2000 !== quiet) { quiet = !quiet; setSilent(quiet); }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [status]);
  const text = status === 'listening' ? silent ? 'I can’t hear you — check your mic' : 'Listening · release to send · Esc to cancel'
    : still && model ? `Still thinking · ${model}` : 'Thinking';
  return <div className="bubble-status" role="status">
    <span ref={dots} className="status-dots" data-status={status} aria-hidden="true"><i /><i /><i /></span>{text}</div>;
}
function Attachment({ value, earlier = false }: { value: import('../../shared/vision').ScreenAttachment; earlier?: boolean }) {
  const label = `${value.label} · ${new Date(value.capturedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  return <div className="conversation-attachment">
    {value.preview && !earlier ? <details><summary>{label} · View capture</summary><img src={value.preview} alt="Screen content shared with this question" /></details> : <span>{label}</span>}
    <small>{earlier ? 'Earlier capture. Its pixels are not attached to this follow-up.' : 'Captured for this question.'}</small>
  </div>;
}
export function SpeechBubble() {
  const [bubble, setBubble] = useState<Bubble>(empty), settings = useSettings();
  const [minimized, setMinimized] = useState(false), [expanded, setExpanded] = useState(false), [textSize, setTextSize] = useState(16);
  const [speakingNow, setSpeakingNow] = useState(false);
  const [turns, setTurns] = useState<PastTurn[]>([]), past = useRef<PastTurn[]>([]);
  const [draft, setDraft] = useState(''), draftRef = useRef(''), drafts = useRef(new Map<string, string>());
  const [sending, setSending] = useState(false), [composerError, setComposerError] = useState('');
  const input = useRef<HTMLTextAreaElement>(null), body = useRef<HTMLDivElement>(null), followScroll = useRef(true);
  const conversationId = useRef<string | null>(null), anchor = useRef(0), conversationMode = useRef(false), previousBubble = useRef<Bubble>(empty);
  const stopSpeech = useRef<() => void>(() => undefined), dismissed = useRef(false), stoppedSpeech = useRef<number | null>(null);
  const resized = useRef({ width: '', height: '' });
  const element = useRef<HTMLElement>(null), state = useRef(empty);
  const suspendedBubble = useRef<Bubble | undefined>(undefined);
  const expires = useRef(Infinity), remaining = useRef(Infinity), latest = useRef(0);
  const update = (value: Bubble) => {
    state.current = value; setBubble(value);
  };
  const changeDraft = (value: string) => { draftRef.current = value; setDraft(value); drafts.current.set(conversationId.current ?? 'new', value); };
  const setPast = (value: PastTurn[]) => { past.current = value; setTurns(value); };
  const archive = () => {
    const current = state.current;
    if (current.turn && !current.quiet && (current.transcript || current.text)) {
      const key = `live-${current.id}`;
      setPast([...past.current.filter(turn => turn.key !== key), { key, question: current.transcript, answer: current.text, error: current.error?.text, model: current.fallback || current.vision,
        attachment: current.attachment && { ...current.attachment, preview: undefined } }]);
    }
  };
  const close = () => { dismissed.current = true; stopSpeech.current(); update({ ...state.current, visible: false }); window.kite.releaseOverlay(); };
  const minimize = (value: boolean) => {
    const panel = element.current;
    if (panel) {
      if (value) { resized.current = { width: panel.style.width, height: panel.style.height }; panel.style.width = ''; panel.style.height = ''; }
      else if (panel.classList.contains('minimized')) { panel.style.width = resized.current.width; panel.style.height = resized.current.height; }
    }
    setMinimized(value);
    if (value) window.kite.releaseOverlay();
  };
  const busy = bubble.streaming || !!bubble.status || !!bubble.approval;
  const send = async () => {
    const text = draftRef.current.trim(); if (!text || sending || busy) return;
    const generation = anchor.current;
    setSending(true); setComposerError('');
    try {
      const result = await window.kite.submitText(text);
      if (generation === anchor.current) {
        if (result.ok) { if (draftRef.current.trim() === text) changeDraft(''); followScroll.current = true; }
        else setComposerError(result.error ?? 'Couldn’t send. Your draft is still here.');
      }
    } catch { if (generation === anchor.current) setComposerError('Couldn’t send. Your draft is still here.'); }
    finally { setSending(false); }
  };
  useEffect(() => {
    const recorder = new VoiceRecorder();
    let llmDone = false, playbackDone = true, speaking = false;
    let starts: number[] = [], wordIndex = 0;
    let idleTimer: ReturnType<typeof setTimeout>;
    const idle = (delay = 0) => { clearTimeout(idleTimer); idleTimer = setTimeout(() => useKiteStore.getState().setMood('idle'), delay); };
    const life = (ms: number) => { remaining.current = ms; expires.current = voiceRuntime.hover ? Infinity : performance.now() + ms; };
    const complete = () => {
      if (!llmDone || !playbackDone) return;
      update({ ...state.current, streaming: false });
      if (state.current.quiet) { voiceRuntime.quiet = false; idle(300); return; }
      // Finished answers are documents to keep reading, without a countdown or completion flutter.
      idle(300); expires.current = Infinity; remaining.current = Infinity;
    };
    const player = new VoicePlayback(type => {
      window.kite.reportPlayback(latest.current, type);
      if (type === 'started') { useKiteStore.getState().setMood('talking'); }
      else { playbackDone = true; speaking = false; setSpeakingNow(false); if (type === 'failed') update({ ...state.current, voiceStatus: 'Voice unavailable · text only' }); complete(); }
    });
    stopSpeech.current = () => {
      stoppedSpeech.current = latest.current;
      player.stop(); runtime.speechLevel = 0; speaking = false; playbackDone = true; setSpeakingNow(false);
      update({ ...state.current, voiceStatus: 'Speech stopped · keep reading' });
      window.kite.stopSpeech(latest.current); complete();
    };
    voiceRuntime.tickAudio = dt => {
      recorder.sample(dt); runtime.speechLevel = player.sample(dt);
      voiceRuntime.audioId = state.current.id; voiceRuntime.audioMs = speaking ? player.elapsed * 1000 : -1;
      if (speaking && starts.length && !state.current.approval) {
        const elapsed = player.elapsed;
        while (wordIndex < starts.length && starts[wordIndex] <= elapsed) { wordIndex++; voiceRuntime.wordAt = performance.now(); }
      }
    };
    void recorder.warm().catch((): void => undefined);
    const reset = (id: number) => {
      recorder.cancel(); player.stop(); latest.current = id; clearTimeout(idleTimer);
      starts = []; wordIndex = 0; dismissed.current = false; stoppedSpeech.current = null; setSpeakingNow(false);
      llmDone = false; playbackDone = true; speaking = false; voiceRuntime.waitingSince = 0; voiceRuntime.quiet = false;
      voiceRuntime.hover = false; expires.current = Infinity; remaining.current = Infinity;
    };
    const restorePrevious = (message: string) => {
      const previous = previousBubble.current;
      if (previous.turn && (previous.transcript || previous.text)) {
        setPast(past.current.filter(turn => turn.key !== `live-${previous.id}`));
        update({ ...previous, visible: true, streaming: false, status: undefined, approval: undefined, voiceStatus: message }); return true;
      }
      if (past.current.length) { conversationMode.current = true; update({ ...empty, id: latest.current, visible: true, voiceStatus: message }); return true; }
      return false;
    };
    const receive = (event: VoiceEvent) => {
      if (event.type === 'ptt:start' || event.type === 'text:start' || event.type === 'model:changed' || event.type === 'guide:announce') {
        if (event.type === 'ptt:start' && state.current.approval) suspendedBubble.current = state.current;
        previousBubble.current = state.current; archive();
        setMinimized(false); followScroll.current = true;
        voiceRuntime.toolPose = null;
        reset(event.id);
        // Guide steps are spoken while the kite points; the step card shows the words.
        if (event.type === 'guide:announce') { voiceRuntime.quiet = true; update({ ...empty, id: event.id, quiet: true }); void player.warm().catch((): void => undefined); return; }
        if (event.type === 'text:start') conversationMode.current = true;
        update({ ...empty, id: event.id, visible: true, turn: event.type === 'ptt:start' || event.type === 'text:start', status: event.type === 'ptt:start' ? 'listening' : 'thinking' });
        if (event.type === 'ptt:start') {
          useKiteStore.getState().setMood('listening');
          if (voiceRuntime.reaction?.kind !== 'flinch') react('perk');
          earcon('listen');
          void recorder.start(event.id);
        } else { useKiteStore.getState().setMood('thinking'); if (event.text !== 'Voice preview') react('costume'); }
        void player.warm().catch((): void => undefined); return;
      }
      if (event.type === 'approval:resume') {
        setPast(past.current.filter(turn => turn.key !== `live-${event.id}`));
        recorder.cancel(); reset(event.id); update({ ...(suspendedBubble.current ?? empty), id: event.id, visible: true, status: undefined, text: event.text ?? '' });
        // The card is back, so the kite leans toward it again.
        if (state.current.approval) voiceRuntime.toolPose = 'proposing';
        suspendedBubble.current = undefined; return;
      }
      if (event.id !== latest.current) return;
      if (event.timing) { voiceRuntime.timing = event.timing; if (event.timing.voiceAverageMs !== undefined) voiceRuntime.voiceAverageMs = event.timing.voiceAverageMs; }
      switch (event.type) {
        case 'conversation:started':
          if (event.conversationId) {
            if (conversationId.current && conversationId.current !== event.conversationId) { setPast([]); anchor.current++; }
            conversationId.current = event.conversationId;
            drafts.current.set(event.conversationId, draftRef.current);
          } break;
        case 'ptt:stop': earcon('release'); recorder.stop(event.id); voiceRuntime.waitingSince = performance.now(); useKiteStore.getState().setMood('thinking'); react('nod'); update({ ...state.current, status: 'thinking' }); break;
        case 'voice:thinking': voiceRuntime.waitingSince ||= performance.now(); useKiteStore.getState().setMood('thinking'); break;
        case 'voice:transcript': conversationMode.current = true; update({ ...state.current, visible: true, turn: true, transcript: event.text ?? '', text: '', streaming: true }); break;
        case 'tts:start':
          if (stoppedSpeech.current === event.id) break;
          player.begin(); starts = []; wordIndex = 0; speaking = true; playbackDone = false; setSpeakingNow(true); break;
        case 'tts:chunk': if (speaking && event.audio) player.chunk(event.audio); break;
        case 'tts:timestamps':
          if (event.timestamps && speaking) {
            starts.push(...event.timestamps.start);
          } break;
        case 'tts:done': player.finish(); break;
        case 'tts:stop': player.stop(); runtime.speechLevel = 0; speaking = false; playbackDone = true; setSpeakingNow(false); update({ ...state.current }); complete(); break;
        case 'tts:error': player.stop(); speaking = false; playbackDone = true; setSpeakingNow(false); update({ ...state.current, voiceStatus: event.text ?? 'Voice unavailable · text only' }); complete(); break;
        case 'voice:muted': voiceRuntime.mutedUntil = performance.now() + 1500; break;
        case 'voice:metrics': break;
        case 'tool:approvalRequired':
          minimize(false); dismissed.current = false;
          expires.current = Infinity; remaining.current = Infinity; voiceRuntime.toolPose = 'proposing'; voiceRuntime.approvalEndsAt = event.approval?.expiresAt ?? 0;
          update({ ...state.current, visible: true, approval: event.approval, toolStatus: '' }); react('proposing'); earcon('approval'); break;
        case 'tool:decision':
          voiceRuntime.toolPose = null; update({ ...state.current, approval: undefined,
            toolStatus: event.decision === 'approved' ? 'On it…' : event.decision === 'timeout' ? 'Timed out. Nothing ran.' : 'Okay, cancelled.' });
          react(event.decision === 'approved' ? 'approved' : 'denied'); window.kite.setOverlayInteractive(false); break;
        case 'tool:executing': voiceRuntime.toolPose = 'executing'; update({ ...state.current, toolStatus: 'Working…' }); break;
        case 'tool:result': voiceRuntime.toolPose = null; update({ ...state.current, toolStatus: event.text ?? '' }); react(event.success ? 'success' : 'tangled'); break;
        // The reminder tug lasts a few seconds, then the kite settles; the bubble keeps the reminder (design.md §K5.3).
        case 'reminder:fired': minimize(false); voiceRuntime.alarmUntil = performance.now() + 3500; update({ ...state.current, visible: true, alarm: true }); react('alarm'); break;
        case 'vision:routed': react('costume', .5); update({ ...state.current, vision: event.text }); break;
        case 'vision:attached': update({ ...state.current, attachment: event.attachment }); break;
        case 'model:fallback': react('phew'); update({ ...state.current, fallback: event.text ?? '' }); break;
        case 'llm:delta':
          if (!speaking && useKiteStore.getState().mood !== 'talking') { if (!state.current.quiet && !['costume', 'phew', 'success', 'denied', 'tangled', 'approved'].includes(voiceRuntime.reaction?.kind)) react('aha'); useKiteStore.getState().setMood('talking'); }
          voiceRuntime.waitingSince = 0;
          update({ ...state.current, visible: !state.current.quiet && !dismissed.current, text: state.current.text + (event.text ?? ''), streaming: true }); break;
        case 'llm:done': voiceRuntime.waitingSince = 0; llmDone = true; update({ ...state.current, streaming: false, status: undefined }); complete(); break;
        case 'ptt:tooShort': case 'voice:empty':
          // A short status pill rather than a card: say what happened, then what to do.
          recorder.cancel(); player.stop(); voiceRuntime.waitingSince = 0; react('puzzled'); idle(1200);
          if (!restorePrevious(event.type === 'ptt:tooShort' ? 'That hold was too short. Your conversation is still here.' : 'I didn’t hear anything. Your conversation is still here.')) {
            life(2600); update({ ...empty, id: event.id, visible: true, compact: true, text: event.type === 'ptt:tooShort' ? 'Hold a bit longer while you speak.' : 'I didn’t hear anything. Hold and speak again.' });
          } break;
        case 'ptt:cancel': case 'voice:aborted':
          recorder.cancel(); player.stop(); voiceRuntime.waitingSince = 0; voiceRuntime.toolPose = null; setSpeakingNow(false);
          if (!(state.current.turn && !state.current.transcript && !state.current.text && restorePrevious('Hold cancelled. Your conversation is still here.')))
            update({ ...state.current, visible: false, streaming: false, status: undefined, approval: undefined });
          react('flinch'); idle(); break;
        case 'llm:error':
          recorder.cancel(); player.stop(); speaking = false; playbackDone = true; stoppedSpeech.current = event.id; voiceRuntime.waitingSince = 0;
          // What happened as a title, then one sentence of help and at most one action (UX-15).
          update({ ...state.current, visible: true, streaming: false, status: undefined, settings: !!event.settings,
            error: { title: event.title ?? 'I couldn’t finish that', text: event.text ?? 'Please try again.', setup: event.setup } });
          react('tangled'); idle(1200); expires.current = Infinity; remaining.current = Infinity; setSpeakingNow(false); break;
      }
    };
    const unsubscribe = window.kite.onVoiceEvent(receive);
    const open = () => {
      conversationMode.current = true; dismissed.current = false;
      minimize(false); update({ ...state.current, visible: true, compact: false });
      requestAnimationFrame(() => { if (document.documentElement.classList.contains('overlay-focused')) input.current?.focus(); });
    };
    const offShow = window.kite.onAppEvent(event => { if (event.type === 'conversation:show') open(); });
    const offConversation = window.kite.onConversationOpen(snapshot => {
      reset(0); conversationId.current = snapshot.id; anchor.current++; previousBubble.current = empty;
      setComposerError('');
      if (snapshot.reason === 'deleted') drafts.current.clear();
      const loaded: PastTurn[] = [];
      for (const message of snapshot.messages) {
        const last = loaded[loaded.length - 1];
        if (message.role === 'assistant' && last && !last.answer) last.answer = message.content;
        else loaded.push({ key: `saved-${message.id}`, question: message.role === 'user' ? message.content : '', answer: message.role === 'assistant' ? message.content : '', model: message.role === 'assistant' ? message.model : undefined,
          attachment: message.attachments ? { label: 'Earlier screen capture', capturedAt: message.created_at } : undefined });
      }
      setPast(loaded); changeDraft(drafts.current.get(snapshot.id ?? 'new') ?? '');
      conversationMode.current = snapshot.reason !== 'deleted'; followScroll.current = true;
      update({ ...empty, visible: snapshot.reason !== 'deleted' });
      if (snapshot.reason !== 'deleted') open();
    });
    const unsubSettings = window.kite.onSettingsChanged(snapshot => {
      if (!snapshot.settings.ttsEnabled && speaking) { player.stop(); speaking = false; playbackDone = true; setSpeakingNow(false); update({ ...state.current }); complete(); }
    });
    const expiry = setInterval(() => {
      if (!voiceRuntime.hover && state.current.visible && performance.now() >= expires.current) { update({ ...state.current, visible: false }); expires.current = Infinity; }
    }, 100);
    return () => {
      unsubscribe(); offShow(); offConversation(); unsubSettings(); recorder.dispose(); player.dispose(); clearInterval(expiry); clearTimeout(idleTimer);
      voiceRuntime.tickAudio = null; voiceRuntime.bubble = null; voiceRuntime.hover = false; runtime.speechLevel = 0; window.kite.setBubbleBounds(null);
    };
  }, []);
  useEffect(() => { if (followScroll.current && body.current) body.current.scrollTop = body.current.scrollHeight; }, [bubble.text, bubble.transcript, bubble.status, turns.length]);
  // Esc closes the bubble while Kite's controls have focus; a pending approval stays until it is answered or times out.
  useEffect(() => {
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.isComposing && state.current.visible && !state.current.approval && !state.current.alarm) close(); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  useEffect(() => {
    voiceRuntime.bubble = bubble.visible ? element.current : null;
    if (!bubble.visible) { voiceRuntime.hover = false; window.kite.setBubbleBounds(null); window.kite.setOverlayInteractive(false); }
  }, [bubble.visible]);
  const hover = (value: boolean) => {
    voiceRuntime.hover = value; window.kite.setOverlayInteractive(value);
    if (value) { remaining.current = Math.max(0, expires.current - performance.now()); expires.current = Infinity; }
    else expires.current = performance.now() + remaining.current;
  };
  // The pill stays until there is something to read or decide; then the bubble grows to hold it.
  const status = bubble.status && !bubble.text && !bubble.error && !bubble.approval && !bubble.toolStatus && !bubble.alarm && !bubble.settings && !bubble.voiceStatus ? bubble.status : undefined;
  const pill = !conversationMode.current && !turns.length ? status : undefined;
  // One short announcement per state instead of re-reading a streaming bubble (UX-91). The pill and errors announce themselves.
  const announcement = !bubble.visible || pill ? '' : bubble.approval ? `Kite asks: ${bubble.approval.summary}`
    : bubble.compact ? bubble.text : bubble.text && !bubble.streaming && !bubble.error ? 'Answer ready' : '';
  const reading = !bubble.compact && !pill;
  const replyToCopy = bubble.text || turns[turns.length - 1]?.answer || '';
  const pastMessages = !!turns.length && <div className="conversation-turns" aria-label="Earlier messages">{turns.map(turn => <section className="conversation-turn" key={turn.key}>
    {turn.question && <div className="conversation-question"><span>You</span>{turn.question}</div>}
    {turn.attachment && <Attachment value={turn.attachment} earlier />}
    {turn.answer && <div className="conversation-answer"><span className="conversation-speaker">Kite</span><MarkdownView text={turn.answer} /></div>}
    {turn.error && <p className="conversation-failed">{turn.error}</p>}
    {turn.question && turn.error && <button className="ghost" onClick={() => { changeDraft(turn.question); window.kite.focusOverlay(); input.current?.focus(); }}>Edit and retry</button>}
  </section>)}</div>;
  return <aside ref={element} data-anchor={anchor.current} aria-label="Kite conversation" style={{ fontSize: textSize }}
    className={`speech-bubble ${bubble.visible ? 'visible' : ''} ${bubble.compact || pill || minimized ? 'compact' : ''} ${reading ? 'reading' : ''} ${expanded ? 'expanded' : ''} ${minimized ? 'minimized' : ''}`}
    inert={!bubble.visible} aria-hidden={!bubble.visible} onPointerEnter={() => hover(true)} onPointerLeave={() => hover(false)}>
    {reading && <div className="bubble-header">
      {minimized ? <button className="ghost" onClick={() => minimize(false)}>Show answer</button> : <>
        <strong>{bubble.approval ? 'Your permission' : conversationMode.current ? 'Kite conversation' : 'Kite answer'}</strong>
        <button className="ghost" onClick={() => { if (element.current) { element.current.style.width = ''; element.current.style.height = ''; } setExpanded(!expanded); }} aria-pressed={expanded}>{expanded ? 'Collapse' : 'Expand'}</button>
        <button className="ghost" disabled={!!bubble.approval || !!bubble.alarm} onClick={() => minimize(true)}>Minimize</button>
      </>}
      <button className="ghost" disabled={!!bubble.approval || !!bubble.alarm} onClick={close}>Close</button>
    </div>}
    <div ref={body} className="bubble-body" onWheel={event => { if (event.deltaY < 0) followScroll.current = false; }} onPointerDown={() => { followScroll.current = false; }}
      onScroll={event => { const node = event.currentTarget; followScroll.current = node.scrollHeight - node.scrollTop - node.clientHeight < 40; }}>{pill ? <StatusLine status={pill} /> : <>
    {!bubble.approval && pastMessages}
    {status && !pill && <StatusLine status={status} />}
    {bubble.attachment && <Attachment value={bubble.attachment} />}
    {bubble.approval ? <>
      {/* Only one thing needs a decision, so it comes first; what was said before folds into one line (UX-23). */}
      <ApprovalCard key={bubble.approval.approvalId} card={bubble.approval} />
      {(bubble.transcript || bubble.text) && <details className="bubble-earlier">
        <summary><span>{firstLine(bubble.text) || `You asked · ${bubble.transcript}`}</span><ChevronIcon /></summary>
        {bubble.transcript && <div className="bubble-transcript">You asked · {bubble.transcript}</div>}
        {bubble.text && <div className="bubble-reply"><MarkdownView text={bubble.text} /></div>}
      </details>}
      {pastMessages && <details className="bubble-earlier"><summary>Earlier messages</summary>{pastMessages}</details>}
    </> : <>
      {bubble.transcript && <div className="bubble-transcript conversation-question"><span>You</span>{bubble.transcript}</div>}
      {(bubble.text || bubble.streaming) && <div className="bubble-reply">{bubble.turn && <span className="conversation-speaker">Kite</span>}<MarkdownView text={bubble.text} />{bubble.streaming && <BusyDots />}</div>}
    </>}
    {bubble.error && <div className={`bubble-error${bubble.error.setup ? ' setup' : ''}`} role="alert">
      <strong>{bubble.error.setup ? <SetupIcon /> : <AlertIcon />}{bubble.error.title}</strong><p>{bubble.error.text}</p></div>}
    {bubble.toolStatus && <div className="bubble-tool-status" role="status"><Working text={bubble.toolStatus} /></div>}
    {bubble.alarm && <button className="primary" onClick={() => { voiceRuntime.alarmUntil = 0; voiceRuntime.reaction = null; window.kite.dismissReminder(); update({ ...state.current, alarm: false }); }}>Dismiss reminder</button>}
    {bubble.voiceStatus && <div className="bubble-voice-status">{bubble.voiceStatus}</div>}
    {bubble.settings && <button className="primary" onClick={() => window.kite.openSettings()}>Open settings</button>}
    {bubble.error && bubble.transcript && <button className="ghost" onClick={() => { changeDraft(bubble.transcript); window.kite.focusOverlay(); input.current?.focus(); }}>Edit and retry</button>}
    {conversationMode.current && !turns.length && !bubble.transcript && !bubble.text && !bubble.status && !bubble.error && <p className="conversation-empty">Ask a question by typing here or holding your voice shortcut.</p>}
    {!bubble.compact && <div className="bubble-keys">Ctrl + Alt + K for keyboard controls · Esc to close</div>}
    </>}</div>
    {speakingNow && reading && !minimized && <button className="ghost bubble-stop-speech" onClick={() => stopSpeech.current()}>Stop speech</button>}
    {/* Reading controls remain available while the answer scrolls. */}
    {replyToCopy && !bubble.compact && !bubble.approval && <div className="bubble-footer">
      <span className="model-chip">{bubble.fallback ? `${bubble.fallback} · backup model` : bubble.vision || modelLabel(settings)}{bubble.vision ? ' · looked at your screen' : ''}</span>
      <button className="ghost icon-button" aria-label="Copy reply" title="Copy" onClick={() => { void window.kite.copyText(displayText(replyToCopy)); }}><CopyIcon /></button>
      <button className="ghost" aria-label="Smaller answer text" disabled={textSize <= 16} onClick={() => setTextSize(size => Math.max(16, size - 2))}>A−</button>
      <button className="ghost" aria-label="Larger answer text" disabled={textSize >= 22} onClick={() => setTextSize(size => Math.min(22, size + 2))}>A+</button>
      <button className="ghost icon-button" aria-label="Open in History" title="Open in History" onClick={() => window.kite.openView('history')}><HistoryIcon /></button>
    </div>}
    {reading && conversationMode.current && !minimized && <form className="conversation-composer" onSubmit={event => { event.preventDefault(); void send(); }}>
      <label htmlFor="conversation-reply">Ask or follow up</label>
      <textarea ref={input} id="conversation-reply" rows={2} maxLength={8000} value={draft} placeholder="Ask or follow up…"
        onPointerDown={() => window.kite.focusOverlay()} onChange={event => changeDraft(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />
      <div className="composer-actions"><small>{bubble.approval ? 'Answer the permission card above first.' : busy ? 'You can write your next question while Kite works.' : 'Enter to send · Shift + Enter for a new line'}</small>
        <button className="primary" type="submit" disabled={sending || busy || !draft.trim()}>Send</button></div>
      {composerError && <p role="alert" className="composer-error">{composerError}</p>}
      <button className="ghost new-conversation" type="button" disabled={sending || busy} onClick={() => { void window.kite.newConversation().then(result => { if (!result.ok) setComposerError(result.error ?? 'Couldn’t start a conversation.'); }).catch(() => setComposerError('Couldn’t start a conversation.')); }}>New conversation</button>
    </form>}
    <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
  </aside>;
}
