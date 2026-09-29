import type { OneShot } from './behaviors';
/** Ephemeral inputs and diagnostics: never React/Zustand animation state. */
export const runtime = {
  reducedMotion: false, frameMs: 0, renderedFrames: 0,
  trigger: null as OneShot | null,
  audioLevel: undefined as number | undefined,
  speechLevel: undefined as number | undefined,
  fakeLevels: false,
  fps: 0,
  behavior: 'content',
  panelOpen: false,
};

/** Future mic/TTS adapters can update these without rendering a React component. */
export function setMotionLevels(levels: { audioLevel?: number; speechLevel?: number }) {
  runtime.audioLevel = levels.audioLevel;
  runtime.speechLevel = levels.speechLevel;
}
