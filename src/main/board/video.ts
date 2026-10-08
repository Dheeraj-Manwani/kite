import { randomUUID } from 'node:crypto';
import type { AppSettings, VoiceEvent } from '../../shared/types';
import type { LessonInput } from '../../shared/board';
import { boardVideoPlan, videoLimits, type BoardNarration, type BoardVideoPlan } from '../../shared/boardVideo';
import { TTSService } from '../voice/tts';
export interface VideoSnapshot { id: number; revision: string; lesson: LessonInput; streaming: boolean }
/** Dedicated TTS connection; never emits to live voice playback or adopts its prefetch cache. */
export function synthesizeBoardNarration(text: string, settings: AppSettings, key: () => string | undefined, signal: AbortSignal, createEngine = (emit: (event: VoiceEvent) => void) => new TTSService(key, emit)): Promise<BoardNarration> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted(); const parts: Uint8Array[] = []; let bytes = 0, timestamps: BoardNarration['timestamps'], finished = false;
    const finish = (error?: Error) => { if (finished) return; finished = true; clearTimeout(timer); signal.removeEventListener('abort', abort); engine.close();
      if (error) reject(error); else { const pcm = new Uint8Array(bytes); let offset = 0; for (const part of parts) { pcm.set(part, offset); offset += part.length; } resolve({ pcm, timestamps }); } };
    const abort = () => finish(new Error('Video export cancelled.'));
    const engine = createEngine((event: VoiceEvent) => {
      if (finished) return;
      if (event.type === 'tts:chunk' && event.audio) { const part = new Uint8Array(event.audio); bytes += part.length;
        if (bytes > videoLimits.pcmBytes || bytes > 44100 * 4 * videoLimits.beatSeconds) { finish(new Error('A narration beat exceeds the video limit.')); return; } parts.push(part); }
      if (event.type === 'tts:timestamps' && event.timestamps) { timestamps ??= { words: [], start: [], end: [] };
        timestamps.words.push(...event.timestamps.words); timestamps.start.push(...event.timestamps.start); timestamps.end.push(...event.timestamps.end); }
      if (event.type === 'tts:error') finish(new Error('Narration could not be generated. Check the voice key and try again.'));
      if (event.type === 'tts:done') finish(bytes ? undefined : new Error('Narration was empty.'));
    });
    const timer = setTimeout(() => finish(new Error('Narration timed out.')), 90_000);
    signal.addEventListener('abort', abort, { once: true }); engine.speak(-1, { ...settings, ttsEnabled: true }, text);
  });
}
export class BoardVideoExports {
  private job?: { plan: BoardVideoPlan; id: number; revision: string; settings: AppSettings; next: number; pending: boolean; controller: AbortController; timer: ReturnType<typeof setTimeout> };
  constructor(private current: () => VideoSnapshot | undefined, private synthesize: (text: string, settings: AppSettings, signal: AbortSignal) => Promise<BoardNarration>) {}
  prepare(id: number, revision: string, settings: AppSettings) {
    const snapshot = this.current(); if (!snapshot || snapshot.id !== id || snapshot.revision !== revision) throw new Error('The board changed. Try again.');
    if (snapshot.streaming) throw new Error('Wait for the lesson to finish planning before exporting video.');
    if (!settings.voiceId) throw new Error('Choose a narration voice in Settings first.');
    this.cancel(); const plan = boardVideoPlan(randomUUID(), snapshot.lesson);
    this.job = { plan, id, revision, settings: { ...settings }, next: 0, pending: false, controller: new AbortController(), timer: setTimeout(() => this.cancel(plan.token), videoLimits.durationMs) };
    return plan;
  }
  private active(token: string) {
    const job = this.job, current = this.current();
    if (!job || job.plan.token !== token || current?.id !== job.id || current.revision !== job.revision) { if (job?.plan.token === token) this.cancel(token); throw new Error('Video export cancelled or the board changed.'); } return job;
  }
  async narration(token: string, beat: number) {
    const job = this.active(token); if (!Number.isInteger(beat) || beat !== job.next || beat >= job.plan.beats.length || job.pending) throw new Error('Invalid narration beat.');
    job.pending = true;
    try { const audio = await this.synthesize(job.plan.beats[beat].say, job.settings, job.controller.signal); this.active(token); job.next++; return audio; }
    catch (error) { this.cancel(token); throw error; } finally { job.pending = false; }
  }
  complete(token: string) { const job = this.active(token); if (job.pending || job.next !== job.plan.beats.length) throw new Error('The video replay is incomplete.'); const title = job.plan.title; this.cancel(token); return title; }
  changed(id?: number, revision?: string) { if (this.job && (this.job.id !== id || this.job.revision !== revision)) this.cancel(); }
  cancel(token?: string) { const job = this.job; if (!job || token && token !== job.plan.token) return; this.job = undefined; clearTimeout(job.timer); job.controller.abort(); }
}
