import { memo, useRef } from 'react';
import { config } from './config';
import { sailPath } from './sail';
import { useKiteLoop } from './useKiteLoop';

/** React owns the structure once; the sole rAF loop owns animated attributes, including the sail's shape. */
export const KiteRenderer = memo(function KiteRenderer() {
  const svg = useRef<SVGSVGElement>(null), body = useRef<SVGGElement>(null), sail = useRef<SVGPathElement>(null);
  const tail = useRef<SVGGElement>(null), eyes = useRef<SVGGElement>(null);
  useKiteLoop({ svg, body, sail, tail, eyes });
  return <svg ref={svg} className="kite-canvas" aria-label="Kite companion" role="img">
    <defs>
      <linearGradient id="kite-sail" x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="var(--kite-body)" /><stop offset="1" stopColor="var(--kite-shade)" />
      </linearGradient>
    </defs>
      <g ref={body}>
        <g ref={tail} className="kite-tail">{config.tailDots.map(({ x, y, size }) =>
          <rect key={`${x} ${y}`} x={x - size / 2} y={y - size / 2} width={size} height={size} rx={size * .2} transform={`rotate(12 ${x} ${y})`} />)}</g>
        <path ref={sail} className="kite-sail" d={sailPath(config.sail)} />
        <g ref={eyes} fill="#fff"><circle cx="-2.4" cy="-2" r=".85" /><circle cx="2.4" cy="-2" r=".85" /></g>
        <path className="kite-sparkle" d="M16 -17 L17.2 -13.2 L21 -12 L17.2 -10.8 L16 -7 L14.8 -10.8 L11 -12 L14.8 -13.2 Z" opacity="0" />
        <text className="kite-muted" x="14" y="-8" fontSize="10" opacity="0">🔇</text>
      </g>
  </svg>;
});
