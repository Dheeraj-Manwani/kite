import { StrictMode, lazy, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { KiteRenderer } from './kite/KiteRenderer';
import { SailMark } from './kite/SailMark';
import { Working } from './icons';
import { sections, type Section } from './components/sections';
import { SpeechBubble } from './voice/SpeechBubble';
import { AppNotices } from './voice/AppNotices';
import { runtime } from './kite/runtime';
import { applyKitePreferences } from './kite/config';
import { useSettings } from './hooks/useSettings';
import { earcons } from './voice/earcons';
import './tokens.css';
import './kite.css';
import './styles/index.css';
import './logging';
const Annotation = lazy(() => import('./vision/Annotation').then(m => ({ default: m.Annotation })));
const Guide = lazy(() => import('./guide/GuideLayer').then(m => ({ default: m.GuideLayer })));
const Board = lazy(() => import('./board/BoardLayer').then(m => ({ default: m.BoardLayer })));
const Task = lazy(() => import('./agent/TaskLayer').then(m => ({ default: m.TaskLayer })));
const Settings = lazy(() => import('./components/SettingsView').then(m => ({ default: m.SettingsView })));
const History = lazy(() => import('./components/HistoryView'));
const Onboarding = lazy(() => import('./components/Onboarding'));
const DevPanel = import.meta.env.DEV ? lazy(() => import('./kite/DevPanel')) : null;
function Overlay() {
  useEffect(()=>{
    // The kite's size (K-14), liveliness and color (K-15), and sound cues (K-13) apply live, without a re-render.
    const settings=(s: import('../shared/types').SettingsSnapshot)=>{runtime.reducedMotion=s.settings.reducedMotion;document.documentElement.classList.toggle('reduce-motion',s.settings.reducedMotion);applyKitePreferences(s.settings);earcons.enabled=!!s.settings.earcons;};
    void window.kite.getSettings().then(settings);const off=window.kite.onSettingsChanged(settings);
    // Keyboard controls (tray, or Ctrl + Alt + K): focus the first control on screen. With nothing to control,
    // hand focus straight back so the user's typing never disappears into a transparent window. Esc also hands it back.
    const focused=()=>{
      document.documentElement.classList.add('overlay-focused');
      requestAnimationFrame(()=>{
        const target=[...document.querySelectorAll<HTMLElement>('.overlay button:not(:disabled), .overlay summary')].find(el=>el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}));
        if(target)target.focus();else window.kite.releaseOverlay();
      });
    };
    const blurred=()=>document.documentElement.classList.remove('overlay-focused');
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')window.kite.releaseOverlay();};
    window.addEventListener('focus',focused);window.addEventListener('blur',blurred);window.addEventListener('keydown',escape);
    return()=>{off();window.removeEventListener('focus',focused);window.removeEventListener('blur',blurred);window.removeEventListener('keydown',escape);};
  },[]);
  return <main className="overlay"><Suspense fallback={null}><Annotation /></Suspense><Suspense fallback={null}><Board /></Suspense><Suspense fallback={null}><Task /></Suspense><Suspense fallback={null}><Guide /></Suspense><KiteRenderer /><SpeechBubble /><AppNotices />
    {DevPanel&&<Suspense fallback={null}><DevPanel /></Suspense>}
  </main>;
}
// Settings sections and History share one sidebar; onboarding hides it, since setup is a guided path (UX-50, UX-60).
function DesktopWindow(){
  const [view,setView]=useState(location.hash.slice(1)||'settings');
  const [section,setSection]=useState<Section>('general');
  useEffect(()=>window.kite.onViewChange(v=>{location.hash=v;setView(v);}),[]);
  // The onboarding stage's kite wears the chosen color and liveliness too (K-15); it keeps its own sizes.
  const prefs=useSettings();
  useEffect(()=>{if(prefs)applyKitePreferences(prefs.settings,{size:false});},[prefs]);
  const current=view==='history'?'History':sections.find(s=>s.id===section)?.label??'Settings';
  // The window title names the view, so the taskbar and Alt+Tab say where you are.
  useEffect(()=>{document.title=view==='onboarding'?'Set up Kite':`Kite · ${current}`;},[view,current]);
  const go=(next:string,to?:Section)=>{location.hash=next;setView(next);if(to)setSection(to);};
  const content=<Suspense fallback={<p className="loading"><Working text="Opening Kite…" /></p>}>{view==='history'?<History/>:view==='onboarding'?<Onboarding/>:<Settings section={section}/>}</Suspense>;
  if(view==='onboarding')return content;
  return <div className="window-layout">
    <nav className="window-sidebar" aria-label="Kite">
      <div className="sidebar-brand"><SailMark size={18} />Kite</div>
      {sections.map(s=><button key={s.id} className="side-item" aria-current={view==='settings'&&section===s.id?'page':undefined} onClick={()=>go('settings',s.id)}>{s.label}</button>)}
      <hr />
      <button className="side-item" aria-current={view==='history'?'page':undefined} onClick={()=>go('history')}>History</button>
    </nav>
    <div className="window-content">{content}</div>
  </div>;
}
const isWindow=['settings','history','onboarding'].includes(location.hash.slice(1));
document.documentElement.dataset.view=isWindow?'settings':'overlay';
if(isWindow&&new URLSearchParams(location.search).has('mica'))document.documentElement.classList.add('mica');
const root=document.getElementById('root');if(!root)throw new Error('Kite root missing');
createRoot(root).render(<StrictMode>{isWindow?<DesktopWindow/>:<Overlay/>}</StrictMode>);
