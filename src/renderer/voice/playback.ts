/** One audio clock drives scheduling, animation amplitude, and word reveal. */
export class VoicePlayback {
  private context?: AudioContext;
  private analyser?: AnalyserNode;
  private samples = new Float32Array(1024);
  private sources = new Set<AudioBufferSourceNode>();
  private segments: { at: number; start: number; duration: number }[] = [];
  private nextStartTime = 0;
  private duration = 0;
  private done = false;
  private reported = false;
  private generation = 0;
  private queue: Promise<void> = Promise.resolve();
  private queued = 0;
  private ended = false;
  level = 0;
  constructor(private report: (event: 'started' | 'ended' | 'failed') => void) {}
  begin() { this.stop(); }
  async warm() {
    this.context ??= new AudioContext({ sampleRate: 44100 });
    if (!this.analyser) { this.analyser = this.context.createAnalyser(); this.analyser.fftSize = 1024; this.analyser.connect(this.context.destination); }
    if (this.context.state === 'suspended') await this.context.resume();
  }
  chunk(bytes: ArrayBuffer) {
    const generation = this.generation; this.queued++;
    this.queue = this.queue.then(async () => {
      if (generation !== this.generation) return;
      await this.warm();
      if (generation !== this.generation) return;
      if (!bytes.byteLength || bytes.byteLength % 4) throw new Error('Invalid PCM frame');
      const samples = new Float32Array(bytes);
      const buffer = this.context.createBuffer(1, samples.length, 44100); buffer.copyToChannel(samples, 0);
      const source = this.context.createBufferSource(); source.buffer = buffer; source.connect(this.analyser);
      const at = Math.max(this.nextStartTime, this.context.currentTime + (this.segments.length ? 0.005 : 0.1));
      this.segments.push({ at, start: this.duration, duration: buffer.duration }); this.duration += buffer.duration;
      this.nextStartTime = at + buffer.duration; this.sources.add(source);
      source.onended = () => { this.sources.delete(source); source.disconnect(); if (generation === this.generation) this.checkDone(); };
      source.start(at);
    }).catch(() => { if (generation === this.generation) { this.stop(); this.report('failed'); } })
      .finally(() => { if (generation === this.generation) { this.queued--; this.checkDone(); } });
  }
  finish() { this.done = true; this.checkDone(); }
  private checkDone() {
    if (this.done && !this.sources.size && !this.queued && !this.ended) { this.ended = true; this.level = 0; this.report('ended'); }
  }
  sample(dt: number) {
    if (!this.context || !this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this.samples);
    const rms = Math.sqrt(this.samples.reduce((sum, x) => sum + x * x, 0) / this.samples.length);
    this.level += (Math.min(1, rms * 7) - this.level) * (1 - Math.exp(-dt * 22));
    if (!this.reported && this.segments.length && this.context.currentTime >= this.segments[0].at + (this.context.outputLatency || 0)) { this.reported = true; this.report('started'); }
    return this.level;
  }
  get elapsed() {
    if (!this.context || !this.segments.length) return -1;
    const now = this.context.currentTime - (this.context.outputLatency || 0);
    let elapsed = -1;
    for (const s of this.segments) {
      if (now < s.at) break;
      elapsed = s.start + Math.min(s.duration, now - s.at);
    }
    return elapsed;
  }
  stop() {
    this.generation++;
    for (const source of this.sources) { source.onended = null; try { source.stop(); } catch { /* Already ended. */ } source.disconnect(); }
    this.sources.clear(); this.segments = []; this.duration = 0; this.nextStartTime = 0; this.done = false; this.reported = false;
    this.level = 0; this.queue = Promise.resolve(); this.queued = 0; this.ended = false;
  }
  dispose() { this.stop(); void this.context?.close(); }
}
