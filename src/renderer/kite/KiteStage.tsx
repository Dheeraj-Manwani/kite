import type { Ref } from 'react';
import { config } from './config';
import { restSail, sailPath } from './sail';

const sail = sailPath(restSail);
// The resting kite with its whole tail spans about 24 × 26 units, centred at (3.8, 3.9) from the sail's origin;
// the string meets the sail at (1.2, 1.6). Both follow config.baseAngle (−35°).
const CENTRE = { x: 3.8, y: 3.9 }, BRIDLE = { x: 1.2, y: 1.6 };
/** A one-off reaction on the stage: a perk for each key, a happy hop when something works. `at` restarts it. */
export interface StageCheer { kind: 'perk' | 'happy'; at: number }

/**
 * Onboarding's stage (docs/ui-ux-improvements.md UX-60): a deep-ink panel where the kite flies on a dotted string.
 * Until the live kite comes to the stage (docs/personality.md K-07), it flies in once, cheers on cue, and its tail dots
 * can act as a level meter: the microphone step sets --l1 to --l3 on `tail`.
 */
export function KiteStage({ height, tail, cheer }: { height: number; tail?: Ref<SVGGElement>; cheer?: StageCheer | null }) {
  const size = height >= 160 ? 2.8 : height >= 120 ? 2.1 : 1.3;
  const x = 350 - CENTRE.x * size, y = height / 2 - CENTRE.y * size;
  const end = { x: x + BRIDLE.x * size, y: y + BRIDLE.y * size };
  return <div className="kite-stage" style={{ height }} aria-hidden="true">
    <svg viewBox={`0 0 700 ${height}`} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="kite-stage-sail" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="var(--kite-body)" /><stop offset="1" stopColor="var(--kite-shade)" />
        </linearGradient>
      </defs>
      <path className="kite-stage-string" d={`M-20 ${height + 20}Q${end.x * .45} ${height * .95} ${end.x} ${end.y}`} />
      <g className="kite-stage-flight"><g key={cheer?.at} className={`kite-stage-cheer ${cheer?.kind ?? ''}`}>
        <g transform={`translate(${x} ${y}) scale(${size}) rotate(${config.baseAngle})`}>
          <g ref={tail} className="kite-stage-tail">{config.tailDots.map(({ x: dx, y: dy, size: s }) =>
            <rect key={`${dx} ${dy}`} x={dx - s / 2} y={dy - s / 2} width={s} height={s} rx={s * .2} transform={`rotate(12 ${dx} ${dy})`} />)}</g>
          <path className="kite-stage-sail" d={sail} />
        </g>
      </g></g>
    </svg>
  </div>;
}
