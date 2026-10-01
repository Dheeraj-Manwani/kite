import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { KiteStage, type StageCheer } from '../kite/KiteStage';
import type { PoseName } from '../kite/poses';
import { stageRuntime } from '../kite/stageLoop';
import { inkPath } from '../vision/ink';
import type { ScreenBounds, SettingsSnapshot } from '../../shared/types';
import { hotkeyLabel, modifiers, type Modifier } from '../../shared/release';
import { analyzeStrokes, type Stroke } from '../../shared/vision';
import { CheckIcon } from '../icons';
import { HotkeyRecorder } from './HotkeyRecorder';
import { Keycaps } from './Keycaps';
import { KeysStep, missingKeys } from './KeysStep';
const steps = ['Hello, I’m Kite', 'Let me hear you', 'Bring your keys', 'Find your voice shortcut', 'Your first question', 'Circle to ask', 'Make yourself at home'];
const labels = ['Welcome', 'Microphone', 'Keys', 'Shortcut', 'First question', 'Circle to ask', 'Finish'];
// The stage is tall where the character is the point, and short where a form leads (UX-60).
const stageHeights = [190, 140, 84, 140, 140, 140, 190];
// The practice chart's plot, in the canvas's own units: a circle counts when it takes in some of it (UX-64).
const CHART: ScreenBounds = { x: 65, y: 55, width: 375, height: 135 };
const overlaps = (a: ScreenBounds, b: ScreenBounds) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
type Mic = { state: 'starting' | 'listening' | 'heard' | 'blocked' | 'failed'; device?: string };
export default function Onboarding() {
  const [step, setStep] = useState(0), [snapshot, setSnapshot] = useState<SettingsSnapshot>(), [mic, setMic] = useState<Mic>({ state: 'starting' }), [heard, setHeard] = useState(false), [answer, setAnswer] = useState('');
  const [ink, setInk] = useState<Stroke>([]), [practice, setPractice] = useState<'idle' | 'almost' | 'done'>('idle');
  const [held, setHeld] = useState<Modifier[]>([]), [cheer, setCheer] = useState<StageCheer | null>(null), [talk, setTalk] = useState<PoseName>('rest');
  const cleanup = useRef<() => void>(() => undefined), stroke = useRef<Stroke | null>(null), micGeneration = useRef(0), heldBefore = useRef(0);
  const cheerNow = (kind: StageCheer['kind']) => setCheer({ kind, at: performance.now() });
  useEffect(() => { void window.kite.getSettings().then(setSnapshot); const a=window.kite.onSettingsChanged(setSnapshot), b=window.kite.onAppEvent(e => { if(e.type==='hotkey:detected') setHeard(true); });
    const c=window.kite.onVoiceEvent(e => { if(e.type==='ptt:start')setAnswer('');if(e.type==='llm:delta')setAnswer(s=>s+(e.text??'')); });
    return () => { a();b();c();micGeneration.current++;cleanup.current(); }; }, []);
  // Welcome: once the kite has flown in up its string, it flutters hello (personality.md §5.7).
  useEffect(() => { if (step !== 0) return; const timer = setTimeout(() => cheerNow('flutter'), 1100); return () => clearTimeout(timer); }, [step]);
  // The microphone check starts by itself, and the stage kite listens: its tail is the level meter (UX-62, personality.md §5.2).
  const checkMic = async () => {
    cleanup.current();
    const generation = ++micGeneration.current;
    setMic({ state: 'starting' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio:true});
      if (generation !== micGeneration.current) { stream.getTracks().forEach(t => t.stop()); return; }
      const device = stream.getAudioTracks()[0]?.label || 'your microphone';
      const ctx = new AudioContext(), analyser=ctx.createAnalyser(); analyser.fftSize=256;ctx.createMediaStreamSource(stream).connect(analyser);
      const samples=new Float32Array(256);
      let frame=0, voiced=0, last=performance.now(), confirmed=false;
      setMic({ state: 'listening', device });
      const tick=(now:number)=>{
        analyser.getFloatTimeDomainData(samples);
        const level=Math.min(1,Math.sqrt(samples.reduce((n,x)=>n+x*x,0)/samples.length)*7);
        stageRuntime.level=level;
        if(level>.06) voiced+=now-last;
        last=now;
        // About a second of voice is enough to know the microphone works.
        if(!confirmed&&voiced>1000){ confirmed=true; setMic({ state: 'heard', device }); setCheer({ kind: 'flutter', at: now }); }
        frame=requestAnimationFrame(tick);
      };
      frame=requestAnimationFrame(tick);
      cleanup.current=()=>{cancelAnimationFrame(frame);stream.getTracks().forEach(t=>t.stop());void ctx.close();stageRuntime.level=0;cleanup.current=()=>undefined;};
    } catch (error) { if (generation === micGeneration.current) setMic({ state: (error as { name?: string })?.name === 'NotAllowedError' ? 'blocked' : 'failed' }); }
  };
  useEffect(() => { stroke.current=null; stageRuntime.pen=null; if(step===1) void checkMic(); else { micGeneration.current++; cleanup.current(); } }, [step]);
  // The shortcut step lights each key while it is held; the kite perks per key and flutters when the chord lands (UX-63).
  useEffect(() => {
    if (step !== 3) return;
    const read = (e: KeyboardEvent) => setHeld(modifiers.filter(m => e.getModifierState(m)));
    const clear = () => setHeld([]);
    window.addEventListener('keydown', read); window.addEventListener('keyup', read); window.addEventListener('blur', clear);
    return () => { window.removeEventListener('keydown', read); window.removeEventListener('keyup', read); window.removeEventListener('blur', clear); };
  }, [step]);
  const hotkey = snapshot?.settings.hotkey ?? ['Control', 'Meta'];
  const chord = hotkey.length > 0 && hotkey.every(k => held.includes(k));
  useEffect(() => { if (held.length > heldBefore.current) cheerNow('perk'); heldBefore.current = held.length; }, [held]);
  useEffect(() => { if (chord) setHeard(true); }, [chord]);
  useEffect(() => { if (heard) cheerNow('flutter'); }, [heard]);
  // The first question: the stage kite listens, nods, thinks, and talks along with the real thing (personality.md §5.7).
  useEffect(() => {
    if (step !== 4) return;
    const off = window.kite.onVoiceEvent(e => {
      if (e.type === 'ptt:start') setTalk('listening');
      else if (e.type === 'ptt:stop') { setTalk('thinking'); cheerNow('nod'); }
      // Each streamed piece of the reply is a pulse on the tail, the way speech moves it in the overlay.
      else if (e.type === 'llm:delta') { setTalk('talking'); stageRuntime.level = .8; }
      else if (e.type === 'llm:done' || e.type === 'ptt:cancel' || e.type === 'voice:aborted') setTalk('rest');
      else if (e.type === 'ptt:tooShort' || e.type === 'voice:empty') { setTalk('rest'); cheerNow('puzzled'); }
      else if (e.type === 'llm:error') { setTalk('rest'); cheerNow('tangled'); }
    });
    return () => { off(); setTalk('rest'); };
  }, [step]);
  // Circle to ask: the same pen-like ink as the overlay, and the kite flies down to draw with its nose (UX-64).
  const canvasPoint = (e: PointerEvent<SVGSVGElement>) => { const r=e.currentTarget.getBoundingClientRect(); return { x:(e.clientX-r.x)*500/r.width, y:(e.clientY-r.y)*240/r.height, t:performance.now() }; };
  const startInk = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* a pointer that is already gone can't be captured */ }
    stroke.current = [canvasPoint(e)]; setInk([...stroke.current]); setPractice('idle'); stageRuntime.pen = { x: e.clientX, y: e.clientY };
  };
  const moveInk = (e: PointerEvent<SVGSVGElement>) => {
    const s = stroke.current; if (!s) return;
    stageRuntime.pen = { x: e.clientX, y: e.clientY };
    const p = canvasPoint(e), last = s[s.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) >= 1) { s.push(p); setInk([...s]); }
  };
  const endInk = () => {
    const s = stroke.current; stroke.current = null; stageRuntime.pen = null;
    const mark = s && analyzeStrokes([s]).marks[0];
    if (!mark || mark.markType === 'tap') { setPractice('idle'); return; }
    const around = mark.markType === 'enclosure' && overlaps(mark.region, CHART);
    setPractice(around ? 'done' : 'almost');
    if (around) cheerNow('flutter');
  };
  const missing = step === 2 ? missingKeys(snapshot) : [];
  const finish=async()=>{const result=await window.kite.updateSettings({onboardingComplete:true});if(result.ok)window.kite.openView('settings');};
  // "Let's fly": the window closes, and the overlay's kite loops from where this one was over to the cursor (K-07).
  const fly=async()=>{const result=await window.kite.updateSettings({onboardingComplete:true});if(result.ok)window.kite.letsFly({...stageRuntime.kite});};
  const stagePose: PoseName = step === 1 ? (mic.state === 'listening' || mic.state === 'heard' ? 'listening' : mic.state === 'starting' ? 'rest' : 'lost')
    : step === 4 ? talk : step === 6 ? 'approved' : 'rest';
  return <main className="onboarding"><KiteStage height={stageHeights[step]} pose={stagePose} cheer={cheer} meter={step===1&&mic.state==='listening'} reduced={snapshot?.settings.reducedMotion ?? false} /><div className="onboarding-body">
    <div className="onboarding-progress" aria-label={`Step ${step+1} of 7`}><span className="progress-dots">{steps.map((s,i)=><i key={s} className={i<step?'done':i===step?'current':''}/>)}</span>{step+1} of 7 · {labels[step]}</div>
    <h1>{steps[step]}</h1>
    {step===0&&<><p>I’m a little company beside your cursor. Hold a shortcut to talk, or circle something on your screen and ask about it.</p><p>Your keys stay on this computer. I ask before taking actions or looking at your screen.</p></>}
    {step===1&&<><p>I listen only while you hold your shortcut. This check stays on your computer.</p>
      <p className={`step-status ${mic.state}`} role="status">{
        mic.state==='starting' ? 'Opening your microphone…'
        : mic.state==='listening' ? <>Say something. My tail follows your voice.<small>Using {mic.device}</small></>
        : mic.state==='heard' ? <><CheckIcon />I can hear you.<small>Using {mic.device}</small></>
        : mic.state==='blocked' ? 'I can’t use your microphone. Allow desktop apps in Windows Settings → Privacy & security → Microphone.'
        : 'I couldn’t open your microphone. Check the input device, then try again.'}</p>
      {(mic.state==='blocked'||mic.state==='failed')&&<button onClick={()=>void checkMic()}>Try again</button>}</>}
    {step===2&&snapshot&&<><p>Keys stay encrypted on this computer.</p><KeysStep snapshot={snapshot} /></>}
    {step===3&&snapshot&&<><p>Hold your shortcut now, then let go.</p>
      <div className="big-keys" aria-hidden="true">{hotkey.map(k=><kbd key={k} className={`big-key${held.includes(k)?' lit':''}`}>{hotkeyLabel([k])}</kbd>)}{heard&&<span className="big-check"><CheckIcon /></span>}</div>
      <p className={`step-status${heard?' heard':''}`} role="status">{heard?'Nice — I felt that!':'Waiting for your shortcut…'}</p>
      <HotkeyRecorder suppressVoice compact value={hotkey} change={value=>void window.kite.updateSettings({hotkey:value})}/></>}
    {step===4&&<><p>Hold your shortcut and say <strong>“Ask me what I can do.”</strong> Then release. Your answer appears beside Kite.</p>{!snapshot?.keys.groq&&<p>Add a Groq key in the previous step to continue with voice.</p>}<blockquote aria-live="polite">{answer||'Your first answer will appear here.'}</blockquote></>}
    {step===5&&<><p>Practice here: draw a circle around the rising chart. In other apps, hold your voice shortcut, wait for the crosshair, then mark and ask “what does this mean?”</p>
      <svg className="tutorial-canvas" viewBox="0 0 500 240" onPointerDown={startInk} onPointerMove={moveInk} onPointerUp={endInk} onPointerCancel={endInk}>
        <rect width="500" height="240" rx="8" fill="var(--surface-subtle)"/><text x="30" y="35" fill="var(--text)">A little growth, every day</text><path d="M65 190H440M65 60V190" stroke="var(--text-muted)" fill="none"/><path d="M85 170L150 145L220 155L290 100L360 115L420 70" stroke="var(--text)" strokeWidth="5" fill="none"/>
        <path className="practice-ink" d={inkPath(ink)} />
      </svg>
      <p className={`step-status${practice==='done'?' heard':''}`} role="status">{
        practice==='done' ? <><CheckIcon />That’s it.<small>Marks tell me exactly what “this” means. This practice stays on your computer.</small></>
        : practice==='almost' ? 'Almost. Draw all the way round the chart, and end where you started.'
        : 'Circle the chart with your pointer.'}</p></>}
    {step===6&&snapshot&&<><p>You’re ready. Here’s what to remember. Settings, history, and pause are in the tray.</p>
      <dl className="cheat-sheet">
        <div><dt><Keycaps keys={hotkey} /></dt><dd>Hold to talk. Let go to send.</dd></div>
        <div><dt>Hold, then draw</dt><dd>Circle something on your screen, then ask about it.</dd></div>
        <div><dt><kbd className="keycap">Esc</kbd></dt><dd>Cancel</dd></div>
        {snapshot.settings.guideMode&&<div><dt>“How do I…?”</dt><dd>Ask, and I’ll show you the way one step at a time.</dd></div>}
      </dl>
      {(['ttsEnabled','launchOnStartup','reducedMotion'] as const).map(k=><label className="settings-toggle" key={k}><input type="checkbox" checked={snapshot.settings[k]} onChange={e=>void window.kite.updateSettings({[k]:e.target.checked})}/>{k==='ttsEnabled'?'Speak replies (requires Cartesia and a voice)':k==='launchOnStartup'?'Launch on startup':'Reduce motion'}</label>)}</>}
    {missing.length>0&&<p className="step-missing" role="status">Still needed: {missing.join(' and ')}. You can add them later in Settings.</p>}
    <footer>{step>0&&<button className="ghost" onClick={()=>setStep(s=>s-1)}>Back</button>}<span className="spacer" />{step<6&&<button className="link" onClick={()=>void finish()}>Finish later</button>}
      {step<6?<button className="primary" onClick={()=>setStep(s=>s+1)}>{missing.length?'Continue anyway':'Continue'}</button>:<button className="primary" onClick={()=>void fly()}>Let’s fly</button>}</footer>
  </div></main>;
}
