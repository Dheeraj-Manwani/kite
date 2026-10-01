import type { CursorGeometry } from '../../shared/types';
import { clamp } from '../kite/physics/vector';
import { voiceRuntime, type Reaction } from './runtime';

const still = () => ({ x: 0, y: 0, tilt: 0, stretch: 1, tailY: 0, flutter: 0 });
/**
 * One reaction `t` s after it began. The overlay and the onboarding stage share these, so a gesture means the same everywhere.
 * The big moves are not here: *success* is the loop-de-loop and *costume* the colour ripple, both played by the kite loop
 * (personality.md §5.4, K-09). Nothing spins the kite in place or flashes it any more.
 */
export function reactionShape(kind: Reaction, t: number) {
  const result = still();
  const envelope = Math.max(0, 1 - t / 1.2);
  switch (kind) {
    case 'proposing': result.tilt = 8 + Math.sin(t * 20) * 2 * envelope; break;
    case 'approved': result.y = -8 * Math.sin(Math.min(1, t / .4) * Math.PI); result.stretch = 1 + .16 * Math.sin(Math.min(1, t / .4) * Math.PI); break;
    case 'success': break;
    case 'denied': result.y = 3 * envelope; result.tilt = -8 * Math.sin(t * 10) * envelope; break;
    case 'alarm': break;
    case 'perk':
      result.stretch = t < 0.08 ? 0.88 : 1 + Math.sin(Math.min(1, (t - 0.08) / 0.25) * Math.PI) * 0.1; break;
    case 'puzzled': result.tilt = 9 * Math.sin(Math.min(1, t / 1.2) * Math.PI); result.y = 2 * envelope; result.tailY = 1; break;
    case 'aha': result.y = -3 * Math.sin(Math.min(1, t / 0.45) * Math.PI); break;
    case 'tangled': result.tilt = Math.sin(t * 24) * 6 * envelope; result.tailY = 2 * envelope; break;
    case 'costume': break;
    case 'phew': result.tilt = Math.sin(t * 15) * 8 * envelope; break;
    case 'flinch': result.y = -2 * Math.sin(Math.min(1, t / 0.25) * Math.PI); break;
    // Letting go of the shortcut: a small nod, "got it" (personality.md §5.2, beat 4).
    case 'nod': result.tilt = 6 * Math.sin(Math.min(1, t / 0.35) * Math.PI); result.y = 1.5 * Math.sin(Math.min(1, t / 0.35) * Math.PI); break;
    // Flutter hello (personality.md §5.4): one visible ripple of the trailing edge, a little lift, and a flick of the tail.
    case 'flutter': {
      const flick = Math.sin(Math.min(1, t / .5) * Math.PI);
      result.flutter = 1.6 * Math.sin(t * 26) * Math.max(0, 1 - t / .9); result.y = -2 * flick; result.tailY = -2.5 * flick; break;
    }
  }
  return result;
}

export function reactionMotion(now: number, reduced: boolean) {
  const reaction = voiceRuntime.reaction;
  const result = still();
  if (reduced) return result;
  if (now < voiceRuntime.alarmUntil) {
    // The reminder tug (personality.md §5.4): short pulls toward the bubble, like a kite pulling on its string, easing off at the end.
    const side = voiceRuntime.bubble?.dataset.side === 'left' ? -1 : 1, left = (voiceRuntime.alarmUntil - now) / 1000;
    const pull = Math.max(0, Math.sin(now / 1000 * Math.PI * 2 * 1.3)) ** 2 * Math.min(1, left / .8);
    result.x = side * 5 * pull; result.tilt = side * 12 * pull; result.tailY = -1.5 * pull; return result;
  }
  if (voiceRuntime.toolPose === 'proposing') {
    // One soft nudge toward the card as the countdown enters its last 5 s (personality.md §5.3, "Waiting for approval").
    const left = voiceRuntime.approvalEndsAt - Date.now(), nudge = left < 5000 && left > 4400 ? Math.sin((5000 - left) / 600 * Math.PI) : 0;
    result.tilt = (voiceRuntime.bubble?.dataset.side === 'left' ? -1 : 1) * (8 + Math.sin(now / 160) * 2 + 7 * nudge); result.y = -2.5 * nudge;
    result.tailY = 0.2 * Math.sin(now / 150); return result;
  }
  if (voiceRuntime.toolPose === 'executing' && reaction?.kind !== 'approved') { result.tilt = Math.sin(now / 45) * 4; result.stretch = 1 + Math.sin(now / 90) * .03; return result; }
  if (!reaction) return result;
  const t = (now - reaction.at) / 1000;
  if (t > 1.2) { voiceRuntime.reaction = null; return result; }
  const shaped = reactionShape(reaction.kind, t);
  const amount = reaction.intensity ?? 1;
  shaped.x *= amount; shaped.y *= amount; shaped.tilt *= amount; shaped.tailY *= amount; shaped.flutter *= amount;
  shaped.stretch = 1 + (shaped.stretch - 1) * amount;
  return shaped;
}
let lastReport = 0;
let reportedElement: HTMLElement | null = null;
/** The bubble placed since it last appeared: a hold never leaves a newly shown bubble where an old one was. */
let placed: HTMLElement | null = null;
/** Called from the existing kite rAF; no second loop or per-frame React state. */
/** `hold` keeps the bubble where it is while the kite does a trick beside it. A notice from the kite (UX-18) uses the same spot when no answer is showing. */
export function positionBubble(x: number, y: number, geometry: CursorGeometry, now: number, hold = false) {
  const bubble = voiceRuntime.bubble ?? voiceRuntime.notice;
  if (!bubble) { reportedElement = null; placed = null; return; }
  if (!voiceRuntime.hover && (!hold || placed !== bubble)) {
    placed = bubble;
    const left = Math.max(0, geometry.display.x - geometry.origin.x);
    const top = Math.max(0, geometry.display.y - geometry.origin.y);
    const right = Math.min(innerWidth, left + geometry.display.width);
    const bottom = Math.min(innerHeight, top + geometry.display.height);
    bubble.style.maxWidth = Math.max(80, right - left - 24) + 'px';
    bubble.style.maxHeight = Math.max(60, bottom - top - 24) + 'px';
    const width = bubble.offsetWidth, height = bubble.offsetHeight;
    const fitsRight = x + 24 + width <= right - 12;
    const bubbleX = clamp(fitsRight ? x + 24 : x - 24 - width, left + 12, Math.max(left + 12, right - width - 12));
    const bubbleY = clamp(y + height < bottom - 12 ? y - 12 : y - height + 12, top + 12, Math.max(top + 12, bottom - height - 12));
    bubble.dataset.side = fitsRight ? 'right' : 'left';
    bubble.style.translate = `${bubbleX}px ${bubbleY}px`;
    // The tail sits level with the kite, kept clear of the rounded corners (UX-13).
    const tail = String(Math.round(clamp(y - bubbleY, 16, Math.max(16, height - 16))));
    if (bubble.dataset.tail !== tail) { bubble.dataset.tail = tail; bubble.style.setProperty('--tail-y', tail + 'px'); }
  }
  if (now - lastReport > 50 || reportedElement !== bubble) {
    const rect = bubble.getBoundingClientRect();
    window.kite.setBubbleBounds({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    lastReport = now; reportedElement = bubble;
  }
}
export function sampleVoice(dt: number) { voiceRuntime.tickAudio?.(dt); }
