import { ApprovalCard } from './ApprovalCard';
import { useEffect, useRef, useState } from 'react';
import type { VoiceEvent, ApprovalCard as Card } from '../../shared/types';
import { useKiteStore } from '../store/kite';
import { runtime } from '../kite/runtime';
import { voiceRuntime, react } from './runtime';
import { VoiceRecorder } from './recorder';
import { VoicePlayback } from './playback';
import { displayText, wordOffsets } from './reveal';
import { modelLabel, useSettings } from '../hooks/useSettings';
interface Bubble { id: number; visible: boolean; transcript: string; text: string; streaming: boolean; settings: boolean; revealed: number; fallback: string; vision?: string; voiceStatus: string; approval?: Card; toolStatus?: string; alarm?: boolean; quiet?: boolean; compact?: boolean; status?: Status }
type Status = 'listening' | 'thinking';
const empty: Bubble = { id: 0, visible: false, transcript: '', text: '', streaming: false, settings: false, revealed: Infinity, fallback: '', voiceStatus: '' };
function Markdown({ text }: { text: string }) {
  return <>{displayText(text).split(/(```[\s\S]*?(?:```|$))/g).map((block, i) => block.startsWith('```')
    ? <pre key={i}><code>{block.replace(/^```[^\n]*\n?/, '').replace(/```$/, '')}</code></pre>
    : <span key={i}>{block.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, j) => part.startsWith('**') && part.endsWith('**')
      ? <strong key={j}>{part.slice(2, -2)}</strong> : part.startsWith('`') && part.endsWith('`') ? <code key={j}>{part.slice(1, -1)}</code> : part)}</span>)}</>;
}
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
  const text = status === 'listening' ? silent ? 'I can’t hear you — check your mic' : 'Release to send · Esc to cancel'
    : still && model ? `Still thinking · ${model}` : 'Thinking';
  return <div className="bubble-status" role="status">
    <span ref={dots} className="status-dots" data-status={status} aria-hidden="true"><i /><i /><i /></span>{text}</div>;
}
export function SpeechBubble() {
  const [bubble, setBubble] = useState<Bubble>(empty), [hovered, setHovered] = useState(false);
  const element = useRef<HTMLElement>(null), state = useRef(empty);
  const suspendedBubble = useRef<Bubble | undefined>(undefined);
  const expires = useRef(Infinity), remaining = useRef(Infinity), latest = useRef(0);
  const update = (value: Bubble) => { state.current = value; setBubble(value); };
  useEffect(() => {
    const recorder = new VoiceRecorder();
    let llmDone = false, playbackDone = true, speaking = false, firstAudioAt = 0, noTimestamps = false;
    let textBase = 0;
    let words: string[] = [], starts: number[] = [], offsets: number[] = [], wordIndex = 0;
    let idleTimer: ReturnType<typeof setTimeout>;
    const idle = (delay = 0) => { clearTimeout(idleTimer); idleTimer = setTimeout(() => useKiteStore.getState().setMood('idle'), delay); };
    const life = (ms: number) => { remaining.current = ms; expires.current = voiceRuntime.hover ? Infinity : performance.now() + ms; };
    const complete = () => {
      if (!llmDone || !playbackDone) return;
      update({ ...state.current, streaming: false, revealed: Infinity });
      if (state.current.quiet) { voiceRuntime.quiet = false; idle(300); return; }
      if (!['costume', 'success', 'denied', 'alarm'].includes(voiceRuntime.reaction?.kind)) react('happy'); idle(300); life(4000 + state.current.text.trim().split(/\s+/).length * 60);
    };
    const player = new VoicePlayback(type => {
      window.kite.reportPlayback(latest.current, type);
      if (type === 'started') { firstAudioAt = performance.now(); useKiteStore.getState().setMood('talking'); }
      else { playbackDone = true; speaking = false; if (type === 'failed') update({ ...state.current, revealed: Infinity, voiceStatus: 'Voice unavailable · text only' }); complete(); }
    });
    voiceRuntime.tickAudio = dt => {
      recorder.sample(dt); runtime.speechLevel = player.sample(dt);
      if (speaking && words.length && !state.current.approval) {
        const elapsed = player.elapsed;
        let reveal = state.current.revealed === Infinity ? 0 : state.current.revealed;
        while (wordIndex < starts.length && starts[wordIndex] <= elapsed) { reveal = Math.max(reveal, (offsets[wordIndex] ?? 0) + textBase); wordIndex++; }
        if (reveal !== state.current.revealed) update({ ...state.current, revealed: reveal });
      } else if (speaking && !noTimestamps && firstAudioAt && performance.now() - firstAudioAt > 300) {
        noTimestamps = true; update({ ...state.current, revealed: Infinity });
      }
    };
    void recorder.warm().catch((): void => undefined);
    const reset = (id: number) => {
      recorder.cancel(); player.stop(); latest.current = id; clearTimeout(idleTimer);
      words = []; starts = []; offsets = []; wordIndex = 0; firstAudioAt = 0; noTimestamps = false;
      llmDone = false; playbackDone = true; speaking = false; voiceRuntime.waitingSince = 0; voiceRuntime.quiet = false;
      voiceRuntime.hover = false; setHovered(false); expires.current = Infinity; remaining.current = Infinity;
    };
    const receive = (event: VoiceEvent) => {
      if (event.type === 'ptt:start' || event.type === 'model:changed' || event.type === 'guide:announce') {
        if (event.type === 'ptt:start' && state.current.approval) suspendedBubble.current = state.current;
        voiceRuntime.toolPose = null;
        reset(event.id);
        // Guide steps are spoken while the kite points; the step card shows the words.
        if (event.type === 'guide:announce') { voiceRuntime.quiet = true; update({ ...empty, id: event.id, quiet: true }); void player.warm().catch((): void => undefined); return; }
        update({ ...empty, id: event.id, visible: true, status: event.type === 'ptt:start' ? 'listening' : 'thinking' });
        if (event.type === 'ptt:start') {
          useKiteStore.getState().setMood('listening');
          if (voiceRuntime.reaction?.kind !== 'flinch') react('perk');
          void recorder.start(event.id);
        } else { useKiteStore.getState().setMood('thinking'); if (event.text !== 'Voice preview') react('costume'); }
        void player.warm().catch((): void => undefined); return;
      }
      if (event.type === 'approval:resume') {
        recorder.cancel(); reset(event.id); update({ ...(suspendedBubble.current ?? empty), id: event.id, visible: true, status: undefined, text: event.text ?? '', revealed: Infinity });
        suspendedBubble.current = undefined; return;
      }
      if (event.id !== latest.current) return;
      if (event.timing) { voiceRuntime.timing = event.timing; if (event.timing.voiceAverageMs !== undefined) voiceRuntime.voiceAverageMs = event.timing.voiceAverageMs; }
      switch (event.type) {
        case 'ptt:stop': recorder.stop(event.id); voiceRuntime.waitingSince = performance.now(); useKiteStore.getState().setMood('thinking'); update({ ...state.current, status: 'thinking' }); break;
        case 'voice:thinking': voiceRuntime.waitingSince ||= performance.now(); useKiteStore.getState().setMood('thinking'); break;
        case 'voice:transcript': update({ ...state.current, visible: true, transcript: event.text ?? '', text: '', streaming: true }); break;
        case 'tts:start': player.begin(); words = []; starts = []; offsets = []; wordIndex = 0; textBase = state.current.text.length; firstAudioAt = 0; noTimestamps = false; speaking = true; playbackDone = false; update({ ...state.current, revealed: state.current.approval ? Infinity : textBase }); break;
        case 'tts:chunk': if (speaking && event.audio) player.chunk(event.audio); break;
        case 'tts:timestamps':
          if (event.timestamps && speaking) {
            words.push(...event.timestamps.words); starts.push(...event.timestamps.start);
            offsets = wordOffsets(state.current.text.slice(textBase), words);
          } break;
        case 'tts:done': player.finish(); break;
        case 'tts:stop': player.stop(); runtime.speechLevel = 0; speaking = false; playbackDone = true; update({ ...state.current, revealed: Infinity }); complete(); break;
        case 'tts:error': player.stop(); speaking = false; playbackDone = true; update({ ...state.current, revealed: Infinity, voiceStatus: event.text ?? 'Voice unavailable · text only' }); complete(); break;
        case 'voice:muted': voiceRuntime.mutedUntil = performance.now() + 1500; break;
        case 'voice:metrics': break;
        case 'tool:approvalRequired':
          expires.current = Infinity; remaining.current = Infinity; voiceRuntime.toolPose = 'proposing';
          update({ ...state.current, visible: true, approval: event.approval, revealed: Infinity, toolStatus: '' }); react('proposing'); break;
        case 'tool:decision':
          voiceRuntime.toolPose = null; update({ ...state.current, approval: undefined, revealed: Infinity,
            toolStatus: event.decision === 'approved' ? 'On it…' : event.decision === 'timeout' ? 'Timed out. Nothing ran.' : 'Okay, cancelled.' });
          react(event.decision === 'approved' ? 'approved' : 'denied'); window.kite.setOverlayInteractive(false); break;
        case 'tool:executing': voiceRuntime.toolPose = 'executing'; update({ ...state.current, toolStatus: 'Working…' }); break;
        case 'tool:result': voiceRuntime.toolPose = null; update({ ...state.current, toolStatus: event.text ?? '' }); react(event.success ? 'success' : 'tangled'); break;
        case 'reminder:fired': voiceRuntime.alarmUntil = performance.now() + 10000; update({ ...state.current, alarm: true }); react('alarm'); break;
        case 'vision:routed': react('costume', .5); update({ ...state.current, vision: event.text }); break;
        case 'model:fallback': react('phew'); update({ ...state.current, fallback: event.text ?? '' }); break;
        case 'llm:delta':
          if (!speaking && useKiteStore.getState().mood !== 'talking') { if (!state.current.quiet && !['costume', 'phew', 'success', 'denied', 'tangled', 'approved'].includes(voiceRuntime.reaction?.kind)) react('aha'); useKiteStore.getState().setMood('talking'); }
          voiceRuntime.waitingSince = 0;
          update({ ...state.current, visible: !state.current.quiet, text: state.current.text + (event.text ?? ''), streaming: true });
          if (words.length) offsets = wordOffsets(state.current.text.slice(textBase), words); break;
        case 'llm:done': voiceRuntime.waitingSince = 0; llmDone = true; update({ ...state.current, streaming: false }); complete(); break;
        case 'ptt:tooShort': case 'voice:empty':
          // A short status pill rather than a card: say what happened, then what to do.
          recorder.cancel(); player.stop(); voiceRuntime.waitingSince = 0; react('puzzled'); idle(1200); life(2600);
          update({ ...empty, id: event.id, visible: true, compact: true, text: event.type === 'ptt:tooShort' ? 'Hold a bit longer while you speak.' : 'I didn’t hear anything. Hold and speak again.' }); break;
        case 'ptt:cancel': case 'voice:aborted':
          recorder.cancel(); player.stop(); voiceRuntime.waitingSince = 0; voiceRuntime.toolPose = null; update({ ...empty, id: event.id }); react('flinch'); idle(); break;
        case 'llm:error':
          recorder.cancel(); player.stop(); voiceRuntime.waitingSince = 0;
          update({ ...state.current, visible: true, revealed: Infinity, text: event.text ?? 'Something went wrong. Please try again.', streaming: false, settings: !!event.settings });
          react('tangled'); idle(1200); life(12000); break;
      }
    };
    const unsubscribe = window.kite.onVoiceEvent(receive);
    const unsubSettings = window.kite.onSettingsChanged(snapshot => {
      if (!snapshot.settings.ttsEnabled && speaking) { player.stop(); speaking = false; playbackDone = true; update({ ...state.current, revealed: Infinity }); complete(); }
    });
    const expiry = setInterval(() => {
      if (!voiceRuntime.hover && state.current.visible && performance.now() >= expires.current) { update({ ...state.current, visible: false }); expires.current = Infinity; }
    }, 100);
    return () => {
      unsubscribe(); unsubSettings(); recorder.dispose(); player.dispose(); clearInterval(expiry); clearTimeout(idleTimer);
      voiceRuntime.tickAudio = null; voiceRuntime.bubble = null; voiceRuntime.hover = false; runtime.speechLevel = 0; window.kite.setBubbleBounds(null);
    };
  }, []);
  // Esc closes the bubble while Kite's controls have focus; a pending approval stays until it is answered or times out.
  useEffect(() => {
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape' && state.current.visible && !state.current.approval) update({ ...state.current, visible: false }); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  useEffect(() => {
    voiceRuntime.bubble = bubble.visible ? element.current : null;
    if (!bubble.visible) { voiceRuntime.hover = false; window.kite.setBubbleBounds(null); window.kite.setOverlayInteractive(false); }
  }, [bubble.visible]);
  const hover = (value: boolean) => {
    voiceRuntime.hover = value; setHovered(value); window.kite.setOverlayInteractive(value);
    if (value) { remaining.current = Math.max(0, expires.current - performance.now()); expires.current = Infinity; }
    else expires.current = performance.now() + remaining.current;
  };
  // The pill stays until there is something to read or decide; then the bubble grows to hold it.
  const pill = bubble.status && !bubble.text && !bubble.approval && !bubble.toolStatus && !bubble.alarm && !bubble.settings && !bubble.voiceStatus ? bubble.status : undefined;
  return <aside ref={element} className={`speech-bubble ${bubble.visible ? 'visible' : ''} ${bubble.compact || pill ? 'compact' : ''}`}
    aria-live="polite" aria-hidden={!bubble.visible} onPointerEnter={() => hover(true)} onPointerLeave={() => hover(false)}>
    <div className="bubble-body">{pill ? <StatusLine status={pill} /> : <>
    {bubble.transcript && <div className="bubble-transcript">You: {bubble.transcript}</div>}
    <div className="bubble-reply"><Markdown text={hovered ? bubble.text : bubble.text.slice(0, bubble.revealed)} />{bubble.streaming && <span className="stream-caret">▍</span>}</div>
    {bubble.approval && <ApprovalCard key={bubble.approval.approvalId} card={bubble.approval} />}
    {bubble.toolStatus && <div className="bubble-tool-status" role="status">{bubble.toolStatus}</div>}
    {bubble.alarm && <button className="primary" onClick={() => { voiceRuntime.alarmUntil = 0; voiceRuntime.reaction = null; window.kite.dismissReminder(); update({ ...state.current, alarm: false }); }}>Dismiss reminder</button>}
    {bubble.vision && <div className="bubble-fallback">(looked using {bubble.vision})</div>}
    {bubble.fallback && <div className="bubble-fallback">(answered by {bubble.fallback})</div>}
    {bubble.voiceStatus && <div className="bubble-voice-status">{bubble.voiceStatus}</div>}
    {bubble.settings && <button className="primary" onClick={() => window.kite.openSettings()}>Open settings</button>}
    {bubble.transcript && <button className="ghost bubble-copy" aria-label="Copy reply" onClick={() => { void window.kite.copyText(displayText(bubble.text)); }}>Copy</button>}
    {!bubble.compact && <div className="bubble-keys">Tab to move · Esc to close</div>}
    </>}</div>
  </aside>;
}
