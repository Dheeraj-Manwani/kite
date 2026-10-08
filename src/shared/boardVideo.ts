import { applyBeat, layoutScene, type LessonInput, type LaidElement } from './board';
import { applyEdits } from './boardEditing';
import { boardAppearance, type BoardAppearance } from './boardDelight';
import type { WordTiming } from './boardTeaching';
export interface BoardVideoPlan { token: string; title: string; appearance: BoardAppearance; beats: { say: string; scene: LaidElement[]; before: LaidElement[]; ids: string[]; erased: string[]; changed: string[]; cues?: LessonInput['beats'][number]['cues']; effects?: LessonInput['beats'][number]['effects'] }[] }
export interface BoardNarration { pcm: Uint8Array; timestamps?: WordTiming }
export const videoLimits = { bytes: 100_000_000, pcmBytes: 12_000_000, durationMs: 15 * 60_000, beatSeconds: 60 } as const;
/** Freeze a local lesson for export; replay quizzes as captions, with no interactive answer wait. */
export function boardVideoPlan(token: string, lesson: LessonInput): BoardVideoPlan {
  let inputs: Parameters<typeof layoutScene>[0] = [];
  const beats = lesson.beats.slice(0, 32).map(beat => {
    const before = layoutScene(applyEdits(inputs, lesson.edits ?? { elements: [], deleted: [] }));
    inputs = applyBeat(inputs, beat);
    const scene = layoutScene(applyEdits(inputs, lesson.edits ?? { elements: [], deleted: [] })), present = new Set(scene.map(e => e.id));
    return { say: beat.ask ? `${beat.say} ${beat.ask}` : beat.say, scene, before, ids: (beat.draw ?? []).map(e => e.id).filter(id => present.has(id)),
      erased: before.filter(e => !present.has(e.id)).map(e => e.id), changed: (beat.draw ?? []).filter(e => before.some(old => old.id === e.id)).map(e => e.id), cues: beat.cues, effects: beat.effects };
  });
  return { token, title: lesson.title, appearance: boardAppearance(lesson.appearance), beats };
}
export function validBoardWebm(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array && value.byteLength >= 32 && value.byteLength <= videoLimits.bytes
    && value[0] === 0x1a && value[1] === 0x45 && value[2] === 0xdf && value[3] === 0xa3;
}
