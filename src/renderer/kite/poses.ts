import { config } from './config';
import type { SailShape } from './sail';
import type { Vec2 } from './physics/vector';

/**
 * Every state the kite can be read in from the corner of an eye (docs/personality.md §5.2, §5.3, K-04, K-05).
 * pressed, listening, silent, and released are the four beats of push-to-talk.
 */
export type PoseName = 'rest' | 'dozing' | 'pressed' | 'listening' | 'silent' | 'released' | 'thinking' | 'working' | 'talking'
  | 'proposing' | 'approved' | 'declined' | 'lost' | 'tangled';

export interface PoseInput {
  name: PoseName;
  /** Seconds since this pose began, and a running clock in seconds. */
  t: number; time: number;
  /** Voice level for each tail dot, 0–1, already lagged so later dots follow the first. */
  levels: number[];
  /** The tail's shared rhythm in seconds (--rhythm-beat, --rhythm-stagger). */
  beat: number; stagger: number;
  /** Seconds since the latest spoken word began; Infinity when there are no word timings. */
  word?: number;
  reduced: boolean;
}
export interface DotPose { offset: Vec2; scale: number; opacity: number }
export interface Pose {
  /** Multipliers on the rest shape; flutter is px. */
  sail: SailShape;
  /** Extra nose rotation in degrees (negative turns the nose further toward the cursor) and lift in px (negative is up). */
  turn: number; lift: number;
  tail: DotPose[];
}

// Where the three dots rest, and the trailing notch they tuck into, in the sail's local frame (sail.ts).
const DOTS: Vec2[] = config.tailDots, NOTCH = { x: 0, y: 10.3 };
const still = (): DotPose[] => DOTS.map(() => ({ offset: { x: 0, y: 0 }, scale: 1, opacity: 1 }));
const shape = (s: Partial<SailShape> = {}): SailShape => ({ nose: 1, spread: 1, billow: 1, slack: 1, flutter: 0, ...s });
const ease = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;

/** The "…" wave: each dot swells in turn, one beat per loop. Under reduced motion the middle dot stays lit instead. */
function wave(input: PoseInput, beat: number): DotPose[] {
  if (input.reduced) return DOTS.map((_, i) => ({ offset: { x: 0, y: 0 }, scale: i === 1 ? 1.4 : 1, opacity: i === 1 ? 1 : .5 }));
  return DOTS.map((_, i) => {
    const phase = (((input.time - i * input.stagger) % beat) + beat) % beat / beat;
    const bump = phase < .3 ? Math.sin(phase / .3 * Math.PI) : 0;
    return { offset: { x: 0, y: -1.2 * bump }, scale: 1 + .6 * bump, opacity: .6 + .4 * bump };
  });
}

export function poseFor(input: PoseInput): Pose {
  const { name, t, time, levels, reduced } = input;
  const calm = reduced ? 0 : 1;
  switch (name) {
    case 'rest': return { sail: shape({ billow: 1 + .05 * calm * Math.sin(time * Math.PI * 2 * .2) }), turn: 0, lift: 0, tail: still() };
    case 'dozing': return { sail: shape({ nose: .92, spread: .97, billow: .85, slack: 1.6 }), turn: -10, lift: 1.5, tail: still() };
    // Beat 1: "did it register?" The nose turns toward you, the sail fills, and the tail gathers under it.
    case 'pressed': return { sail: shape({ nose: 1.06, billow: 1.35, slack: .8 }), turn: -10, lift: -1,
      tail: DOTS.map(d => ({ offset: { x: (NOTCH.x - d.x) * .45, y: (NOTCH.y - d.y) * .45 }, scale: .85, opacity: 1 })) };
    // Beat 2: "is it hearing me?" Inflated and attentive; the tail is a live level meter, later dots lagging.
    case 'listening': return { sail: shape({ nose: 1.08, spread: 1.03, billow: 1.3, slack: .8, flutter: calm * levels[0] * 1.5 * Math.sin(time * 18) }), turn: -10, lift: -1,
      tail: DOTS.map((_, i) => reduced ? { offset: { x: 0, y: 0 }, scale: 1, opacity: .5 + .5 * levels[i] }
        : { offset: { x: 0, y: levels[i] * 2 }, scale: 1 + levels[i] * 1.4, opacity: 1 }) };
    // Beat 3: "is my mic working?" After a silence the nose drops a little and the tail dims and settles.
    case 'silent': return { sail: shape({ nose: .94, billow: 1.05, slack: 1.15 }), turn: -2, lift: 1, tail: DOTS.map(() => ({ offset: { x: 0, y: 0 }, scale: .9, opacity: .45 })) };
    // Beat 4: "did it send?" A nod while the tail zips up into the sail.
    case 'released': {
      const zip = ease(t / .3);
      return { sail: shape({ billow: 1.1 }), turn: 0, lift: 0,
        tail: DOTS.map(d => ({ offset: { x: (NOTCH.x - d.x) * zip, y: (NOTCH.y - d.y) * zip }, scale: 1 - .5 * zip, opacity: 1 - .4 * zip })) };
    }
    case 'thinking': return { sail: shape({ spread: .9, billow: .95 }), turn: 8, lift: 0, tail: wave(input, input.beat) };
    // Working hard: taut, gusts ripple the trailing edge, and the wave speeds up.
    case 'working': return { sail: shape({ slack: .6, billow: 1.05, flutter: calm * (Math.sin(time * 1.3) > .6 ? .9 * Math.sin(time * 25) : 0) }), turn: 8, lift: 0, tail: wave(input, input.beat * .6) };
    // Talking: the trailing edge flutters with the voice, and the nose dips a little as each word starts.
    case 'talking': {
      const word = input.word ?? Infinity, nod = calm * (word < .22 ? Math.sin(word / .22 * Math.PI) : 0);
      return { sail: shape({ billow: 1.1 + .15 * levels[0], flutter: calm * levels[0] * 1.4 * Math.sin(time * 20) }), turn: 5 * nod, lift: .8 * nod,
      tail: DOTS.map((_, i) => ({ offset: { x: 0, y: -calm * levels[i] * 2 }, scale: 1 + calm * levels[i] * .3, opacity: 1 })) };
    }
    // Waiting for your OK: a gentle tick-tock, growing down the tail.
    case 'proposing': return { sail: shape({ nose: 1.05, billow: 1.1 }), turn: 0, lift: 0,
      tail: DOTS.map((_, i) => ({ offset: { x: calm * 2 * Math.sin(time * Math.PI * 2) * (.5 + .5 * i), y: 0 }, scale: 1, opacity: 1 })) };
    case 'approved': return { sail: shape({ slack: .5, billow: 1.15 }), turn: 0, lift: 0,
      tail: DOTS.map((_, i) => ({ offset: { x: 0, y: -3 * (1 - ease(t / .6)) * (.6 + .2 * i) }, scale: 1, opacity: 1 })) };
    case 'declined': return { sail: shape({ nose: .95, billow: .55, slack: 1.7 }), turn: 0, lift: 1.5, tail: DOTS.map(() => ({ offset: { x: 0, y: 3 }, scale: 1, opacity: .8 })) };
    // Lost: the nose tilts aside and the last dot pops up beside the tail, like a question mark.
    case 'lost': return { sail: shape({ billow: .95 }), turn: 15, lift: 0,
      tail: DOTS.map((_, i) => ({ offset: i === 2 ? { x: 5, y: -8 } : { x: 0, y: 0 }, scale: i === 2 ? 1.3 : 1, opacity: 1 })) };
    // Tangled: a crumpled sail and dots crossed over each other.
    case 'tangled': return { sail: shape({ nose: .9, spread: .8, billow: .45, slack: 1.9 }), turn: 0, lift: 0,
      tail: [{ x: 2.5, y: 0 }, { x: -2.5, y: -1 }, { x: 1.5, y: -2 }].map((o, i) => ({ offset: { x: o.x + calm * .6 * Math.sin(time * 30 + i), y: o.y }, scale: 1, opacity: 1 })) };
  }
}
