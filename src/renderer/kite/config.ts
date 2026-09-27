export const KITE_SCALE = 1;
/** Mutable dev tuning. The frame loop reads this object without React updates. */
export const config = {
  stiffness: 420, damping: 38, wagAmplitude: 0.15, wagFrequency: 0.65,
  scale: KITE_SCALE, bodyHeight: 22, bodyWidth: 26, baseAngle: 0,
  offsetX: 32, offsetY: 28,
  bankLimit: 3, bankGain: 0.003,
  rotationStiffness: 160, rotationDamping: 28, stretchGain: 0, maxStretch: 1,
  tailDots: [{ x: 1.2, y: 13, size: 2.3 }, { x: 3.2, y: 17, size: 1.8 }],
  tailWagLimit: 0.35,
  automaticOneShots: false, personalityAmount: 0.12,
  moodBlend: 0.25, behaviorBlend: 0.3, maxDt: 1 / 30,
  stillSpeed: 12, excitedSpeed: 1100, boredAfter: 8, dozeAfter: 30,
  gustMin: 6, gustMax: 15, gustDuration: 1.3, wakeDuration: 1.2, dizzyDuration: 1.4,
  shakeSpeed: 180, shakeWindow: 0.6, shakeReversals: 4, shakeCooldown: 2,
  eyes: false, blinkMin: 3, blinkMax: 7, blinkDuration: 0.13,
};
