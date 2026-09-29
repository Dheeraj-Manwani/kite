import { memo, useRef } from 'react';
import { useKiteLoop } from './useKiteLoop';

/** React owns the structure once; the sole rAF loop owns animated attributes. */
export const KiteRenderer = memo(function KiteRenderer() {
  const svg = useRef<SVGSVGElement>(null), body = useRef<SVGGElement>(null);
  const bows = useRef<SVGGElement>(null), eyes = useRef<SVGGElement>(null);
  useKiteLoop({ svg, body, bows, eyes });
  return <svg ref={svg} className="kite-canvas" aria-label="Kite companion" role="img">
    <defs>
      <linearGradient id="kite-pink" x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="var(--kite-body)" /><stop offset="1" stopColor="var(--kite-shade)" />
      </linearGradient>
    </defs>
      <g ref={body}>
        <path d="M0 -22 L19 -3 L0 24 L-19 -3 Z" fill="url(#kite-pink)" stroke="var(--kite-outline)" strokeWidth="1.5" />
        <path d="M0 -22V24M-19 -3H19" fill="none" stroke="var(--kite-spar)" strokeWidth="1.1" opacity=".8" />
        <path d="M0 -22L19 -3H0Z" fill="var(--kite-accent)" opacity=".85" />
        <g ref={bows}><path d="M0 24Q-7 32 1 38T2 54" fill="none" stroke="var(--kite-spar)" strokeWidth="1.2" />
        <path d="M-7 34L2 38L-7 42ZM11 34L2 38L11 42ZM-6 48L2 52L-6 56ZM10 48L2 52L10 56Z" fill="var(--kite-accent)" stroke="var(--kite-outline)" strokeWidth=".7" /></g>
        <g ref={eyes} fill="var(--kite-spar)"><circle cx="-2.4" cy="-2" r=".85" /><circle cx="2.4" cy="-2" r=".85" /></g>
        <path className="kite-sparkle" d="M28 -25 L30 -19 L36 -17 L30 -15 L28 -9 L26 -15 L20 -17 L26 -19 Z" fill="#ffd577" opacity="0" />
        <text className="kite-muted" x="23" y="-15" fontSize="12" opacity="0">🔇</text>
      </g>
  </svg>;
});
