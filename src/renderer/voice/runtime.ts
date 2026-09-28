import type { Timing } from '../../shared/types';
export type Reaction = 'perk' | 'puzzled' | 'aha' | 'happy' | 'tangled' | 'flinch' | 'costume' | 'phew' | 'proposing' | 'approved' | 'success' | 'denied' | 'alarm';
export const voiceRuntime = {
  tickAudio: null as ((dt: number) => void) | null,
  bubble: null as HTMLElement | null,
  hover: false,
  waitingSince: 0,
  reaction: null as { kind: Reaction; at: number } | null,
  mutedUntil: 0,
  toolPose: null as 'proposing' | 'executing' | null,
  alarmUntil: 0,
  voiceAverageMs: undefined as number | undefined,
  timing: null as Timing | null,
  captureStartMs: 0,
};
export function react(kind: Reaction) { voiceRuntime.reaction = { kind, at: performance.now() }; }
