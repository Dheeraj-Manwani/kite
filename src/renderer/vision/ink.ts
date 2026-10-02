import { getStroke } from 'perfect-freehand';

/** One stroke as pen-like ink. Screen marks and onboarding's practice share it, so practice looks like the real thing (UX-64). */
export function inkPath(points: readonly { x: number; y: number }[]) {
  const outline = getStroke(points.map(p => [p.x, p.y]), { size: 5, thinning: .45, smoothing: .6, simulatePressure: true });
  return outline.length ? `M${outline.map(p => p.join(',')).join('L')}Z` : '';
}
