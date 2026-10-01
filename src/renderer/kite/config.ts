import { restSail } from './sail';
import { kiteSizes, type Liveliness } from '../../shared/release';
import type { AppSettings } from '../../shared/types';

export const KITE_SCALE = 1;
/** Mutable dev tuning. The frame loop reads this object without React updates. */
export const config = {
  // wagAmplitude is the tail's idle swing in px at full ambient motion.
  stiffness: 420, damping: 38, wagAmplitude: 2.4, wagFrequency: 0.65,
  // At rest the nose leans back toward the cursor, which sits up and to the left; the tail streams away from it.
  scale: KITE_SCALE, baseAngle: -35,
  offsetX: 32, offsetY: 28,
  bankLimit: 3, bankGain: 0.003,
  rotationStiffness: 160, rotationDamping: 28, stretchGain: 0, maxStretch: 1,
  sail: { ...restSail },
  // Three dots hanging from the trailing notch, in the sail's local frame.
  tailDots: [{ x: 0.4, y: 13.6, size: 2.4 }, { x: 1.5, y: 17.6, size: 2 }, { x: 2.9, y: 21.3, size: 1.6 }],
  tailWagLimit: 3,
  // How much of each kind of motion shows (docs/personality.md §5.5, K-06): follow is how moods change the follow,
  // expression is mood and idle-behaviour poses, ambient is breathing, the tail's swing, and the dozing dim.
  // Tuned so nothing moves less than about a pixel; a Liveliness setting can scale these later (K-15).
  motion: { follow: 0.5, expression: 0.45, ambient: 0.5 } as { follow: number; expression: number; ambient: number },
  automaticOneShots: false,
  moodBlend: 0.25, behaviorBlend: 0.3, maxDt: 1 / 30,
  stillSpeed: 12, excitedSpeed: 1100, boredAfter: 8, dozeAfter: 30,
  gustMin: 6, gustMax: 15, gustDuration: 1.3, wakeDuration: 1.2, dizzyDuration: 1.4,
  shakeSpeed: 180, shakeWindow: 0.6, shakeReversals: 4, shakeCooldown: 2,
  eyes: false, blinkMin: 3, blinkMax: 7, blinkDuration: 0.13,
};

/**
 * The Liveliness setting's motion amounts (docs/personality.md §5.5, K-15). Lively is the tuning above. Calm halves the
 * idle breathing and sway (still about a pixel, the floor in §5.5) and quietens the moods; every pose and gesture still reads.
 */
export const livelinessMotion: Record<Liveliness, { follow: number; expression: number; ambient: number }> = {
  lively: { ...config.motion }, calm: { follow: 0.4, expression: 0.2, ambient: 0.25 },
};
/** The kite's preferences, applied live: size (K-14; the onboarding stage keeps its own), liveliness, and color (K-15). */
export function applyKitePreferences(settings: Pick<AppSettings, 'kiteSize' | 'liveliness' | 'kiteSkin'>, options: { size?: boolean } = {}) {
  if (options.size !== false) config.scale = kiteSizes[settings.kiteSize] ?? 1;
  config.motion = { ...livelinessMotion[settings.liveliness] ?? livelinessMotion.lively };
  document.documentElement.dataset.skin = settings.kiteSkin ?? 'rose';
}
