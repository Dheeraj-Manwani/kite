import { memo, useRef } from 'react';
import { config } from './config';
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
        <g ref={bows} fill="var(--kite-accent)">
          {config.tailDots.map(({ x, y, size }, index) => <rect key={index}
            x={x - size / 2} y={y - size / 2} width={size} height={size}
            transform={`rotate(12 ${x} ${y})`} />)}
        </g>
        <path d="M-5 -16 Q12 -7 20 9 Q4 7 -1 16 Q-10 11 -19 17 Q-17 -1 -5 -16 Z"
          transform={`scale(${config.bodyWidth / 39} ${config.bodyHeight / 33})`} fill="url(#kite-pink)" />
        <g ref={eyes} fill="var(--kite-spar)"><circle cx="-2.4" cy="-2" r=".85" /><circle cx="2.4" cy="-2" r=".85" /></g>
      </g>
  </svg>;
});
