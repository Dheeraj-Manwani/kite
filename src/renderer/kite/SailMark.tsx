import { config } from './config';
import { restSail, sailPath } from './sail';

const sail = sailPath(restSail);
const [dot] = config.tailDots;

/** The sail mark: the kite at rest with one tail dot, for inline use at 14–64 px (docs/design.md §K2, "The kite as a mark").
 * It's the logo, so it stays rose; `live` shows the kite's chosen color instead (the Settings preview, K-15). */
export function SailMark({ size = 16, live = false }: { size?: number; live?: boolean }) {
  return <svg className={live ? 'sail-mark live' : 'sail-mark'} width={size} height={size} viewBox="-8.7 -9.7 25 25" aria-hidden="true" focusable="false">
    <g transform={`rotate(${config.baseAngle})`}>
      <rect x={dot.x - dot.size / 2} y={dot.y - dot.size / 2} width={dot.size} height={dot.size} rx={dot.size * .2} transform={`rotate(12 ${dot.x} ${dot.y})`} />
      <path d={sail} />
    </g>
  </svg>;
}
