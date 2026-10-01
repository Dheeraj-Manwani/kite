import { useEffect, useRef } from 'react';
import { config } from './config';
import type { PoseName } from './poses';
import { restSail, sailPath } from './sail';
import { useStageLoop, type StageCheer, type StageScene } from './stageLoop';

export type { StageCheer } from './stageLoop';

/**
 * Onboarding's stage (docs/design.md UX-60): a deep-ink panel where the live kite flies on a dotted string
 * (docs/design.md §K5.7, K-07). The kite draws in one layer over the whole window, so it can leave the stage to draw
 * on the practice canvas; React owns the structure once and the stage loop owns every animated attribute.
 */
export function KiteStage({ height, pose, cheer, meter = false, reduced = false }:
  { height: number; pose: PoseName; cheer: StageCheer | null; meter?: boolean; reduced?: boolean }) {
  const stage = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null), body = useRef<SVGGElement>(null);
  const sail = useRef<SVGPathElement>(null), tail = useRef<SVGGElement>(null), string = useRef<SVGPathElement>(null), clip = useRef<SVGRectElement>(null);
  const scene = useRef<StageScene>({ pose, cheer, meter, height, reduced });
  useEffect(() => { scene.current = { pose, cheer, meter, height, reduced }; }, [pose, cheer, meter, height, reduced]);
  useStageLoop({ stage, svg, body, sail, tail, string, clip }, scene);
  return <>
    <div ref={stage} className="kite-stage" style={{ height }} />
    <svg ref={svg} className="kite-stage-layer" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="kite-stage-sail" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="var(--kite-body)" /><stop offset="1" stopColor="var(--kite-shade)" />
        </linearGradient>
        <clipPath id="kite-stage-clip"><rect ref={clip} /></clipPath>
      </defs>
      <path ref={string} className="kite-stage-string" clipPath="url(#kite-stage-clip)" />
      <g ref={tail} className="kite-stage-tail">{config.tailDots.map(({ x, y, size }) =>
        <rect key={`${x} ${y}`} x={-size / 2} y={-size / 2} width={size} height={size} rx={size * .2} />)}</g>
      <g ref={body}><path ref={sail} className="kite-stage-sail" d={sailPath(restSail)} /></g>
    </svg>
  </>;
}
