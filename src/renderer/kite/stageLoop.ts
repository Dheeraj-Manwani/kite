import { useEffect, type RefObject } from 'react';
import { reactionShape } from '../voice/frame';
import type { Reaction } from '../voice/runtime';
import { config } from './config';
import { noseAngle } from './flight';
import { bodySpring, spring, stepBody, stepSpring, type BodySpring } from './physics/spring';
import { clamp, type Vec2 } from './physics/vector';
import { poseFor, type DotPose, type PoseName } from './poses';
import { sailPath } from './sail';
import { stepTail, tailAt, toScreen, type TailDot } from './tail';

/** A one-off reaction on the stage, restarted by `at` (performance.now() ms). The shapes are the overlay's own. */
export interface StageCheer { kind: Extract<Reaction, 'flutter' | 'perk' | 'nod' | 'puzzled' | 'tangled'>; at: number }
/** What the current step asks of the kite. Onboarding changes it rarely; the loop reads it every frame. */
export interface StageScene {
  pose: PoseName; cheer: StageCheer | null;
  /** The level is a live microphone that hasn't heard a voice yet, so a long silence shows as the "is my mic working?" beat. */
  meter: boolean;
  /** The stage's height in px: the kite is largest where the character is the point. */
  height: number;
  reduced: boolean;
}
/** Per-frame inputs from onboarding, and where the kite is so "Let's fly" can hand it over. Never React state. */
export const stageRuntime = {
  /** The microphone level, 0–1, or a pulse per streamed word of a reply; the tail is its meter. */
  level: 0,
  /** The practice pen in client px while the user draws. */
  pen: null as Vec2 | null,
  /** The sail's origin in client px, and its scale. */
  kite: { x: 0, y: 0, scale: 1 },
};
export interface StageElements {
  stage: RefObject<HTMLDivElement | null>; svg: RefObject<SVGSVGElement | null>; body: RefObject<SVGGElement | null>;
  sail: RefObject<SVGPathElement | null>; tail: RefObject<SVGGElement | null>; string: RefObject<SVGPathElement | null>;
  clip: RefObject<SVGRectElement | null>;
}

const sizeFor = (height: number) => height >= 160 ? 2.8 : height >= 120 ? 2.1 : 1.3;
// The resting kite with its whole tail is centred about (3.8, 3.9) px from the sail's origin at scale 1, and the string
// ties on at local (0, 2). While practising, the kite perches up and to the right of the nib, nose on the ink.
const CENTRE = { x: 3.8, y: 3.9 }, BRIDLE = { x: 0, y: 2 }, NOSE = 11.1, PERCH = { x: .55, y: -.83 }, DRAWING_SIZE = 1.5;
// Some cheers hold a pose while they play: a perk gathers the tail, a nod zips it up (design.md §K5.2, §5.3).
const cheerPoses: Partial<Record<StageCheer['kind'], { pose: PoseName; seconds: number }>> = {
  perk: { pose: 'pressed', seconds: .35 }, nod: { pose: 'released', seconds: .45 }, puzzled: { pose: 'lost', seconds: 1.2 }, tangled: { pose: 'tangled', seconds: 1.2 },
};
const calm = { y: 0, tilt: 0, stretch: 1, tailY: 0, flutter: 0 };
const wrap = (degrees: number) => ((degrees % 360) + 540) % 360 - 180;
const r = (n: number) => Math.round(n * 10) / 10;

/**
 * The live kite on onboarding's stage (docs/design.md §K5.7, K-07). The overlay's loop follows the cursor; this one
 * has no cursor. It drives the same sail, tail, poses, and reactions with springs, flies home to the stage, and leaves it
 * only to draw on the practice canvas. Under reduced motion every step still shows its pose, without flight.
 */
export function useStageLoop(refs: StageElements, scene: RefObject<StageScene>) {
  useEffect(() => {
    const stage = refs.stage.current, svg = refs.svg.current, bodyNode = refs.body.current, sailNode = refs.sail.current;
    const tailNode = refs.tail.current, string = refs.string.current, clip = refs.clip.current;
    if (!stage || !svg || !bodyNode || !sailNode || !tailNode || !string || !clip) return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const rhythm = getComputedStyle(document.documentElement);
    const beat = parseFloat(rhythm.getPropertyValue('--rhythm-beat')) || 1.2, stagger = parseFloat(rhythm.getPropertyValue('--rhythm-stagger')) || .2;
    const dotNodes = Array.from(tailNode.children) as SVGRectElement[];
    const dials = { nose: spring(1), spread: spring(1), billow: spring(1), slack: spring(1) };
    let frame = 0, last = 0, time = 0, wagPhase = 0;
    let body: BodySpring | null = null, settled = false, size = spring(sizeFor(scene.current?.height ?? 190));
    let rotation = spring(config.baseAngle), turn = spring(0), lift = spring(0);
    let poseName: PoseName | null = null, poseSince = 0, scenePose: PoseName | null = null, sceneSince = 0, heardAt = 0;
    let dots: TailDot[] | null = null, dotPose: DotPose[] | null = null, lastPen: Vec2 | null = null, penUntil = 0;
    let away = false, clipBox = '';
    const levels = [0, 0, 0];
    function tick(now: number) {
      frame = requestAnimationFrame(tick);
      const s = scene.current; if (!s) return;
      const dt = Math.min(Math.max(last ? (now - last) / 1000 : 1 / 60, .001), config.maxDt);
      last = now; time += dt;
      const reduced = media.matches || s.reduced;
      const rect = stage.getBoundingClientRect();
      // Practice: fly to the ink and draw with the nose, linger a moment after the pen lifts, then fly home.
      const pen = reduced ? null : stageRuntime.pen;
      if (pen) { lastPen = pen; penUntil = time + .8; }
      const nib = pen ?? (time < penUntil ? lastPen : null);
      size = reduced ? spring(sizeFor(s.height)) : stepSpring(size, nib ? DRAWING_SIZE : sizeFor(s.height), 120, 22, dt);
      const k = size.value;
      // The pose: a cheer holds its pose briefly; otherwise the step's. Listening runs through its beats (§5.2).
      const since = s.cheer ? (now - s.cheer.at) / 1000 : Infinity, held = s.cheer && cheerPoses[s.cheer.kind];
      const shaped = s.cheer && since < 1.2 && !reduced ? reactionShape(s.cheer.kind, since) : calm;
      if (s.pose !== scenePose) { scenePose = s.pose; sceneSince = time; heardAt = time; }
      if (!s.meter) stageRuntime.level *= Math.exp(-dt * 8);
      const level = clamp(stageRuntime.level, 0, 1);
      if (level > .06) heardAt = time;
      const listening = s.pose === 'listening';
      const name: PoseName = held && since < held.seconds ? held.pose : nib ? 'rest'
        : listening && time - sceneSince < .15 ? 'pressed' : listening && s.meter && time - heardAt > 1.5 ? 'silent' : s.pose;
      if (name !== poseName) { poseName = name; poseSince = time; svg.dataset.pose = name; }
      levels[0] += (level - levels[0]) * .5; levels[1] += (levels[0] - levels[1]) * .25; levels[2] += (levels[1] - levels[2]) * .25;
      const pose = poseFor({ name, t: time - poseSince, time, levels, beat, stagger, reduced });
      turn = reduced ? spring(pose.turn) : stepSpring(turn, pose.turn, 160, 24, dt);
      lift = reduced ? spring(pose.lift) : stepSpring(lift, pose.lift, 160, 24, dt);
      for (const key of ['nose', 'spread', 'billow', 'slack'] as const) dials[key] = reduced ? spring(pose.sail[key]) : stepSpring(dials[key], pose.sail[key], 220, 24, dt);
      // Where it flies: home is the stage's centre, where it breathes; the first time, it flies in up its string.
      const bob = reduced ? 0 : Math.sin(time * Math.PI * 2 * .3) * 1.1;
      const target = nib ? { x: nib.x + PERCH.x * (NOSE * k + 4), y: nib.y + PERCH.y * (NOSE * k + 4) }
        : { x: rect.left + rect.width / 2 - CENTRE.x * k, y: rect.top + rect.height / 2 - CENTRE.y * k + (bob + lift.value + shaped.y) * k };
      if (!body) body = bodySpring(reduced ? target : { x: rect.left - 60, y: rect.top + rect.height * .7 });
      const distance = Math.hypot(target.x - body.x.value, target.y - body.y.value);
      if (distance < 2) settled = true;
      const [stiffness, damping] = !settled ? [60, 13] : distance > 30 ? [120, 18] : pen ? [900, 55] : [300, 34];
      body = reduced ? bodySpring(target) : stepBody(body, target, stiffness, damping, dt);
      const x = body.x.value, y = body.y.value;
      // The nose: at rest it leans back toward where a cursor would be; while drawing it is the nib.
      const aim = nib ? noseAngle({ x: nib.x - x, y: nib.y - y }) : config.baseAngle + turn.value + shaped.tilt + (reduced ? 0 : clamp(body.x.velocity * .012, -8, 8));
      const rotationTarget = rotation.value + wrap(aim - rotation.value);
      rotation = reduced ? spring(rotationTarget) : stepSpring(rotation, rotationTarget, config.rotationStiffness, config.rotationDamping, dt);
      const squash = shaped.stretch;
      bodyNode.setAttribute('transform', `translate(${x} ${y}) rotate(${rotation.value}) scale(${k}) scale(1 ${squash})`);
      sailNode.setAttribute('d', sailPath({ nose: dials.nose.value, spread: dials.spread.value, billow: dials.billow.value, slack: dials.slack.value, flutter: pose.sail.flutter + shaped.flutter }));
      // The tail: the same springs and pose offsets as the overlay, swinging gently at rest.
      wagPhase += dt * config.wagFrequency;
      const amplitude = !nib && (name === 'rest' || name === 'talking') ? config.wagAmplitude * config.motion.ambient : 0;
      const blend = reduced ? 1 : 1 - Math.exp(-dt * 14);
      const shapedDots = (dotPose ?? pose.tail).map((d, i) => { const p = pose.tail[i]; return {
        offset: { x: d.offset.x + (p.offset.x - d.offset.x) * blend, y: d.offset.y + (p.offset.y - d.offset.y) * blend },
        scale: d.scale + (p.scale - d.scale) * blend, opacity: d.opacity + (p.opacity - d.opacity) * blend }; });
      dotPose = shapedDots;
      const bodyFrame = { x, y, direction: 0, along: 1, rotation: rotation.value, scale: k, squash };
      const anchors = config.tailDots.map((dot, i) => toScreen({
        x: dot.x + shapedDots[i].offset.x + (reduced ? 0 : Math.sin(wagPhase * Math.PI * 2 - i * .8) * amplitude * (.6 + .4 * i)),
        y: dot.y + shapedDots[i].offset.y + shaped.tailY }, bodyFrame));
      dots = stepTail(dots ?? tailAt(anchors), anchors, dt, reduced, k);
      dots.forEach((dot, i) => {
        const node = dotNodes[i]; if (!node) return;
        node.setAttribute('transform', `translate(${dot.x.value} ${dot.y.value}) rotate(${rotation.value + 12}) scale(${k * shapedDots[i].scale})`);
        node.style.opacity = shapedDots[i].opacity.toFixed(2);
      });
      // The string runs from the stage's lower-left corner to the bridle, kept to the stage; it fades while the kite is away.
      const tie = toScreen(BRIDLE, bodyFrame), start = { x: rect.left - 20, y: rect.bottom + 20 };
      string.setAttribute('d', `M${r(start.x)} ${r(start.y)}Q${r(start.x + (tie.x - start.x) * .45)} ${r(rect.top + rect.height * .95)} ${r(tie.x)} ${r(tie.y)}`);
      const box = `${rect.left} ${rect.top} ${rect.width} ${rect.height}`;
      if (box !== clipBox) { clipBox = box; clip.setAttribute('x', String(rect.left)); clip.setAttribute('y', String(rect.top)); clip.setAttribute('width', String(rect.width)); clip.setAttribute('height', String(rect.height)); }
      // Over the practice canvas it takes the overlay's halo, which suits the window's own surface.
      const off = y > rect.bottom;
      if (off !== away) { away = off; svg.classList.toggle('off-stage', off); }
      svg.style.visibility = 'visible';
      stageRuntime.kite = { x, y, scale: k };
    }
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); stageRuntime.pen = null; stageRuntime.level = 0; };
    // Refs are stable; every animation input is read inside the loop.
  }, []);
}
