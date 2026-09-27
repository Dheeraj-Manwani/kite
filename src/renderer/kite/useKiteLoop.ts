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
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = media.matches;
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
    let wagPhase = 0, bobPhase = 0, lastSpin = 0, spinBase = 0;
    let blinkAt = config.blinkMin + Math.random() * (config.blinkMax - config.blinkMin), blinkStart = -10;
    let fpsTime = 0, fpsFrames = 0;
    function tick(now: number) {
      frame = requestAnimationFrame(tick);
      const rawDt = last ? (now - last) / 1000 : 1 / 60;
      last = now;
      const dt = Math.min(Math.max(rawDt, 0.001), config.maxDt);
      time += dt;
      fpsFrames++; fpsTime += rawDt;
      if (fpsTime >= 0.5) {
        runtime.fps = Math.round(fpsFrames / fpsTime);
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
      const shakeResult = detectShake(shake, velocity.x, time);
      shake = shakeResult.state;
      let requested = runtime.trigger ?? (config.automaticOneShots && shakeResult.fired ? 'dizzy' : undefined);
      runtime.trigger = null;
      if (mood !== 'idle') requested = undefined;
      const behaviorResult = mood === 'idle'
        ? updateBehavior(behavior, time, speed, Math.random(), requested, reduced, config.automaticOneShots)
        : { state: createBehavior(time, Math.random()), motion: moods.idle, spin: 0 };
      behavior = behaviorResult.state;
      runtime.behavior = mood === 'idle' ? behavior.name : mood;
      const targetMotion = mood === 'idle' ? behaviorResult.motion : moods[mood];
      motion = blendMotion(motion, targetMotion, dt, mood === 'idle' ? config.behaviorBlend : config.moodBlend);
      const fakeAudio = runtime.fakeLevels ? (1 + Math.sin(time * 3.2)) / 2 : 0;
      const fakeSpeech = runtime.fakeLevels ? Math.max(0, Math.sin(time * 6)) : 0;
      const audio = clamp(runtime.audioLevel ?? fakeAudio, 0, 1);
      const speech = clamp(runtime.speechLevel ?? fakeSpeech, 0, 1);
      wagPhase += dt * config.wagFrequency * motion.frequency;
      bobPhase += dt * motion.bobFrequency * Math.PI * 2;
      const wake = mood === 'idle' && behavior.name === 'wake' && !reduced;
      const bob = Math.sin(bobPhase) * motion.bob * config.personalityAmount * (reduced ? 0.25 : 1) * (mood === 'talking' ? 0.5 + speech : 1);
      const target = {
        x: cursor.x + (config.offsetX + motion.driftX * config.personalityAmount) * scale,
        y: cursor.y + (config.offsetY + bob + (wake ? behaviorResult.motion.driftY : motion.driftY) * config.personalityAmount) * scale,
      };
      body = stepBody(body, target, config.stiffness * (1 + (motion.stiffness - 1) * config.personalityAmount), reduced ? Math.max(40, config.damping) : config.damping, dt);
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
      rotation = stepSpring(rotation, config.baseAngle + bank + tilt + spinBase + lastSpin, config.rotationStiffness, config.rotationDamping, dt);
      const desiredStretch = reduced ? 1 : wake ? behaviorResult.motion.stretch : Math.min(config.maxStretch, 1 + bodySpeed * config.stretchGain);
      stretch = stepSpring(stretch, desiredStretch, wake ? 1000 : 240, wake ? 42 : 26, dt);
      const along = reduced ? 1 : clamp(stretch.value, 0.75, config.maxStretch);
      const direction = wake ? Math.PI / 2 : Math.atan2(body.y.velocity, body.x.velocity);
      svg.style.visibility = 'visible';
      svg.style.opacity = String(1 + (motion.opacity - 1) * config.personalityAmount);
      bodyNode.setAttribute('transform', `translate(${body.x.value} ${body.y.value}) rotate(${direction * 180 / Math.PI}) scale(${along} ${1 / along}) rotate(${rotation.value - direction * 180 / Math.PI}) scale(${scale})`);
      // Keep the two dots attached to the body's local frame: no rope can fold
      // back into the silhouette or leave a stray dot behind during fast movement.
      const signal = mood === 'listening' ? 0.3 + audio : mood === 'talking' ? 0.5 + speech : 1;
      const wag = reduced ? 0 : Math.sin(wagPhase * Math.PI * 2)
        * Math.min(config.tailWagLimit, config.wagAmplitude * motion.wag * signal);
      bowsNode.setAttribute('transform', `translate(${wag} 0)`);
      if (time >= blinkAt) {
        blinkStart = time; blinkAt = time + config.blinkMin + Math.random() * (config.blinkMax - config.blinkMin);
      }
      const blinking = time - blinkStart < config.blinkDuration;
      eyesNode.style.display = config.eyes ? '' : 'none';
      eyesNode.setAttribute('transform', `translate(${clamp(body.x.velocity / 900, -1, 1)} 0) scale(1 ${blinking ? 0.1 : 1})`);
    }
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame); unsubscribe(); media.removeEventListener('change', preferenceChanged);
      cursorInput.geometry = null;
    };
    // Refs are stable; every animation input is read inside the loop.
  }, []);
}
