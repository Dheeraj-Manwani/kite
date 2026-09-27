import { useKiteStore } from '../store/kite';

export function KiteView() {
  const { cursorPosition, hasCursor, mood } = useKiteStore();
  return <div className="kite-position" data-mood={mood}
    style={{ transform: `translate(${cursorPosition.x + 36}px, ${cursorPosition.y - 40}px)`, visibility: hasCursor ? 'visible' : 'hidden' }}>
    <div className="kite-float" role="img" aria-label="Kite, idle"
      onPointerEnter={() => window.kite.setOverlayInteractive(true)}
      onPointerLeave={() => window.kite.setOverlayInteractive(false)}>
      <svg viewBox="0 0 64 96" aria-hidden="true">
        <path d="M32 57 C12 72 52 76 30 94" fill="none" stroke="#95c6cf" strokeWidth="2" />
        <path d="M32 3 L58 25 L32 60 L6 25 Z" fill="#6dd3c5" stroke="#c5f5ed" strokeWidth="1.5" />
        <path d="M32 3 L32 60 L6 25 Z" fill="#4b91b3" />
        <path d="M6 25 L58 25 M32 3 L32 60" stroke="#e1fff8" strokeOpacity=".65" strokeWidth="1" />
        <path d="M24 76 L34 81 L23 84 Z" fill="#efba86" />
      </svg>
    </div>
  </div>;
}
