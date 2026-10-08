import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { BoardElement, BoardPaper } from './BoardLayer';
import { BoardPlayer } from './player';
import { fontStyle } from './export';
import { elementBounds, planCamera } from '../../shared/board';
import { cueTimings } from '../../shared/boardTeaching';
import { themeInk, themePaper } from '../../shared/boardDelight';
import { videoLimits, type BoardNarration, type BoardVideoPlan } from '../../shared/boardVideo';
/** Render only a frozen board into a canvas; audio goes to the recorder, never the speakers or microphone. */
export async function recordBoardVideo(plan: BoardVideoPlan, narration: (beat: number) => Promise<BoardNarration>, signal: AbortSignal, progress: (message: string) => void): Promise<Uint8Array> {
  const mimeType = typeof MediaRecorder !== 'undefined' && ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus'].find(type => MediaRecorder.isTypeSupported(type));
  if (!mimeType) throw new Error('WebM recording is unavailable on this device.');
  const audio = new AudioContext({ sampleRate: 44100 }), destination = audio.createMediaStreamDestination();
  const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
  const context = canvas.getContext('2d'); if (!context) { await audio.close(); throw new Error('Video canvas unavailable.'); }
  let stream: MediaStream, videoTrack: CanvasCaptureMediaStreamTrack, recorder: MediaRecorder;
  try {
    stream = canvas.captureStream(24); videoTrack = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
    destination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_000_000, audioBitsPerSecond: 96_000 });
  } catch { stream?.getTracks().forEach(track => track.stop()); await audio.close(); throw new Error('Video recording could not start on this device.'); }
  const stage = document.createElement('div'); stage.style.cssText = 'position:fixed;left:-10000px;top:0;width:1280px;height:600px;pointer-events:none'; document.body.append(stage);
  stage.setAttribute('aria-hidden','true');
  stage.append(canvas); const drawing = document.createElement('div'); stage.append(drawing);
  const root = createRoot(drawing), player = new BoardPlayer(), chunks: Blob[] = []; let bytes = 0, failure: Error | undefined, source: AudioBufferSourceNode | undefined;
  const stopped = new Promise<void>(resolve => { recorder.onstop = () => resolve(); });
  recorder.ondataavailable = event => { if (!event.data.size) return; bytes += event.data.size; if (bytes > videoLimits.bytes) { failure = new Error('Video exceeds the 100 MB export limit.'); if (recorder.state !== 'inactive') recorder.stop(); } else chunks.push(event.data); };
  recorder.onerror = () => { failure = new Error('Video recording failed.'); if (recorder.state !== 'inactive') recorder.stop(); };
  const abort = () => { try { source?.stop(); } catch { /* Already ended. */ } if (recorder.state !== 'inactive') recorder.stop(); };
  const deadline = Date.now() + videoLimits.durationMs;
  const check = () => { signal.throwIfAborted(); if (Date.now() > deadline) throw new Error('Video export timed out.'); if (failure) throw failure; };
  signal.addEventListener('abort', abort, { once: true });
  try {
    check(); await audio.resume(); const fonts = await fontStyle(), narrations: BoardNarration[] = []; let totalPcm = 0;
    for (let i = 0; i < plan.beats.length; i++) {
      check(); progress(`Preparing narration ${i + 1} of ${plan.beats.length}…`); const item = await narration(i); check();
      if (!item.pcm.byteLength || item.pcm.byteLength % 4 || item.pcm.byteLength > videoLimits.pcmBytes) throw new Error('Invalid narration audio.');
      totalPcm += item.pcm.byteLength; if (totalPcm > 64_000_000) throw new Error('Narration exceeds the 64 MB export limit.'); narrations.push(item);
    }
    context.fillStyle = themePaper(plan.appearance.theme); context.fillRect(0,0,1280,720); recorder.start(1000);
    for (const [i, beat] of plan.beats.entries()) {
      check(); progress(`Recording beat ${i + 1} of ${plan.beats.length}…`);
      const pcm = narrations[i].pcm, samples = new Float32Array(new Uint8Array(pcm).buffer);
      if (samples.some(n => !Number.isFinite(n))) throw new Error('Invalid narration samples.');
      const buffer = audio.createBuffer(1,samples.length,44100); buffer.copyToChannel(samples,0);
      const viewport = { width: 1280, height: 600 }, cam = planCamera(beat.scene, beat.ids, viewport, null), prefix = `video-${i}`;
      flushSync(() => root.render(<svg xmlns="http://www.w3.org/2000/svg" width={1280} height={600} viewBox={`${cam.x} ${cam.y} ${1280 / cam.scale} ${600 / cam.scale}`}>
        <style>{fonts}</style><BoardPaper appearance={plan.appearance} prefix={prefix} />
        {beat.scene.map(e => <BoardElement key={prefix + e.id} e={e} prefix={prefix} appearance={plan.appearance} animated={beat.ids.includes(e.id)} before={beat.changed.includes(e.id) ? beat.before.find(old => old.id === e.id) : undefined}
          dim={beat.effects?.some(f => f.kind === 'dim' && !f.ids.includes(e.id))} />)}
        {beat.before.filter(e => beat.erased.includes(e.id)).map(e => <g key={`erase-${e.id}`} data-el={e.id} data-kind="erase" data-order={0}><BoardElement e={e} prefix={`${prefix}-erase`} appearance={plan.appearance} animated={false} /></g>)}
        {(beat.effects ?? []).flatMap((effect,i) => {
          const ids = effect.kind === 'badge' ? [effect.id] : effect.ids;
          return ids.map(id => { const e = beat.scene.find(n => n.id === id); if (!e || effect.kind === 'dim') return null; const b = elementBounds(e), ink = themeInk(plan.appearance.theme,'red').stroke;
            return <g key={i + '-' + id} data-teaching-effect="1" data-el={'effect-' + i + '-' + id}>
              {effect.kind === 'badge' ? <><circle data-kind="stroke" data-order={0} cx={b.x - 20} cy={b.y + 10} r={14} stroke={ink} fill={themePaper(plan.appearance.theme)} /><text data-kind="text" data-order={1} x={b.x - 20} y={b.y + 16} fill={ink} textAnchor="middle" fontSize={18}>{effect.number}</text></>
                : effect.kind === 'pulse' ? <rect x={b.x - 8} y={b.y - 8} width={b.width + 16} height={b.height + 16} fill="none" stroke={ink} strokeWidth={2} opacity={0.4} />
                : <path data-kind="stroke" data-order={0} d={'M' + b.x + ' ' + (effect.kind === 'strike' ? b.y + b.height / 2 : b.y + b.height + 8) + 'h' + b.width} stroke={ink} strokeWidth={2.5} />}
            </g>;
          });
        })}
      </svg>));
      const svg = stage.querySelector('svg'), groups = [...beat.ids, ...beat.erased].map(id => svg.querySelector(`[data-el="${CSS.escape(id)}"]`)).filter(Boolean);
      groups.push(...svg.querySelectorAll('[data-teaching-effect]'));
      const inputs = beat.scene.filter(e => beat.ids.includes(e.id)).map(e => ({ id: e.id, type: 'text' as const, text: e.kind === 'text' ? e.text.lines.join(' ') : e.kind === 'shape' || e.kind === 'arrow' ? e.label?.lines.join(' ') : '' }));
      const cues = cueTimings(inputs, beat.say, beat.cues, narrations[i].timestamps);
      const end = Math.max(0,...cues.map(c => c.startMs + c.durationMs));
      cues.push(...beat.erased.map(id => ({ id, startMs: 0, durationMs: Math.min(600,buffer.duration * 1000) })));
      cues.push(...Array.from(svg.querySelectorAll('[data-teaching-effect]')).map(g => ({ id: g.getAttribute('data-el'), startMs: Math.max(0,buffer.duration * 1000 - 500), durationMs: 500 })));
      // Narration's actual duration caps estimated cue intervals when a voice omits word timestamps.
      for (const cue of cues) { cue.startMs *= Math.min(1,buffer.duration * 1000 / Math.max(1,end)); cue.durationMs *= Math.min(1,buffer.duration * 1000 / Math.max(1,end)); }
      let at = audio.currentTime + 0.08;
      player.play(i,svg,groups,buffer.duration * 1000,(): void => undefined,false,0,undefined,{ cues, clock: () => Math.max(0,(audio.currentTime - at) * 1000) });
      const paint = async () => {
        check(); player.tick(performance.now()); const image = new Image(); image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg)); await image.decode(); check();
        context.fillStyle = themePaper(plan.appearance.theme); context.fillRect(0,0,1280,720); context.drawImage(image,0,0,1280,600);
        context.fillStyle = '#101820'; context.fillRect(0,600,1280,120); context.fillStyle = '#ffffff'; context.font = '22px sans-serif';
        context.fillText(plan.title,24,632,1150); context.font = '20px sans-serif';
        const words = beat.say.split(/\s+/), lines: string[] = []; let line = '';
        for (const word of words) { if (context.measureText(`${line} ${word}`).width > 1220 && line) { lines.push(line); line = word; } else line = `${line} ${word}`.trim(); }
        if (line) lines.push(line);
        // Paginate captions over time instead of dropping long narration from the video.
        const page = Math.min(Math.max(0,Math.ceil(lines.length / 2) - 1),Math.floor(Math.max(0,audio.currentTime - at) / buffer.duration * Math.ceil(lines.length / 2)));
        lines.slice(page * 2,page * 2 + 2).forEach((text,row) => context.fillText(text,24,665 + row * 28,1232));
        videoTrack.requestFrame();
      };
      await paint(); at = audio.currentTime + 0.08; source = audio.createBufferSource(); source.buffer = buffer; source.connect(destination); source.start(at);
      while (audio.currentTime < at + buffer.duration + 0.18) { await paint(); await new Promise<void>(resolve => setTimeout(resolve,1000 / 24)); }
      player.complete(); await paint(); source.disconnect(); source = undefined;
      const holdUntil = audio.currentTime + (i === plan.beats.length - 1 ? 0.75 : 0.15);
      while (audio.currentTime < holdUntil) { await paint(); await new Promise<void>(resolve => setTimeout(resolve,1000 / 24)); }
    }
    if (recorder.state !== 'inactive') recorder.stop(); await stopped; check();
    if (bytes < 32) throw new Error('The recorder produced no video. Keep Kite open and try again.');
    return new Uint8Array(await new Blob(chunks,{ type: mimeType }).arrayBuffer());
  } finally {
    signal.removeEventListener('abort',abort); abort(); if (recorder.state !== 'inactive') recorder.stop();
    recorder.ondataavailable = null; recorder.onerror = null;
    stream.getTracks().forEach(track => track.stop()); player.cancel(); root.unmount(); stage.remove(); await audio.close();
  }
}
