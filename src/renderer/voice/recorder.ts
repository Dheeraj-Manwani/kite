import { splitMarks, submittedStrokes } from '../vision/runtime';
import { boardRuntime } from '../board/runtime';
import { runtime } from '../kite/runtime';
import { voiceRuntime } from './runtime';

const SILENCE_RMS = 0.012;
const MIME = 'audio/webm;codecs=opus';
/** Tracks stay disabled between presses; the analyser runs in the kite's one rAF. */
export class VoiceRecorder {
  private stream: MediaStream | undefined;
  private context: AudioContext | undefined;
  private analyser: AnalyserNode | undefined;
  private source: MediaStreamAudioSourceNode | undefined;
  private samples: Float32Array<ArrayBuffer> | undefined;
  private warmup: Promise<void> | undefined;
  private disposed = false;
  private current: { id: number; recorder?: MediaRecorder; peak: number; discard: boolean; chunks: Blob[] } | undefined;
  warm() {
    if (this.warmup) return this.warmup;
    this.warmup = (async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (this.disposed) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      stream.getAudioTracks().forEach(track => { track.enabled = false; });
      this.context = new AudioContext();
      this.analyser = this.context.createAnalyser(); this.analyser.fftSize = 1024;
      this.samples = new Float32Array(this.analyser.fftSize);
      this.source = this.context.createMediaStreamSource(stream);
      this.source.connect(this.analyser); // Never route microphone back to speakers.
      await this.context.suspend();
    })().catch(error => { this.warmup = undefined; throw error; });
    return this.warmup;
  }
  async start(id: number) {
    this.cancel();
    const job = { id, peak: 0, discard: false, chunks: [] as Blob[], recorder: undefined as MediaRecorder | undefined };
    this.current = job;
    const began = performance.now();
    try {
      await this.warm();
      if (this.disposed || this.current !== job) return;
      if (!MediaRecorder.isTypeSupported(MIME)) throw new Error('Opus recording is unavailable');
      this.stream?.getAudioTracks().forEach(track => { track.enabled = true; });
      await this.context?.resume();
      if (this.current !== job) return;
      const recorder = new MediaRecorder(this.stream as MediaStream, { mimeType: MIME, audioBitsPerSecond: 64000 });
      job.recorder = recorder;
      recorder.ondataavailable = event => { if (event.data.size && !job.discard) job.chunks.push(event.data); };
      recorder.onerror = () => {
        if (this.current !== job) return;
        window.kite.reportAudioResult(id, 'captureFailed'); this.cancel();
      };
      recorder.onstop = async () => {
        if (job.discard || this.disposed) return;
        try {
          const all = submittedStrokes(id), { strokes, marks } = splitMarks(all, boardRuntime.hit, boardRuntime.frame);
          if ((job.peak < SILENCE_RMS || !job.chunks.length) && !all.length) { window.kite.reportAudioResult(id, 'empty'); return; }
          const buffer = job.peak < SILENCE_RMS ? new ArrayBuffer(0) : await new Blob(job.chunks, { type: MIME }).arrayBuffer();
          if (job.discard || this.disposed) return;
          const result = await window.kite.submitAudio(buffer, id, strokes, marks);
          if (!result.ok) window.kite.reportAudioResult(id, 'captureFailed');
        } catch { window.kite.reportAudioResult(id, 'captureFailed'); }
        finally { job.chunks = []; }
      };
      recorder.start(100);
      voiceRuntime.captureStartMs = performance.now() - began;
    } catch (error) {
      if (this.current !== job || this.disposed) return;
      window.kite.reportAudioResult(id, error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError') ? 'micDenied' : 'captureFailed');
      this.cancel();
    }
  }
  sample(dt: number) {
    const job = this.current;
    if (!job?.recorder || job.recorder.state !== 'recording' || !this.analyser || !this.samples) return;
    this.analyser.getFloatTimeDomainData(this.samples);
    let sum = 0; for (const value of this.samples) sum += value * value;
    const rms = Math.sqrt(sum / this.samples.length);
    job.peak = Math.max(job.peak, rms);
    const level = Math.min(1, rms * 7);
    runtime.audioLevel = (runtime.audioLevel ?? 0) + (level - (runtime.audioLevel ?? 0)) * (1 - Math.exp(-dt * 18));
  }
  stop(id: number) {
    const job = this.current;
    if (!job || job.id !== id) return;
    // Releasing while permission/device setup is pending must never start a late recording.
    if (!job.recorder) {
      const all = submittedStrokes(id), { strokes, marks } = splitMarks(all, boardRuntime.hit, boardRuntime.frame); this.cancel();
      if (all.length) void window.kite.submitAudio(new ArrayBuffer(0), id, strokes, marks); else window.kite.reportAudioResult(id, 'empty'); return;
    }
    this.sample(1 / 60);
    if (job.recorder.state !== 'inactive') job.recorder.stop();
    this.current = undefined; this.pause();
  }
  private pause() {
    this.stream?.getAudioTracks().forEach(track => { track.enabled = false; });
    void this.context?.suspend().catch((): void => undefined);
    runtime.audioLevel = 0;
  }
  cancel() {
    const job = this.current;
    if (job) { job.discard = true; job.chunks = []; if (job.recorder?.state !== 'inactive') job.recorder?.stop(); }
    this.current = undefined; this.pause();
  }
  dispose() {
    this.disposed = true; this.cancel(); this.stream?.getTracks().forEach(track => track.stop());
    this.source?.disconnect(); void this.context?.close().catch((): void => undefined);
  }
}
