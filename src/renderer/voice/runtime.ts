import type { Timing } from '../../shared/types';
export type Reaction = 'perk' | 'puzzled' | 'aha' | 'happy' | 'tangled' | 'flinch' | 'costume' | 'phew' | 'proposing' | 'approved' | 'success' | 'denied' | 'alarm' | 'nod' | 'flutter';
export const voiceRuntime = {
  tickAudio: null as ((dt: number) => void) | null,
  bubble: null as HTMLElement | null,
  hover: false,
  waitingSince: 0,
  reaction: null as { kind: Reaction; at: number; intensity?: number } | null,
  mutedUntil: 0,
  toolPose: null as 'proposing' | 'executing' | null,
  /** When the pending approval auto-cancels (Date.now() ms), for the kite's one nudge in its last 5 s. */
  approvalEndsAt: 0,
  /** When the latest spoken word began (performance.now() ms), for the kite's small nods while talking. */
  wordAt: 0,
  alarmUntil: 0,
  voiceAverageMs: undefined as number | undefined,
  timing: null as Timing | null,
  captureStartMs: 0,
  /** A guide step is being spoken without a bubble; the kite keeps pointing while it talks. */
  quiet: false,
};
export function react(kind: Reaction, intensity = 1) { voiceRuntime.reaction = { kind, at: performance.now(), intensity }; }
