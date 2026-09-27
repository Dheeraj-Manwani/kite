import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { KiteView } from './components/KiteView';
import { SettingsView } from './components/SettingsView';
import { useCursorTracking } from './hooks/useCursorTracking';
import './styles.css';

function Overlay() {
  useCursorTracking();
  return <main className="overlay"><KiteView /></main>;
}
const isSettings = window.location.hash === '#settings';
document.documentElement.dataset.view = isSettings ? 'settings' : 'overlay';
const root = document.getElementById('root');
if (!root) throw new Error('Kite renderer root is missing');
createRoot(root).render(
  <StrictMode>{isSettings ? <SettingsView /> : <Overlay />}</StrictMode>,
);
