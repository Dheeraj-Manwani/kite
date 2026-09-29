import { useEffect, useRef, useState } from 'react';
import type { SettingsSnapshot } from '../../shared/types';
import { hotkeyLabel } from '../../shared/release';
import { HotkeyRecorder } from './HotkeyRecorder';
import { SettingsView } from './SettingsView';
const steps = ['Hello, I’m Kite', 'Let me hear you', 'Bring your keys', 'Find your voice shortcut', 'Your first question', 'Circle to ask', 'Make yourself at home'];
export default function Onboarding() {
  const [step, setStep] = useState(0), [snapshot, setSnapshot] = useState<SettingsSnapshot>(), [mic, setMic] = useState('Not checked'), [heard, setHeard] = useState(false), [answer, setAnswer] = useState('');
  const [ink, setInk] = useState<{x:number;y:number}[]>([]), [marked, setMarked] = useState(false);
  const meter = useRef<SVGPathElement>(null), cleanup = useRef<() => void>(() => undefined), drawing = useRef(false);
  useEffect(() => { void window.kite.getSettings().then(setSnapshot); const a=window.kite.onSettingsChanged(setSnapshot), b=window.kite.onAppEvent(e => { if(e.type==='hotkey:detected') setHeard(true); });
    const c=window.kite.onVoiceEvent(e => { if(e.type==='ptt:start')setAnswer('');if(e.type==='llm:delta')setAnswer(s=>s+(e.text??'')); });
    return () => { a();b();c();cleanup.current(); }; }, []);
  useEffect(()=>{window.kite.setHotkeyRecording(step===3);return()=>window.kite.setHotkeyRecording(false);},[step]);
  useEffect(() => { if(step!==1)cleanup.current(); }, [step]);
  const checkMic = async () => {
    cleanup.current();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio:true}); const ctx = new AudioContext(), analyser=ctx.createAnalyser(); analyser.fftSize=256;ctx.createMediaStreamSource(stream).connect(analyser);
      const samples=new Float32Array(256);let frame=0;setMic('Microphone ready — say something and watch the string.');
      const tick=()=>{analyser.getFloatTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((n,x)=>n+x*x,0)/samples.length), a=Math.min(28,rms*200);
        meter.current?.setAttribute('d',`M 30 50 Q 95 ${50-a} 160 50 T 290 50`);frame=requestAnimationFrame(tick);};tick();
      cleanup.current=()=>{cancelAnimationFrame(frame);stream.getTracks().forEach(t=>t.stop());void ctx.close();cleanup.current=()=>undefined;};
    }catch{setMic('Microphone blocked. Enable desktop microphone access in Windows Privacy & security, then retry.');}
  };
  const finish=async()=>{const result=await window.kite.updateSettings({onboardingComplete:true});if(result.ok)window.kite.openView('settings');};
  return <main className="onboarding"><div className="onboarding-progress" aria-label={`Step ${step+1} of 7`}>{steps.map((s,i)=><span key={s} className={i<=step?'done':''}/>)}</div><div className="welcome-kite" aria-hidden="true">◇<span>⌁</span></div><h1>{steps[step]}</h1>
    {step===0&&<><p>I’m a little company beside your cursor. Hold a shortcut to talk, or circle something on your screen and ask about it.</p><p>Your keys stay on this computer. I ask before taking actions or looking at your screen.</p></>}
    {step===1&&<><p>I listen only while you hold your shortcut. This check uses the microphone locally; nothing is sent.</p><svg viewBox="0 0 320 100" role="img" aria-label="Live microphone level"><path ref={meter} d="M30 50H290" stroke="var(--kite-accent)" strokeWidth="3" fill="none"/></svg><button onClick={()=>void checkMic()}>Check microphone</button><p role="status">{mic}</p></>}
    {step===2&&<><p>Groq powers speech recognition. Add a model provider for replies; Cartesia adds spoken replies. Test each key below.</p><SettingsView onboarding /></>}
    {step===3&&snapshot&&<><p>Hold <strong>{hotkeyLabel(snapshot.settings.hotkey)}</strong> now, then release.</p><p role="status">{heard?'Nice — I felt that! ✦':'Waiting for your shortcut…'}</p><HotkeyRecorder value={snapshot.settings.hotkey} change={hotkey=>void window.kite.updateSettings({hotkey})}/></>}
    {step===4&&<><p>Hold your shortcut and say <strong>“Ask me what I can do.”</strong> Then release. Your answer appears beside Kite.</p>{!snapshot?.keys.groq&&<p>Add a Groq key in the previous step to continue with voice.</p>}<blockquote aria-live="polite">{answer||'Your first answer will appear here.'}</blockquote></>}
    {step===5&&<><p>Practice here: draw a circle around the rising chart. In other apps, hold your voice shortcut, wait for the crosshair, then mark and ask “what does this mean?”</p>
      <svg className="tutorial-canvas" viewBox="0 0 500 240" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);drawing.current=true;setInk([]);}} onPointerMove={e=>{if(!drawing.current)return;const r=e.currentTarget.getBoundingClientRect();setInk(p=>[...p,{x:(e.clientX-r.x)*500/r.width,y:(e.clientY-r.y)*240/r.height}]);}} onPointerUp={()=>{drawing.current=false;setMarked(ink.length>8);}}>
        <rect width="500" height="240" rx="16" fill="#ecf5f4"/><text x="30" y="35" fill="#173f48">A little growth, every day</text><path d="M65 190H440M65 60V190" stroke="#78959b" fill="none"/><path d="M85 170L150 145L220 155L290 100L360 115L420 70" stroke="#147d80" strokeWidth="5" fill="none"/>
        <polyline points={ink.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="#da713b" strokeWidth="4"/>
      </svg><p role="status">{marked?'That’s it. Marks tell me exactly what “this” means. This practice stays local.':'Circle the chart with your pointer.'}</p></>}
    {step===6&&snapshot&&<><p>You’re ready. Find settings, history, pause, and help in the tray.</p>{(['ttsEnabled','launchOnStartup','reducedMotion'] as const).map(k=><label className="settings-toggle" key={k}><input type="checkbox" checked={snapshot.settings[k]} onChange={e=>void window.kite.updateSettings({[k]:e.target.checked})}/>{k==='ttsEnabled'?'Speak replies (requires Cartesia and a voice)':k==='launchOnStartup'?'Launch on startup':'Reduce motion'}</label>)}</>}
    <footer><button disabled={step===0} onClick={()=>setStep(s=>s-1)}>Back</button>{step<6?<button onClick={()=>setStep(s=>s+1)}>Continue</button>:<button onClick={()=>void finish()}>Let’s fly</button>}<button className="quiet-button" onClick={()=>void finish()}>Finish later in Settings</button></footer>
  </main>;
}
