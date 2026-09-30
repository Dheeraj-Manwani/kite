import { visionRuntime as vr } from '../vision/runtime';
import { guideRuntime as gr } from '../guide/runtime';
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
import { positionBubble, reactionMotion, sampleVoice } from '../voice/frame';
import { voiceRuntime } from '../voice/runtime';

export interface KiteElements {
  svg: RefObject<SVGSVGElement | null>;
  body: RefObject<SVGGElement | null>;
  bows: RefObject<SVGGElement | null>;
  eyes: RefObject<SVGGElement | null>;
}
export const cursorInput: { point: CursorPoint; geometry: CursorGeometry | null } = {
  point: { x: 0, y: 0 }, geometry: null,
};

export function useKiteLoop(refs: KiteElements) {
  useEffect(() => {
    const svg = refs.svg.current, bodyNode = refs.body.current;
    const bowsNode = refs.bows.current, eyesNode = refs.eyes.current;
    if (!svg || !bodyNode || !bowsNode || !eyesNode) return;
    const sparkle = bodyNode.querySelector<SVGPathElement>('.kite-sparkle');
    const muted = bodyNode.querySelector<SVGTextElement>('.kite-muted');
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
    function tick(now: number) {
      frame = requestAnimationFrame(tick);
      reduced = media.matches || runtime.reducedMotion;
      const dozing = runtime.behavior === 'dozing' && useKiteStore.getState().mood === 'idle' && !runtime.panelOpen && !vr.drawing;
      if (dozing && last && now - last < 48 && cursorInput.point.x === previousCursor.x + previousOrigin.x && cursorInput.point.y === previousCursor.y + previousOrigin.y) return;
      const renderStarted = performance.now();
      const rawDt = last ? (now - last) / 1000 : 1 / 60;
      last = now;
      const dt = Math.min(Math.max(rawDt, 0.001), config.maxDt);
      time += dt;
      sampleVoice(dt);
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
      const scale = config.scale;
      const cursor = { x: cursorInput.point.x - geometry.origin.x, y: cursorInput.point.y - geometry.origin.y };
      if (!initialized || previousOrigin.x !== geometry.origin.x || previousOrigin.y !== geometry.origin.y) {
        body = bodySpring({ x: cursor.x + config.offsetX * scale, y: cursor.y + config.offsetY * scale });
        previousCursor = cursor; previousOrigin = geometry.origin; initialized = true;
      }
      const velocity = { x: (cursor.x - previousCursor.x) / dt, y: (cursor.y - previousCursor.y) / dt };
      previousCursor = cursor;
      const speed = Math.hypot(velocity.x, velocity.y);
      const mood = useKiteStore.getState().mood;
      if (mood !== currentMood) {
        behavior = createBehavior(time, Math.random()); shake = createShake();
        spinBase += lastSpin; lastSpin = 0;
        currentMood = mood;
      }
      // Guide mode: fly to the control and point at it, but stay with the user while they talk or read a reply.
      const guiding = !!gr.anchor && !!gr.aim && !vr.drawing && !voiceRuntime.bubble && (mood === 'idle' || voiceRuntime.quiet);
      if (wasGuiding && !guiding) {
        // Re-base whole turns so returning upright takes the short way round.
        spinBase = Math.round((rotation.value - config.baseAngle) / 360) * 360; lastSpin = 0;
        if (reduced) rotation = spring(config.baseAngle + spinBase);
      }
      wasGuiding = guiding;
      const shakeResult = detectShake(shake, velocity.x, time);
      shake = shakeResult.state;
      let requested = runtime.trigger ?? (config.automaticOneShots && shakeResult.fired ? 'dizzy' : undefined);
      runtime.trigger = null;
      if (mood !== 'idle') requested = undefined;
      const behaviorResult = mood === 'idle' && !guiding
        ? updateBehavior(behavior, time, speed, Math.random(), requested, reduced, config.automaticOneShots)
        : { state: createBehavior(time, Math.random()), motion: moods.idle, spin: 0 };
      behavior = behaviorResult.state;
      runtime.behavior = guiding ? 'guiding' : mood === 'idle' ? behavior.name : mood;
      const targetMotion = mood === 'idle' ? behaviorResult.motion : moods[mood];
      motion = blendMotion(motion, targetMotion, dt, mood === 'idle' ? config.behaviorBlend : config.moodBlend);
      const fakeAudio = runtime.fakeLevels ? (1 + Math.sin(time * 3.2)) / 2 : 0;
      const fakeSpeech = runtime.fakeLevels ? Math.max(0, Math.sin(time * 6)) : 0;
      const audio = clamp(runtime.audioLevel ?? fakeAudio, 0, 1);
      const speech = clamp(runtime.speechLevel ?? fakeSpeech, 0, 1);
      wagPhase += dt * (mood === 'listening' ? 10 : workingHard ? 5 : config.wagFrequency * motion.frequency);
      bobPhase += dt * motion.bobFrequency * Math.PI * 2;
      const wake = mood === 'idle' && behavior.name === 'wake' && !reduced;
      const bob = Math.sin(bobPhase) * motion.bob * config.personalityAmount * (reduced ? 0.25 : 1) * (mood === 'talking' ? 0.5 + speech : 1);
      const target = {
        x: cursor.x + (config.offsetX + motion.driftX * config.personalityAmount) * scale,
        y: cursor.y + (config.offsetY + bob + reaction.y + (mood === 'talking' && speech < 0.06 ? 1.4 : -speech * 2) + (wake ? behaviorResult.motion.driftY : motion.driftY) * config.personalityAmount) * scale,
      };
      if (vr.drawing && vr.pen) { target.x = vr.pen.x; target.y = vr.pen.y; }
      if (guiding) {
        // A small periodic poke toward the control, like a fingertip tapping the screen.
        const dx = gr.aim.x - gr.anchor.x, dy = gr.aim.y - gr.anchor.y, length = Math.hypot(dx, dy) || 1;
        const phase = (time % 1.8) / 1.8, poke = reduced ? 0 : phase < 0.2 ? Math.sin(phase / 0.2 * Math.PI) * 5 : 0;
        target.x = gr.anchor.x + dx / length * poke; target.y = gr.anchor.y + dy / length * poke + bob * scale * 0.4;
      }
      const look = vr.target && (mood === 'thinking' || now < vr.glanceUntil);
      if (look) { target.x += clamp(vr.target.x - target.x, -50, 50) * .35; target.y += clamp(vr.target.y - target.y, -50, 50) * .35; }
      // Guiding uses a softer, slightly underdamped spring so the kite visibly flies to the control.
      body = stepBody(body, target, guiding ? 170 : config.stiffness * (vr.drawing ? 4 : 1) * (1 + (motion.stiffness - 1) * config.personalityAmount),
        reduced ? Math.max(40, config.damping) : guiding ? 21 : config.damping, dt);
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
      const tilt = reduced ? 0 : motion.tilt * config.personalityAmount * Math.sin(time * (mood === 'thinking' ? 1.7 : 2.5));
      let rotationTarget = config.baseAngle + bank + tilt + reaction.tilt + spinBase + lastSpin;
      if (guiding) {
        // The nose (local -y) points at the control; wrap so the kite turns the short way.
        const angle = Math.atan2(gr.aim.y - body.y.value, gr.aim.x - body.x.value) * 180 / Math.PI + 90 + reaction.tilt;
        rotationTarget = rotation.value + (((angle - rotation.value) % 360) + 540) % 360 - 180;
        if (reduced) rotation = spring(rotationTarget);
      }
      rotation = stepSpring(rotation, rotationTarget, config.rotationStiffness, config.rotationDamping, dt);
      const desiredStretch = reduced ? 1 : wake ? behaviorResult.motion.stretch : Math.min(config.maxStretch, 1 + bodySpeed * config.stretchGain);
      stretch = stepSpring(stretch, desiredStretch, wake ? 1000 : 240, wake ? 42 : 26, dt);
      const along = reduced ? 1 : clamp(stretch.value * reaction.stretch, 0.75, Math.max(config.maxStretch, 1.1));
      const direction = wake ? Math.PI / 2 : Math.atan2(body.y.velocity, body.x.velocity);
      const captureBlink = now < vr.blinkUntil;
      bodyNode.style.filter = captureBlink ? 'brightness(2.5) drop-shadow(0 0 5px #fff)' : reaction.flash > 0 ? `brightness(${1 + reaction.flash * 2})` : '';
      if (sparkle) sparkle.style.opacity = reaction.happy ? String(reaction.flash) : '0';
      if (muted) muted.style.opacity = now < voiceRuntime.mutedUntil ? '1' : '0';
      svg.style.visibility = 'visible';
      svg.style.opacity = String(1 + (motion.opacity - 1) * config.personalityAmount);
      bodyNode.setAttribute('transform', `translate(${body.x.value} ${body.y.value}) rotate(${direction * 180 / Math.PI}) scale(${along} ${1 / along}) rotate(${rotation.value + reaction.spin - direction * 180 / Math.PI}) scale(${scale}) scale(1 ${captureBlink ? .65 : vr.drawing ? .88 : look && mood === 'thinking' ? .78 : 1})`);
      // Keep the two dots attached to the body's local frame: no rope can fold
      // back into the silhouette or leave a stray dot behind during fast movement.
      const signal = mood === 'listening' ? 0.3 + audio : mood === 'talking' ? 0.5 + speech : 1;
      const amplitude = now < voiceRuntime.alarmUntil ? 4 : voiceRuntime.toolPose === 'proposing' ? .15 : voiceRuntime.toolPose === 'executing' ? 1.5 : mood === 'listening' ? 0.2 + audio * 1.6 : workingHard ? 0.9 : reaction.happy ? 0.6 : Math.min(config.tailWagLimit, config.wagAmplitude * motion.wag * signal);
      const wag = reduced ? 0 : Math.sin(wagPhase * Math.PI * 2) * amplitude;
      bowsNode.setAttribute('transform', `translate(${wag} ${reaction.tailY})`);
      positionBubble(body.x.value, body.y.value, geometry, now);
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
