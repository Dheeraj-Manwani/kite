import { StrictMode, lazy, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { KiteRenderer } from './kite/KiteRenderer';
import { SpeechBubble } from './voice/SpeechBubble';
import { runtime } from './kite/runtime';
import { react } from './voice/runtime';
import './styles.css';
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
  const [notice,setNotice]=useState('');
  useEffect(()=>{
    const settings=(s: import('../shared/types').SettingsSnapshot)=>{runtime.reducedMotion=s.settings.reducedMotion;document.documentElement.classList.toggle('reduce-motion',s.settings.reducedMotion);};
    void window.kite.getSettings().then(settings);const off=window.kite.onSettingsChanged(settings);
    let timer: ReturnType<typeof setTimeout>;
    const app=window.kite.onAppEvent(e=>{
      if(e.type==='paused'){document.documentElement.classList.add('kite-paused');setNotice('Paused — see you soon.');}
      if(e.type==='resumed'){document.documentElement.classList.remove('kite-paused');setNotice('Welcome back.');react('happy');}
      if(e.type==='update:ready'){setNotice('Update ready · Restart from the tray when you’re ready.');react('costume',.5);}
      if(e.type==='fault'){setNotice('Something went wrong. Try again, or open the logs from the tray.');react('tangled');}
      clearTimeout(timer);timer=setTimeout(()=>setNotice(''),6000);
    });return()=>{off();app();clearTimeout(timer);};
  },[]);
  return <main className="overlay"><Suspense fallback={null}><Annotation /></Suspense><Suspense fallback={null}><Board /></Suspense><Suspense fallback={null}><Task /></Suspense><Suspense fallback={null}><Guide /></Suspense><KiteRenderer /><SpeechBubble />
    {notice&&<div className="app-notice" role="status">{notice}</div>}
    {DevPanel&&<Suspense fallback={null}><DevPanel /></Suspense>}
  </main>;
}
function DesktopWindow(){
  const [view,setView]=useState(location.hash.slice(1));
  useEffect(()=>window.kite.onViewChange(v=>{location.hash=v;setView(v);}),[]);
  return <><nav className="window-nav" aria-label="Kite"><strong>◇ Kite</strong>{(['settings','history','onboarding'] as const).map(v=><button key={v} aria-current={view===v?'page':undefined} onClick={()=>{location.hash=v;setView(v);}}>{v==='onboarding'?'Tutorial':v==='history'?'History':'Settings'}</button>)}</nav>
    <Suspense fallback={<p className="loading">Opening Kite…</p>}>{view==='history'?<History/>:view==='onboarding'?<Onboarding/>:<Settings/>}</Suspense></>;
}
const isWindow=['settings','history','onboarding'].includes(location.hash.slice(1));
document.documentElement.dataset.view=isWindow?'settings':'overlay';
const root=document.getElementById('root');if(!root)throw new Error('Kite root missing');
createRoot(root).render(<StrictMode>{isWindow?<DesktopWindow/>:<Overlay/>}</StrictMode>);
