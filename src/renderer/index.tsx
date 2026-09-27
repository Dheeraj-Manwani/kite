import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { KiteRenderer } from './kite/KiteRenderer';
import { SettingsView } from './components/SettingsView';
import './styles.css';

const DevPanel = import.meta.env.DEV ? lazy(() => import('./kite/DevPanel')) : null;
function Overlay() {
  return <main className="overlay"><KiteRenderer />
    {DevPanel && <Suspense fallback={null}><DevPanel /></Suspense>}
  </main>;
}
const isSettings = window.location.hash === '#settings';
document.documentElement.dataset.view = isSettings ? 'settings' : 'overlay';
const root = document.getElementById('root');
if (!root) throw new Error('Kite renderer root is missing');
createRoot(root).render(
  <StrictMode>{isSettings ? <SettingsView /> : <Overlay />}</StrictMode>,
);
