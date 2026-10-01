/**
 * Earcons (docs/design.md §K4, "Sound", K-13): short tones made with WebAudio oscillators, so there are no audio files
 * or licences. They confirm push-to-talk without looking: a rising chirp when Kite starts listening, a soft falling note on
 * release, and a gentle chime when an approval needs you. Off by default, quiet when on (Settings → Voice).
 */
export const earcons = { enabled: false };
export type Earcon = 'listen' | 'release' | 'approval';

// Each cue is a few notes: frequency (Hz), start and length (s), and an optional glide to another frequency.
const cues: Record<Earcon, { f: number; at: number; len: number; to?: number }[]> = {
  listen: [{ f: 660, at: 0, len: .07 }, { f: 880, at: .075, len: .09 }],
  release: [{ f: 620, at: 0, len: .14, to: 440 }],
  approval: [{ f: 880, at: 0, len: .32 }, { f: 1320, at: .09, len: .38 }],
};
const PEAK = .05;
let context: AudioContext | null = null;

/** `force` plays it even with the setting off, for the preview in Settings. */
export function earcon(kind: Earcon, force = false) {
  if (!earcons.enabled && !force) return;
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume();
    const now = context.currentTime + .01;
    for (const note of cues[kind]) {
      const osc = context.createOscillator(), gain = context.createGain(), start = now + note.at, end = start + note.len;
      osc.type = 'sine'; osc.frequency.setValueAtTime(note.f, start);
      if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to, end);
      // A soft attack and an exponential tail, so nothing clicks.
      gain.gain.setValueAtTime(0.0001, start); gain.gain.exponentialRampToValueAtTime(PEAK, start + .012); gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain).connect(context.destination); osc.start(start); osc.stop(end + .02);
    }
  } catch { /* no audio device: the cue is a nicety, never an error */ }
}

/** Let someone hear the cues when they turn them on: the listening chirp, then the release. */
export function previewEarcons() { earcon('listen', true); setTimeout(() => earcon('release', true), 450); }
