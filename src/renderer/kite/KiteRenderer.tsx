import { memo, useRef } from 'react';
import { config } from './config';
import { sailPath } from './sail';
import { useKiteLoop } from './useKiteLoop';

/** React owns the structure once; the sole rAF loop owns animated attributes, including the sail's shape. */
export const KiteRenderer = memo(function KiteRenderer() {
  const svg = useRef<SVGSVGElement>(null), body = useRef<SVGGElement>(null), sail = useRef<SVGPathElement>(null);
  const tail = useRef<SVGGElement>(null), eyes = useRef<SVGGElement>(null);
  useKiteLoop({ svg, body, sail, tail, eyes });
  return <svg ref={svg} className="kite-canvas" aria-label="Kite" role="img">
    <defs>
      <linearGradient id="kite-sail" x1="0" y1="0" x2="1" y2="1">
        <stop className="kite-glint-body" /><stop className="kite-glint-shade" offset="1" />
      </linearGradient>
    </defs>
      <g ref={body}>
        <path ref={sail} className="kite-sail" d={sailPath(config.sail)} />
        <g ref={eyes} fill="#fff"><circle cx="-2.4" cy="-2" r=".85" /><circle cx="2.4" cy="-2" r=".85" /></g>
        <path className="kite-sparkle" d="M16 -17 L17.2 -13.2 L21 -12 L17.2 -10.8 L16 -7 L14.8 -10.8 L11 -12 L14.8 -13.2 Z" opacity="0" />
      </g>
      {/* The tail lives outside the body so each dot can trail on its own spring; the loop places them (K-03). */}
      <g ref={tail} className="kite-tail">{config.tailDots.map(({ x, y, size }) =>
        <rect key={`${x} ${y}`} x={-size / 2} y={-size / 2} width={size} height={size} rx={size * .2} />)}</g>
      {/* Sail-native cues (personality.md K-10): a gold shutter ring for a capture, a slash across the muted tail. */}
      <circle className="kite-shutter" r="18" opacity="0" />
      <g className="kite-mute-slash" opacity="0"><path className="halo" /><path /></g>
  </svg>;
});
