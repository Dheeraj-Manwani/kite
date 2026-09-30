import { useEffect, useRef, useState } from 'react';
import { KiteStage, type StageCheer } from '../kite/KiteStage';
import type { SettingsSnapshot } from '../../shared/types';
import { hotkeyLabel, modifiers, type Modifier } from '../../shared/release';
import { CheckIcon } from '../icons';
import { HotkeyRecorder } from './HotkeyRecorder';
import { KeysStep, missingKeys } from './KeysStep';
const steps = ['Hello, I’m Kite', 'Let me hear you', 'Bring your keys', 'Find your voice shortcut', 'Your first question', 'Circle to ask', 'Make yourself at home'];
const labels = ['Welcome', 'Microphone', 'Keys', 'Shortcut', 'First question', 'Circle to ask', 'Finish'];
// The stage is tall where the character is the point, and short where a form leads (UX-60).
const stageHeights = [190, 140, 84, 140, 140, 140, 190];
type Mic = { state: 'starting' | 'listening' | 'heard' | 'blocked' | 'failed'; device?: string };
export default function Onboarding() {
  const [step, setStep] = useState(0), [snapshot, setSnapshot] = useState<SettingsSnapshot>(), [mic, setMic] = useState<Mic>({ state: 'starting' }), [heard, setHeard] = useState(false), [answer, setAnswer] = useState('');
  const [ink, setInk] = useState<{x:number;y:number}[]>([]), [marked, setMarked] = useState(false);
  const [held, setHeld] = useState<Modifier[]>([]), [cheer, setCheer] = useState<StageCheer | null>(null);
  const tail = useRef<SVGGElement>(null), cleanup = useRef<() => void>(() => undefined), drawing = useRef(false), micGeneration = useRef(0), heldBefore = useRef(0);
  useEffect(() => { void window.kite.getSettings().then(setSnapshot); const a=window.kite.onSettingsChanged(setSnapshot), b=window.kite.onAppEvent(e => { if(e.type==='hotkey:detected') setHeard(true); });
    const c=window.kite.onVoiceEvent(e => { if(e.type==='ptt:start')setAnswer('');if(e.type==='llm:delta')setAnswer(s=>s+(e.text??'')); });
    return () => { a();b();c();micGeneration.current++;cleanup.current(); }; }, []);
  // The microphone check starts by itself, and the kite's tail is its level meter, later dots lagging behind (UX-62).
  const checkMic = async () => {
    cleanup.current();
    const generation = ++micGeneration.current;
    setMic({ state: 'starting' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio:true});
      if (generation !== micGeneration.current) { stream.getTracks().forEach(t => t.stop()); return; }
      const device = stream.getAudioTracks()[0]?.label || 'your microphone';
      const ctx = new AudioContext(), analyser=ctx.createAnalyser(); analyser.fftSize=256;ctx.createMediaStreamSource(stream).connect(analyser);
      const samples=new Float32Array(256), levels=[0,0,0];
      let frame=0, voiced=0, last=performance.now(), confirmed=false;
      setMic({ state: 'listening', device });
      const tick=(now:number)=>{
        analyser.getFloatTimeDomainData(samples);
        const level=Math.min(1,Math.sqrt(samples.reduce((n,x)=>n+x*x,0)/samples.length)*7);
        levels[0]+=(level-levels[0])*.5; levels[1]+=(levels[0]-levels[1])*.25; levels[2]+=(levels[1]-levels[2])*.25;
        levels.forEach((value,i)=>tail.current?.style.setProperty(`--l${i+1}`,value.toFixed(3)));
        if(level>.06) voiced+=now-last;
        last=now;
        // About a second of voice is enough to know the microphone works.
        if(!confirmed&&voiced>1000){ confirmed=true; setMic({ state: 'heard', device }); setCheer({ kind: 'happy', at: now }); }
        frame=requestAnimationFrame(tick);
      };
      frame=requestAnimationFrame(tick);
      cleanup.current=()=>{cancelAnimationFrame(frame);stream.getTracks().forEach(t=>t.stop());void ctx.close();cleanup.current=()=>undefined;};
    } catch (error) { if (generation === micGeneration.current) setMic({ state: (error as { name?: string })?.name === 'NotAllowedError' ? 'blocked' : 'failed' }); }
  };
  useEffect(() => { if(step===1) void checkMic(); else { micGeneration.current++; cleanup.current(); } }, [step]);
  // The shortcut step lights each key while it is held; the kite perks per key and cheers when the chord lands (UX-63).
  useEffect(() => {
    if (step !== 3) return;
    const read = (e: KeyboardEvent) => setHeld(modifiers.filter(m => e.getModifierState(m)));
    const clear = () => setHeld([]);
    window.addEventListener('keydown', read); window.addEventListener('keyup', read); window.addEventListener('blur', clear);
    return () => { window.removeEventListener('keydown', read); window.removeEventListener('keyup', read); window.removeEventListener('blur', clear); };
  }, [step]);
  const hotkey = snapshot?.settings.hotkey ?? ['Control', 'Meta'];
  const chord = hotkey.length > 0 && hotkey.every(k => held.includes(k));
  useEffect(() => { if (held.length > heldBefore.current) setCheer({ kind: 'perk', at: performance.now() }); heldBefore.current = held.length; }, [held]);
  useEffect(() => { if (chord) setHeard(true); }, [chord]);
  useEffect(() => { if (heard) setCheer({ kind: 'happy', at: performance.now() }); }, [heard]);
  const missing = step === 2 ? missingKeys(snapshot) : [];
  const finish=async()=>{const result=await window.kite.updateSettings({onboardingComplete:true});if(result.ok)window.kite.openView('settings');};
  return <main className="onboarding"><KiteStage height={stageHeights[step]} tail={tail} cheer={cheer} /><div className="onboarding-body">
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
      <svg className="tutorial-canvas" viewBox="0 0 500 240" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);drawing.current=true;setInk([]);}} onPointerMove={e=>{if(!drawing.current)return;const r=e.currentTarget.getBoundingClientRect();setInk(p=>[...p,{x:(e.clientX-r.x)*500/r.width,y:(e.clientY-r.y)*240/r.height}]);}} onPointerUp={()=>{drawing.current=false;setMarked(ink.length>8);}}>
        <rect width="500" height="240" rx="16" fill="var(--surface-subtle)"/><text x="30" y="35" fill="var(--text)">A little growth, every day</text><path d="M65 190H440M65 60V190" stroke="var(--text-muted)" fill="none"/><path d="M85 170L150 145L220 155L290 100L360 115L420 70" stroke="var(--text)" strokeWidth="5" fill="none"/>
        <polyline points={ink.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--sun)" strokeWidth="4"/>
      </svg><p role="status">{marked?'That’s it. Marks tell me exactly what “this” means. This practice stays local.':'Circle the chart with your pointer.'}</p></>}
    {step===6&&snapshot&&<><p>You’re ready. Find settings, history, pause, and help in the tray.</p>{(['ttsEnabled','launchOnStartup','reducedMotion'] as const).map(k=><label className="settings-toggle" key={k}><input type="checkbox" checked={snapshot.settings[k]} onChange={e=>void window.kite.updateSettings({[k]:e.target.checked})}/>{k==='ttsEnabled'?'Speak replies (requires Cartesia and a voice)':k==='launchOnStartup'?'Launch on startup':'Reduce motion'}</label>)}</>}
    {missing.length>0&&<p className="step-missing" role="status">Still needed: {missing.join(' and ')}. You can add them later in Settings.</p>}
    <footer>{step>0&&<button className="ghost" onClick={()=>setStep(s=>s-1)}>Back</button>}<span className="spacer" /><button className="link" onClick={()=>void finish()}>Finish later</button>
      {step<6?<button className="primary" onClick={()=>setStep(s=>s+1)}>{missing.length?'Continue anyway':'Continue'}</button>:<button className="primary" onClick={()=>void finish()}>Let’s fly</button>}</footer>
  </div></main>;
}
