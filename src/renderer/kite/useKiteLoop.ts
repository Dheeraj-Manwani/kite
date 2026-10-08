import { visionRuntime as vr } from '../vision/runtime';
import { guideRuntime as gr } from '../guide/runtime';
import { boardRuntime as br } from '../board/runtime';
import { taskRuntime } from '../agent/runtime';
import { RefObject, useEffect } from 'react';
import type { CursorGeometry, CursorPoint } from '../../shared/types';
import { useKiteStore } from '../store/kite';
import { config } from './config';
import { createBehavior, updateBehavior } from './behaviors';
import { createShake, detectShake } from './behaviors/shake';
import { blendMotion, moods } from './moods';
import { bodySpring, spring, stepBody, stepSpring } from './physics/spring';
import { clamp } from './physics/vector';
import { runtime } from './runtime';
import { sailPath } from './sail';
import { poseFor, type DotPose, type PoseName } from './poses';
import { easeInOut, loopFlight, noseAngle, reelFlight, swoopFlight, type Path } from './flight';
import type { Vec2 } from './physics/vector';
import { stepTail, tailAt, toScreen, type TailDot } from './tail';
import { positionBubble, reactionMotion, sampleVoice } from '../voice/frame';
import { react, voiceRuntime, type Reaction } from '../voice/runtime';

export interface KiteElements {
  svg: RefObject<SVGSVGElement | null>;
  body: RefObject<SVGGElement | null>;
  sail: RefObject<SVGPathElement | null>;
  tail: RefObject<SVGGElement | null>;
  eyes: RefObject<SVGGElement | null>;
}
export const cursorInput: { point: CursorPoint; geometry: CursorGeometry | null } = {
  point: { x: 0, y: 0 }, geometry: null,
};

// A brief reaction takes over the pose for a moment; then tools, then the mood decide it (docs/design.md K-05).
const reactionPoses: Partial<Record<Reaction, PoseName>> = { approved: 'approved', denied: 'declined', puzzled: 'lost', tangled: 'tangled' };

export function useKiteLoop(refs: KiteElements) {
  useEffect(() => {
    const svg = refs.svg.current, bodyNode = refs.body.current, sailNode = refs.sail.current;
    const tailNode = refs.tail.current, eyesNode = refs.eyes.current;
    if (!svg || !bodyNode || !sailNode || !tailNode || !eyesNode) return;
    const shutter = svg.querySelector<SVGCircleElement>('.kite-shutter'), slash = svg.querySelector<SVGGElement>('.kite-mute-slash');
    const handsOffRing = svg.querySelector<SVGCircleElement>('.kite-handsoff');
    const sheen = bodyNode.querySelector<SVGPathElement>('.kite-sheen'), sheenGradient = svg.querySelector<SVGLinearGradientElement>('#kite-sheen');
    let glint = '', ringShown = false, muted = false, sheenShown = false, handsOff = false;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = media.matches || runtime.reducedMotion;
    const preferenceChanged = () => { reduced = media.matches; };
    media.addEventListener('change', preferenceChanged);
    const unsubscribe = window.kite.onCursorUpdate((point, geometry) => {
      cursorInput.point = point; cursorInput.geometry = geometry;
    });
    let last = 0, time = 0, frame = 0, initialized = false;
    let body = bodySpring({ x: 0, y: 0 });
    let rotation = spring(config.baseAngle), stretch = spring(1);
    let previousCursor = { x: 0, y: 0 };
    let previousOrigin = { x: 0, y: 0 };
    let behavior = createBehavior(0, Math.random()), shake = createShake();
    let motion = { ...moods.idle };
    let currentMood = useKiteStore.getState().mood;
    let wagPhase = 0, bobPhase = 0, lastSpin = 0, spinBase = 0, wasGuiding = false;
    let blinkAt = config.blinkMin + Math.random() * (config.blinkMax - config.blinkMin), blinkStart = -10;
    let fpsTime = 0, fpsFrames = 0;
    let drawnPath = sailNode.getAttribute('d') ?? '', spokenName = '';
    // Poses (docs/design.md K-04, K-05): the sail's dials, the nose turn, and the lift ease toward the current pose.
    // The tail's "…" wave keeps the same rhythm as the UI's dots (--rhythm-beat, --rhythm-stagger in tokens.css).
    const rhythm = getComputedStyle(document.documentElement);
    const beat = parseFloat(rhythm.getPropertyValue('--rhythm-beat')) || 1.2, stagger = parseFloat(rhythm.getPropertyValue('--rhythm-stagger')) || .2;
    const dials = { nose: spring(1), spread: spring(1), billow: spring(1), slack: spring(1) };
    let turn = spring(0), lift = spring(0), poseName: PoseName = 'rest', poseSince = 0, dotPose: DotPose[] | null = null;
    const levels = [0, 0, 0];
    let listenStart = 0, heardAt = 0, nudged = false;
    let dots: TailDot[] | null = null;
    // Signature moves (docs/design.md §K5.4, K-09) fly a path: the loop-de-loop, the dive and swoop, and reeling out.
    // `scale` is the size the kite starts the flight at; `hold` keeps the bubble still beside a trick; `gone` ends off screen.
    let flight: { path: Path; start: number; scale: number; hold: boolean; gone?: boolean } | null = null;
    let celebrated = 0, rippled = 0, rippleAt = -Infinity, rippleStrength = 1, guideAnchor: Vec2 | null = null;
    // Paused: `gone` once the kite has reeled out of sight; `fade` is its opacity (reduced motion fades instead of flying).
    let gone = false, fade = 1, returning = 0;
    const dotNodes = Array.from(tailNode.children) as SVGRectElement[];
    function tick(now: number) {
      frame = requestAnimationFrame(tick);
      reduced = media.matches || runtime.reducedMotion;
      const dozing = runtime.behavior === 'dozing' && useKiteStore.getState().mood === 'idle' && !runtime.panelOpen && !vr.drawing && !br.pen && !br.rest;
      // While paused and out of sight, a few frames a second are plenty.
      if (gone && fade <= 0 && !runtime.away && last && now - last < 250) return;
      if (dozing && !flight && !runtime.flight && last && now - last < 48 && cursorInput.point.x === previousCursor.x + previousOrigin.x && cursorInput.point.y === previousCursor.y + previousOrigin.y) return;
      const renderStarted = performance.now();
      const rawDt = last ? (now - last) / 1000 : 1 / 60;
      last = now;
      const dt = Math.min(Math.max(rawDt, 0.001), config.maxDt);
      time += dt;
      sampleVoice(dt);
      br.tick?.(now);
      const reaction = reactionMotion(now, reduced);
      const workingHard = voiceRuntime.waitingSince > 0 && now - voiceRuntime.waitingSince > 3000;
      fpsFrames++; fpsTime += rawDt;
      if (fpsTime >= 0.5) {
        runtime.fps = Math.round(fpsFrames / fpsTime);
        window.kite.reportFrame(runtime.fps, runtime.frameMs);
        fpsFrames = 0; fpsTime = 0;
      }
      const geometry = cursorInput.geometry;
      if (!geometry) return;
      const cursor = { x: cursorInput.point.x - geometry.origin.x, y: cursorInput.point.y - geometry.origin.y };
      if (!initialized || previousOrigin.x !== geometry.origin.x || previousOrigin.y !== geometry.origin.y) {
        body = bodySpring({ x: cursor.x + config.offsetX * config.scale, y: cursor.y + config.offsetY * config.scale }); dots = null; flight = null;
        previousCursor = cursor; previousOrigin = geometry.origin; initialized = true;
      }
      // "Let's fly" (design.md §K5.7, K-07): onboarding hands over its stage kite, which loops from where the window
      // was over to the cursor, shrinking to its everyday size on the way. Under reduced motion it is simply here.
      const home = { x: cursor.x + config.offsetX * config.scale, y: cursor.y + config.offsetY * config.scale };
      if (runtime.flight) {
        const from = { x: runtime.flight.x - geometry.origin.x, y: runtime.flight.y - geometry.origin.y };
        if (!reduced) { flight = { path: loopFlight(from, home), start: time, scale: runtime.flight.scale, hold: true }; body = bodySpring(from); dots = null; }
        runtime.flight = null;
      }
      // Paused (design.md §K5.3, K-09): the kite reels out, up and off the screen, and on resume it drifts back down
      // from above to the cursor, then flutters hello. Under reduced motion it fades out and in instead.
      if (runtime.away) {
        const command = runtime.away; runtime.away = null;
        const top = geometry.display.y - geometry.origin.y;
        if (command === 'leave' && !gone && !flight?.gone) {
          if (reduced) gone = true;
          else { const from = { x: body.x.value, y: body.y.value }; flight = { path: reelFlight(from, { x: from.x + 90, y: top - 120 }), start: time, scale: 1, hold: false, gone: true }; }
        }
        if (command === 'return' && (gone || flight?.gone)) {
          gone = false; flight = null; returning = time;
          if (!reduced) { body = bodySpring({ x: home.x + 30, y: top - 80 }); dots = null; }
        }
      }
      fade = reduced ? clamp(fade + (gone ? -dt : dt) / .3, 0, 1) : gone ? 0 : 1;
      const flown = flight ? Math.min(1, (time - flight.start) / flight.path.duration) : 1;
      const flying = flight ? flight.path.at(flown) : null;
      const scale = config.scale * (flight ? 1 + (flight.scale - 1) * (1 - easeInOut(flown / .6)) : 1);
      const hold = !!flight?.hold;
      if (flight && flown >= 1) { if (flight.gone) gone = true; flight = null; }
      const velocity = { x: (cursor.x - previousCursor.x) / dt, y: (cursor.y - previousCursor.y) / dt };
      previousCursor = cursor;
      const speed = Math.hypot(velocity.x, velocity.y);
      const mood = useKiteStore.getState().mood;
      if (mood !== currentMood) {
        behavior = createBehavior(time, Math.random()); shake = createShake();
        spinBase += lastSpin; lastSpin = 0;
        currentMood = mood;
      }
      // Whiteboard: the kite holds the marker. It follows the nib while drawing and waits at the board between strokes.
      const ink = !vr.drawing && mood !== 'listening' ? br.pen ?? br.rest : null;
      // Guide mode: fly to the control and point at it, but stay with the user while they talk or read a reply.
      // A running task points at the control it is about to use, the same way.
      const pointer = taskRuntime.anchor && taskRuntime.aim ? taskRuntime : gr;
      const guiding = !ink && !!pointer.anchor && !!pointer.aim && !vr.drawing && !voiceRuntime.bubble && (mood === 'idle' || voiceRuntime.quiet);
      const pointing = guiding || !!ink;
      // A name that says what Kite is doing, for screen readers (docs/design.md K-16); written only when it changes.
      let spoken = document.documentElement.classList.contains('kite-paused') ? 'Kite, paused'
        : voiceRuntime.toolPose === 'proposing' ? 'Kite, waiting for your OK' : voiceRuntime.toolPose === 'executing' ? 'Kite, working'
        : mood === 'listening' ? 'Kite, listening' : mood === 'thinking' ? 'Kite, thinking' : mood === 'talking' ? 'Kite, talking'
        : ink ? 'Kite, drawing' : guiding ? 'Kite, pointing' : 'Kite';
      if (taskRuntime.handsOff) spoken += ', hands-off';
      if (spoken !== spokenName) { spokenName = spoken; svg.setAttribute('aria-label', spoken); }
      const steering = pointing || !!flying;
      if (wasGuiding && !steering) {
        // Re-base whole turns so returning upright takes the short way round.
        spinBase = Math.round((rotation.value - config.baseAngle) / 360) * 360; lastSpin = 0;
        if (reduced) rotation = spring(config.baseAngle + spinBase);
      }
      wasGuiding = steering;
      const shakeResult = detectShake(shake, velocity.x, time);
      shake = shakeResult.state;
      let requested = runtime.trigger ?? (config.automaticOneShots && shakeResult.fired ? 'dizzy' : undefined);
      runtime.trigger = null;
      if (mood !== 'idle') requested = undefined;
      const behaviorResult = mood === 'idle' && !pointing
        ? updateBehavior(behavior, time, speed, Math.random(), requested, reduced, config.automaticOneShots)
        : { state: createBehavior(time, Math.random()), motion: moods.idle, spin: 0 };
      behavior = behaviorResult.state;
      runtime.behavior = ink ? 'drawing' : guiding ? 'guiding' : mood === 'idle' ? behavior.name : mood;
      const targetMotion = mood === 'idle' ? behaviorResult.motion : moods[mood];
      motion = blendMotion(motion, targetMotion, dt, mood === 'idle' ? config.behaviorBlend : config.moodBlend);
      const fakeAudio = runtime.fakeLevels ? (1 + Math.sin(time * 3.2)) / 2 : 0;
      const fakeSpeech = runtime.fakeLevels ? Math.max(0, Math.sin(time * 6)) : 0;
      const audio = clamp(runtime.audioLevel ?? fakeAudio, 0, 1);
      const speech = clamp(runtime.speechLevel ?? fakeSpeech, 0, 1);
      wagPhase += dt * (mood === 'listening' ? 10 : workingHard ? 5 : config.wagFrequency * motion.frequency);
      bobPhase += dt * motion.bobFrequency * Math.PI * 2;
      const wake = mood === 'idle' && behavior.name === 'wake' && !reduced;
      // Listening beats: when the hold began and when a voice was last heard (K-04). A long silence earns one puzzled tilt.
      if (mood === 'listening') { if (!listenStart) { listenStart = time; heardAt = 0; nudged = false; } if (audio > .06) { heardAt = time; nudged = false; } }
      else listenStart = 0;
      const silentFor = listenStart ? time - Math.max(listenStart, heardAt) : 0;
      if (silentFor > 3 && !nudged) { nudged = true; react('puzzled'); }
      const level = mood === 'listening' ? audio : mood === 'talking' ? speech : 0;
      levels[0] += (level - levels[0]) * .5; levels[1] += (levels[0] - levels[1]) * .25; levels[2] += (levels[1] - levels[2]) * .25;
      const active = voiceRuntime.reaction, since = active ? (now - active.at) / 1000 : Infinity;
      // Something finished well (§5.4): a small loop-de-loop in place. It climbs first, then swings round on the side away
      // from the bubble, which holds still meanwhile.
      if (active?.kind === 'success' && active.at !== celebrated) {
        celebrated = active.at;
        if (!reduced && !flight && !gone) {
          const here = { x: body.x.value, y: body.y.value }, away = { x: voiceRuntime.bubble?.dataset.side === 'left' ? 1 : -1, y: 0 };
          flight = { path: loopFlight(here, here, { radius: 28 * config.scale, heading: { x: 0, y: -1 }, bulge: away, duration: 1 }), start: time, scale: 1, hold: true };
        }
      }
      // Something changed about me (§5.4): a colour ripple, a sheen that crosses the sail. Reduced motion glints instead.
      if (active?.kind === 'costume' && active.at !== rippled) { rippled = active.at; rippleAt = time; rippleStrength = active.intensity ?? 1; }
      // Follow me (§5.4): reaching each guide step is a dive and swoop rather than a plain spring flight.
      const anchor = guiding && pointer === gr ? gr.anchor : null;
      if (anchor && (!guideAnchor || anchor.x !== guideAnchor.x || anchor.y !== guideAnchor.y) && !flight && !reduced && !gone) {
        const from = { x: body.x.value, y: body.y.value };
        if (Math.hypot(anchor.x - from.x, anchor.y - from.y) > 60) flight = { path: swoopFlight(from, anchor), start: time, scale: 1, hold: false };
      }
      guideAnchor = anchor ? { ...anchor } : null;
      if (returning && time - returning > (reduced ? .3 : 1.1)) { returning = 0; react('flutter'); }
      const reacting = active && since < 1.2 ? reactionPoses[active.kind] : undefined;
      const name: PoseName = steering ? 'rest' : active?.kind === 'nod' && since < .45 ? 'released' : reacting
        ?? (voiceRuntime.toolPose === 'proposing' ? 'proposing' : voiceRuntime.toolPose === 'executing' ? 'working'
        : mood === 'listening' ? time - listenStart < .15 ? 'pressed' : silentFor > 1.5 ? 'silent' : 'listening'
        : mood === 'thinking' ? workingHard ? 'working' : 'thinking' : mood === 'talking' ? 'talking' : behavior.name === 'dozing' ? 'dozing' : 'rest');
      if (name !== poseName) { poseName = name; poseSince = time; }
      const pose = poseFor({ name, t: time - poseSince, time, levels, beat, stagger, reduced, word: voiceRuntime.wordAt ? (now - voiceRuntime.wordAt) / 1000 : Infinity });
      turn = reduced ? spring(pose.turn) : stepSpring(turn, pose.turn, 160, 24, dt);
      lift = reduced ? spring(pose.lift) : stepSpring(lift, pose.lift, 160, 24, dt);
      const { follow, expression, ambient } = config.motion;
      // Calm while you read: with an answer on screen, idle drifting and swaying stop and only breathing remains (design.md §K4).
      const expressive = mood === 'idle' && voiceRuntime.bubble ? 0 : expression;
      const bob = Math.sin(bobPhase) * motion.bob * (mood === 'idle' ? ambient : expression) * (reduced ? 0.25 : 1) * (mood === 'talking' ? 0.5 + speech : 1);
      const target = {
        x: cursor.x + (config.offsetX + motion.driftX * expressive + reaction.x) * scale,
        y: cursor.y + (config.offsetY + bob + lift.value + reaction.y + (mood === 'talking' && speech < 0.06 ? 1.4 : -speech * 2) + (wake ? behaviorResult.motion.driftY : motion.driftY) * expressive) * scale,
      };
      if (vr.drawing && vr.pen) { target.x = vr.pen.x; target.y = vr.pen.y; }
      if (guiding) {
        // A small periodic poke toward the control, like a fingertip tapping the screen.
        const dx = pointer.aim.x - pointer.anchor.x, dy = pointer.aim.y - pointer.anchor.y, length = Math.hypot(dx, dy) || 1;
        const phase = (time % 1.8) / 1.8, poke = reduced ? 0 : phase < 0.2 ? Math.sin(phase / 0.2 * Math.PI) * 5 : 0;
        target.x = pointer.anchor.x + dx / length * poke; target.y = pointer.anchor.y + dy / length * poke + bob * scale * 0.4;
      }
      if (ink) {
        // The nose is the marker tip: the kite sits up and to the right of the nib so it never hides the stroke.
        target.x = ink.x + 8 * scale; target.y = ink.y - 10 * scale + (br.pen ? 0 : bob * scale * 0.4);
      }
      const look = !ink && vr.target && (mood === 'thinking' || now < vr.glanceUntil);
      if (look) { target.x += clamp(vr.target.x - target.x, -50, 50) * .35; target.y += clamp(vr.target.y - target.y, -50, 50) * .35; }
      // Guiding uses a softer, slightly underdamped spring so the kite visibly flies to the control.
      const holding = !!ink && !!br.pen;
      // A path in flight sets the body directly; drifting back from a pause rides a soft spring that settles like a kite.
      const settling = returning && !reduced;
      if (flying) body = { x: { value: flying.point.x, velocity: (flying.point.x - body.x.value) / dt }, y: { value: flying.point.y, velocity: (flying.point.y - body.y.value) / dt } };
      else body = stepBody(body, target, settling ? 60 : holding ? 900 : pointing ? 170 : config.stiffness * (vr.drawing ? 4 : 1) * (1 + (motion.stiffness - 1) * follow),
        reduced ? Math.max(40, config.damping) : settling ? 10 : holding ? 55 : pointing ? 21 : config.damping, dt);
      const bodySpeed = Math.hypot(body.x.velocity, body.y.velocity);
      const bank = reduced ? 0 : clamp(body.x.velocity * config.bankGain, -config.bankLimit, config.bankLimit);
      // Keep complete turns in a continuous angle domain so recovery never unwinds.
      if (reduced) {
        spinBase = rotation.value - config.baseAngle;
        lastSpin = 0;
        rotation.velocity = 0;
      } else {
        if (lastSpin > 0 && behaviorResult.spin === 0) spinBase += 360;
        lastSpin = behaviorResult.spin;
      }
      const tilt = reduced ? 0 : motion.tilt * expressive * Math.sin(time * (mood === 'thinking' ? 1.7 : 2.5));
      let rotationTarget = config.baseAngle + bank + tilt + reaction.tilt + turn.value + spinBase + lastSpin;
      if (pointing) {
        // The nose (local -y) points at the control or the nib; wrap so the kite turns the short way.
        const aim = ink ? br.pen ?? br.aim ?? ink : pointer.aim;
        const angle = Math.atan2(aim.y - body.y.value, aim.x - body.x.value) * 180 / Math.PI + 90 + reaction.tilt;
        rotationTarget = rotation.value + (((angle - rotation.value) % 360) + 540) % 360 - 180;
        if (reduced) rotation = spring(rotationTarget);
      }
      // In flight the nose follows the route, turning once all the way round through the loop; a stiff spring keeps it on.
      if (flying) rotation = stepSpring(rotation, rotation.value + (((noseAngle(flying.heading) - rotation.value) % 360) + 540) % 360 - 180, 900, 55, dt);
      else rotation = stepSpring(rotation, rotationTarget, config.rotationStiffness, config.rotationDamping, dt);
      const desiredStretch = reduced ? 1 : wake ? behaviorResult.motion.stretch : Math.min(config.maxStretch, 1 + bodySpeed * config.stretchGain);
      stretch = stepSpring(stretch, desiredStretch, wake ? 1000 : 240, wake ? 42 : 26, dt);
      const along = reduced ? 1 : clamp(stretch.value * reaction.stretch, 0.75, Math.max(config.maxStretch, 1.1));
      const direction = wake ? Math.PI / 2 : Math.atan2(body.y.velocity, body.x.velocity);
      // A capture is a shutter blink (design.md §K5.3, K-10): a quick squash and a blink of the tail, and one thin gold
      // ring that opens around the kite and fades. Under reduced motion only the ring shows. No filters touch the kite.
      const shot = (now - vr.blinkAt) / 1000, captureBlink = !reduced && shot < .18, ring = shot < .4;
      if (shutter && (ring || ringShown)) {
        ringShown = ring;
        shutter.setAttribute('opacity', ring ? (1 - shot / .4).toFixed(2) : '0');
        shutter.setAttribute('cx', String(body.x.value)); shutter.setAttribute('cy', String(body.y.value));
        shutter.setAttribute('r', String((reduced ? 18 : 14 + 8 * (1 - (1 - shot / .4) ** 2)) * scale));
      }
      // The colour ripple: a soft white band sweeps diagonally across the sail (kite.css, #kite-sheen). Under reduced motion
      // the sail's own colours lift toward white and back instead (--kite-glint), with nothing moving.
      const rippleT = (time - rippleAt) / .8, rippling = rippleT >= 0 && rippleT < 1;
      if (sheen && sheenGradient && (rippling || sheenShown)) {
        sheenShown = rippling && !reduced;
        sheen.setAttribute('opacity', sheenShown ? String(rippleStrength) : '0');
        const band = -.3 + 1.6 * easeInOut(rippleT);
        sheenGradient.setAttribute('x1', String(band - .3)); sheenGradient.setAttribute('y1', String(band - .3));
        sheenGradient.setAttribute('x2', String(band + .3)); sheenGradient.setAttribute('y2', String(band + .3));
      }
      const shine = reduced && rippling ? (rippleStrength * Math.sin(rippleT * Math.PI)).toFixed(2) : '';
      if (shine !== glint) { glint = shine; svg.style.setProperty('--kite-glint', shine || '0'); }
      svg.style.visibility = gone && fade <= 0 ? 'hidden' : 'visible';
      // Pointing over a neighbouring control's label, the kite lets the label show through (design.md §K5.6, K-08).
      const see = guiding && pointer === gr && gr.dim ? .85 : 1;
      svg.style.opacity = String((1 + (motion.opacity - 1) * ambient) * fade * see);
      const squash = captureBlink ? .65 : vr.drawing ? .88 : look && mood === 'thinking' ? .78 : 1;
      bodyNode.setAttribute('transform', `translate(${body.x.value} ${body.y.value}) rotate(${direction * 180 / Math.PI}) scale(${along} ${1 / along}) rotate(${rotation.value - direction * 180 / Math.PI}) scale(${scale}) scale(1 ${squash})`);
      // The sail's shape eases toward the pose, on top of the tunable rest shape; the path is rewritten only when it changes.
      for (const key of ['nose', 'spread', 'billow', 'slack'] as const) dials[key] = reduced ? spring(pose.sail[key]) : stepSpring(dials[key], pose.sail[key], 220, 24, dt);
      const base = config.sail;
      const path = sailPath({ nose: base.nose * dials.nose.value, spread: base.spread * dials.spread.value, billow: base.billow * dials.billow.value,
        slack: base.slack * dials.slack.value, flutter: base.flutter + pose.sail.flutter + reaction.flutter });
      if (path !== drawnPath) { drawnPath = path; sailNode.setAttribute('d', path); if (sheenShown) sheen?.setAttribute('d', path); }
      else if (sheenShown && sheen && sheen.getAttribute('d') !== path) sheen.setAttribute('d', path);
      // The tail dots hang on their own springs behind the sail, so they trail during movement and swing with a small
      // delay down the tail; at rest they settle on their anchors, clear of the sail (design.md K-03).
      // The tail swings only while resting, dozing, or talking; every other pose shapes it (K-05).
      const swinging = name === 'rest' || name === 'dozing' || name === 'talking';
      const alarm = now < voiceRuntime.alarmUntil;
      const amplitude = alarm ? 4 : !swinging ? 0 : Math.min(config.tailWagLimit, config.wagAmplitude * ambient * motion.wag * (mood === 'talking' ? 0.5 + speech : 1));
      const blend = reduced ? 1 : 1 - Math.exp(-dt * 14);
      const shaped = (dotPose ?? pose.tail).map((d, i) => { const p = pose.tail[i]; return {
        offset: { x: d.offset.x + (p.offset.x - d.offset.x) * blend, y: d.offset.y + (p.offset.y - d.offset.y) * blend },
        scale: d.scale + (p.scale - d.scale) * blend, opacity: d.opacity + (p.opacity - d.opacity) * blend }; });
      dotPose = shaped;
      const bodyFrame = { x: body.x.value, y: body.y.value, direction: direction * 180 / Math.PI, along, rotation: rotation.value, scale, squash };
      const anchors = config.tailDots.map((dot, i) => toScreen({
        x: dot.x + shaped[i].offset.x + (reduced ? 0 : Math.sin(wagPhase * Math.PI * 2 - i * .8) * amplitude * (.6 + .4 * i)),
        y: dot.y + shaped[i].offset.y + reaction.tailY }, bodyFrame));
      dots = stepTail(dots ?? tailAt(anchors), anchors, dt, reduced, scale);
      dots.forEach((dot, i) => {
        const node = dotNodes[i]; if (!node) return;
        node.setAttribute('transform', `translate(${dot.x.value} ${dot.y.value}) rotate(${bodyFrame.rotation + 12}) scale(${scale * shaped[i].scale})`);
        // The reminder under reduced motion: no tug, a steady pulse on the dots instead (§5.3).
        const pulse = reduced && alarm ? .55 + .45 * Math.abs(Math.sin(now / 1000 * Math.PI * 1.3)) : 1;
        node.style.opacity = (shaped[i].opacity * (captureBlink ? .25 : 1) * pulse).toFixed(2);
      });
      // Muted (K-10): the dots grey out and the familiar mute slash, a "/" on screen, crosses the tail at its middle dot.
      const mutedNow = now < voiceRuntime.mutedUntil;
      if (mutedNow !== muted) { muted = mutedNow; tailNode.classList.toggle('muted', muted); slash?.setAttribute('opacity', muted ? '1' : '0'); }
      if (muted && slash) {
        const middle = dots[1], reach = 5 * scale;
        const d = `M${middle.x.value - reach} ${middle.y.value + reach}L${middle.x.value + reach} ${middle.y.value - reach}`;
        for (const path of Array.from(slash.children)) path.setAttribute('d', d);
      }
      // Hands-off (ADR 014): the ring rides on the last tail dot while Kite may act without asking.
      if (taskRuntime.handsOff !== handsOff) {
        handsOff = taskRuntime.handsOff; handsOffRing?.setAttribute('opacity', handsOff ? '1' : '0');
      }
      if (handsOff && handsOffRing) { const tip = dots[dots.length - 1]; handsOffRing.setAttribute('transform', `translate(${tip.x.value} ${tip.y.value}) scale(${scale})`); }
      positionBubble(body.x.value, body.y.value, geometry, now, hold);
      if (time >= blinkAt) {
        blinkStart = time; blinkAt = time + config.blinkMin + Math.random() * (config.blinkMax - config.blinkMin);
      }
      const blinking = captureBlink || time - blinkStart < config.blinkDuration;
      eyesNode.style.display = config.eyes ? '' : 'none';
      runtime.renderedFrames++; runtime.frameMs = performance.now() - renderStarted;
      eyesNode.setAttribute('transform', `translate(${look ? clamp((vr.target.x - body.x.value) / 100, -2, 2) : clamp(body.x.velocity / 900, -1, 1)} 0) scale(1 ${blinking ? 0.1 : 1})`);
    }
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame); unsubscribe(); media.removeEventListener('change', preferenceChanged);
      cursorInput.geometry = null;
    };
    // Refs are stable; every animation input is read inside the loop.
  }, []);
}
