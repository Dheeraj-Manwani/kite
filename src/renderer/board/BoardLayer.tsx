import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SailMark } from '../kite/SailMark';
import { boardFontFamily, canvas, elementBounds, elementsAt, fitView, lineHeight, panelChrome, panelSize, panelViewport, planCamera, sceneBounds, type BoardAction, type BoardView, type Camera, type LaidElement, type TextBlock } from '../../shared/board';
import { boardAppearance, handwritingStrokes, themeInk, themePaper, type BoardAppearance } from '../../shared/boardDelight';
import type { ScreenBounds } from '../../shared/types';
import { cursorInput } from '../kite/useKiteLoop';
import { runtime } from '../kite/runtime';
import { ringPaths } from '../guide/ring';
import { react, voiceRuntime } from '../voice/runtime';
import { elementStrokes } from './rough';
import { BoardPlayer } from './player';
import { boardRuntime } from './runtime';
import { exportPng } from './export';
import { useBoardEditor } from './BoardEditor';
/** Written line by line; the player clips each line while it is being "handwritten". */
function Lines({ block, color, clip, order, animated = true, appearance }: { block: TextBlock; color: string; clip: string; order: number; animated?: boolean; appearance?: BoardAppearance }) {
  const letters = appearance?.handwriting && handwritingStrokes(block);
  if (letters) return <g aria-label={block.lines.join(' ')} data-handwriting="1">
    {block.halo && <rect x={block.x - 4} y={block.y - 2} width={block.width + 8} height={block.height + 4} fill={themePaper(appearance.theme)} />}
    {letters.map((letter, i) => <path key={i} d={letter.d} transform={letter.transform} data-kind={animated ? 'stroke' : undefined} data-order={order + i} fill="none" stroke={color} strokeWidth={1.05} strokeLinecap="round" strokeLinejoin="round" />)}
  </g>;
  return <>{block.lines.map((line, i) => {
    const x = block.align === 'center' ? block.x + block.width / 2 : block.x, id = `${clip}-${i}`;
    return <g key={i}>
      <clipPath id={id}><rect x={0} y={0} width={0} height={0} /></clipPath>
      <text data-kind={animated ? 'text' : undefined} data-order={order + i} data-clip={id} x={x} y={block.y + i * block.size * lineHeight + block.size}
        fontSize={block.size} fontFamily={boardFontFamily} fill={color} stroke={block.halo ? themePaper(appearance?.theme ?? 'paper') : undefined} strokeWidth={block.halo ? 6 : undefined} paintOrder={block.halo ? 'stroke' : undefined} strokeLinejoin="round" textAnchor={block.align === 'center' ? 'middle' : 'start'}>{line}</text>
    </g>;
  })}</>;
}
/** One element in drawing order: fill (under), outline passes, arrowheads, then its words. */
export const BoardElement = memo(function BoardElement({ e, prefix, before, animated = true, dim = false, pulse = false, appearance }: { e: LaidElement; prefix: string; before?: LaidElement; animated?: boolean; dim?: boolean; pulse?: boolean; appearance?: BoardAppearance }) {
  const strokes = useMemo(() => elementStrokes(e), [e]);
  const color = themeInk(appearance?.theme ?? 'paper', e.color), clip = `${prefix}-${e.id}`;
  const label = e.kind === 'text' ? e.text : e.kind === 'shape' || e.kind === 'arrow' ? e.label : null;
  const oldLabel = before?.kind === 'text' ? before.text : before?.kind === 'shape' || before?.kind === 'arrow' ? before.label : null;
  const a = before && elementBounds(before), b = elementBounds(e), moving = a && (a.x !== b.x || a.y !== b.y);
  const value = !!oldLabel && !!label && oldLabel.lines.join(' ') !== label.lines.join(' '), oldStrokes = before?.kind === 'arrow' ? elementStrokes(before) : [];
  let outline = 0;
  return <g data-el={e.id} data-kind={moving && e.kind !== 'arrow' && animated ? 'move' : undefined} data-order={5} data-from-x={moving ? a.x - b.x : undefined} data-from-y={moving ? a.y - b.y : undefined}
    className={pulse ? 'board-pulse' : undefined} opacity={dim ? 0.25 : undefined}>
    {e.kind === 'formula' && <g transform={`translate(${e.box.x} ${e.box.y}) scale(${e.box.width / e.formula.box.width} ${e.box.height / e.formula.box.height}) translate(${-e.formula.box.x} ${-e.formula.box.y})`} aria-label={e.label}>
      {e.formula.paths.map((p, i) => <path key={i} d={p.d} transform={p.transform} data-kind={animated ? 'stroke' : undefined} data-order={10 + i} fill="none" stroke={color.stroke} strokeWidth={35} strokeLinejoin="round" />)}
    </g>}
    {strokes.filter(s => s.role === 'fill').map((s, i) => <path key={`fill${i}`} d={s.d} data-kind={animated && !before ? 'fade' : undefined} data-fill="1" data-order={20}
      fill={s.ink ? color.stroke : s.solidFill ? color.fill : 'none'} stroke={s.solidFill ? 'none' : color.stroke} strokeOpacity={0.5} strokeWidth={1.3} strokeLinecap="round" />)}
    {strokes.filter(s => s.role !== 'fill').map((s, i) => {
      const second = s.role === 'outline' && outline++ > 0;
      return <path key={i} d={s.d} data-kind={!animated ? undefined : before?.kind === 'arrow' ? 'morph' : before ? undefined : s.dashed ? 'fade' : 'stroke'} data-from-path={oldStrokes.filter(p => p.role !== 'fill')[i]?.d} data-order={s.role === 'head' ? 30 + i : 10 + i} data-fast={second ? '1' : undefined}
        fill="none" stroke={color.stroke} strokeWidth={second ? 1.5 : 2.1} strokeDasharray={s.dashed ? '10 9' : undefined} strokeLinecap="round" strokeLinejoin="round" />;
    })}
    {e.kind === 'arrow' && e.label && <rect x={e.label.x - 5} y={e.label.y - 2} width={e.label.width + 10} height={e.label.height + 4} rx={6} fill={themePaper(appearance?.theme ?? 'paper')} opacity={0.9} />}
    {value && animated && <g data-kind="erase" data-order={0}>
      <Lines block={oldLabel} color={color.stroke} clip={`${clip}-previous`} order={0} animated={false} appearance={appearance} />
      <path d={`M${oldLabel.x} ${oldLabel.y + oldLabel.height / 2}h${oldLabel.width}`} stroke={color.stroke} strokeWidth={2} />
    </g>}
    {label && <Lines block={label} color={color.stroke} clip={clip} order={40} animated={animated && (!before || value)} appearance={appearance} />}
  </g>;
});
export function BoardPaper({ appearance, prefix }: { appearance: BoardAppearance; prefix: string }) {
  const fill = themePaper(appearance.theme), grid = `${prefix}-grid`;
  return <><rect className="board-sheet" x={-100000} y={-100000} width={200000} height={200000} fill={fill} />
    {appearance.theme === 'blueprint' && <><defs><pattern id={grid} patternUnits="userSpaceOnUse" width={32} height={32}><path d="M32 0H0V32" fill="none" stroke="#79aed0" strokeOpacity={0.18} strokeWidth={0.8} /></pattern></defs><rect x={-100000} y={-100000} width={200000} height={200000} fill={`url(#${grid})`} /></>}
  </>;
}
/** Where a new board opens on the display under the cursor; `presenting`: the large presentation panel. */
function initialFrame(presenting = false): ScreenBounds {
  const g = cursorInput.geometry, origin = g?.origin ?? { x: 0, y: 0 };
  const d = g ? { x: g.display.x - origin.x, y: g.display.y - origin.y, width: g.display.width, height: g.display.height } : { x: 0, y: 0, width: innerWidth, height: innerHeight };
  const { width, height } = panelSize(d, presenting);
  return { x: Math.round(d.x + (d.width - width) / 2), y: Math.round(d.y + Math.max(presenting ? 8 : 24, (d.height - height) / 2 - (presenting ? 0 : 16))), width, height };
}
const near = (a: Camera, b: Camera) => Math.abs(a.scale - b.scale) < 1e-4 && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
/** How long the camera takes to move to a beat before the pen starts. */
const glideMs = 500;
const onScreen = (f: ScreenBounds) => f.x + f.width > 40 && f.y + 20 > 0 && f.x < innerWidth - 40 && f.y < innerHeight - 40;
/**
 * The whiteboard: hand-drawn elements on paper, drawn beat by beat while Kite narrates. The kite holds
 * the pen (see boardRuntime). The panel can be dragged, resized, zoomed with the wheel, and panned.
 */
export function BoardLayer() {
  const [view, setView] = useState<BoardView | null>(null);
  const [frame, setFrame] = useState<ScreenBounds | null>(null);
  // `camera`: the user's own pan or zoom, which holds until Fit. `shown`: Kite's planned camera (planCamera), which
  // glides to each beat before its first stroke.
  const [camera, setCamera] = useState<Camera | null>(null);
  const [shown, setShown] = useState<Camera | null>(null);
  const planned = useRef<Camera | null>(null), focus = useRef<string[]>([]), glide = useRef(0), manual = useRef(false), board = useRef(-1), sized = useRef('');
  const restored = useRef<ScreenBounds | null>(null);
  const [toast, setToast] = useState('');
  const svg = useRef<SVGSVGElement>(null), player = useRef(new BoardPlayer()), current = useRef<BoardView | null>(null);
  const reduced = () => runtime.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    // Load the board's font before the first lesson, so its first words are not drawn in a fallback face.
    void document.fonts?.load('20px Excalifont', 'Aa').catch((): void => undefined);
    const off = window.kite.onBoardEvent(next => {
      const before = current.current;
      // Snapshot while the old SVG still exists. The archive row is saved by main before its event is sent.
      const capture = next?.editable && before?.id === next.id && before.revision !== next.revision && ['paused', 'done'].includes(next.status) ? next
        : next?.status === 'done' && (before?.status !== 'done' || before?.id !== next.id) ? next
        : before && (!next || next.id !== before.id) ? before : null;
      if (capture?.savedId && svg.current) {
        // A done event may add the last elements: capture after React commits it; closing clones immediately.
        const save = () => { void exportPng(svg.current, capture.elements, 420).then(png => window.kite.boardThumbnail(capture.savedId, png)).catch((): void => undefined); };
        if (capture === next) requestAnimationFrame(save); else save();
      }
      current.current = next;
      if (next?.stats) boardRuntime.stats = next.stats;
      if (next && before?.id !== next.id) { react('perk'); setFrame(f => f && onScreen(f) ? f : initialFrame()); setCamera(null); }
      if (next?.status === 'done' && before?.status !== 'done') react('success');
      if (!next) player.current.cancel();
      setView(next);
    });
    boardRuntime.tick = now => {
      const v = current.current, nib = player.current.tick(now);
      boardRuntime.pen = nib;
      // While a lesson plays, the kite stays at the board between strokes; paused or done, it comes home.
      boardRuntime.rest = v?.status === 'playing' ? player.current.last ?? boardRuntime.rest ?? restPoint() : v?.status === 'asking' ? restPoint() : null;
      boardRuntime.aim = null;
      if (v?.teaching && svg.current && !nib) {
        const audio = v.drawing?.audioId === voiceRuntime.audioId ? voiceRuntime.audioMs : -1;
        const cue = v.drawing?.cues?.filter(c => c.startMs <= audio).at(-1)?.id;
        const named = v.recap && v.highlight.length ? v.highlight[Math.floor(now / 1100) % v.highlight.length] : v.highlight[0];
        const target = v.elements.find(e => e.id === cue) ?? v.elements.find(e => e.id === named) ?? v.elements.find(e => v.drawing?.ids.includes(e.id));
        const matrix = svg.current.getScreenCTM();
        if (v.status === 'asking') boardRuntime.aim = { x: cursorInput.point.x - (cursorInput.geometry?.origin.x ?? 0), y: cursorInput.point.y - (cursorInput.geometry?.origin.y ?? 0) };
        else if (target && matrix) { const box = elementBounds(target), p = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(matrix); boardRuntime.aim = { x: p.x, y: p.y }; }
      }
    };
    return () => { off(); player.current.cancel(); boardRuntime.tick = null; boardRuntime.pen = null; boardRuntime.rest = null; boardRuntime.aim = null; boardRuntime.hit = null; boardRuntime.frame = null; window.kite.setBoardBounds(null); };
  }, []);
  const restPoint = () => { const f = boardRuntime.frame; return f ? { x: f.x + 60, y: f.y + panelChrome.header + 40 } : null; };
  const paper = frame ? panelViewport(frame) : { width: 1, height: 1 };
  const viewport = { ...paper, height: view?.editable ? Math.max(80, paper.height - 152) : paper.height };
  const elements = view?.elements ?? [];
  const fallback = useMemo(() => fitView(sceneBounds(elements), viewport, 40), [elements, viewport.width, viewport.height]);
  const cam = camera ?? shown ?? fallback;
  const editor = useBoardEditor(view, svg, cam, () => setCamera({ ...cam }));
  useEffect(() => window.kite.onBoardImageRequest?.(request => {
    const snapshot = current.current; if (!snapshot?.editable || snapshot.id !== request.id || snapshot.revision !== request.revision) return;
    void new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))).then(async () => {
      if (current.current?.id !== request.id || current.current.revision !== request.revision || svg.current?.dataset.revision !== request.revision) return;
      const png = await exportPng(svg.current, snapshot.elements, 1536); const next = current.current;
      if (next?.id === request.id && next.revision === request.revision) window.kite.boardImage(request.request,request.id,request.revision,png);
    }).catch((): void => undefined);
  }), []);
  manual.current = camera !== null;
  /**
   * Move Kite's camera to `to`: an eased glide, or a cut (a new board, a resized panel, reduced motion, or while the
   * user holds the view). Returns how long until it arrives. The glide writes the viewBox directly, frame by frame.
   */
  const moveTo = (to: Camera, cut: boolean) => {
    cancelAnimationFrame(glide.current);
    const from = planned.current; planned.current = to;
    if (cut || !from || reduced() || manual.current || near(from, to)) { setShown(to); return 0; }
    const start = performance.now(), size = viewport;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / glideMs), k = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const scale = from.scale + (to.scale - from.scale) * k, x = from.x + (to.x - from.x) * k, y = from.y + (to.y - from.y) * k;
      if (!manual.current) svg.current?.setAttribute('viewBox', `${x} ${y} ${size.width / scale} ${size.height / scale}`);
      if (t < 1) glide.current = requestAnimationFrame(step); else setShown(to);
    };
    glide.current = requestAnimationFrame(step);
    return glideMs;
  };
  useEffect(() => () => cancelAnimationFrame(glide.current), []);
  // Draw the beat's elements once per drawing key, after the camera has moved to them; a view without drawing shows everything at once.
  useLayoutEffect(() => {
    const drawing = view?.drawing, node = svg.current;
    if (!view || !drawing || !node) { player.current.cancel(); return; }
    if (player.current.key === drawing.key) return;
    if (board.current !== view.id) { board.current = view.id; planned.current = null; }
    focus.current = drawing.ids;
    const wait = moveTo(planCamera(view.elements, drawing.ids, viewport, planned.current), !!view.teaching);
    const ids = drawing.cues ? [...drawing.ids].sort((a, b) => (drawing.cues.find(c => c.id === a)?.startMs ?? 0) - (drawing.cues.find(c => c.id === b)?.startMs ?? 0)) : drawing.ids;
    const groups = [...ids, ...(view.transition?.erased ?? [])].map(id => node.querySelector(`[data-el="${CSS.escape(id)}"]`)).filter(Boolean);
    groups.push(...node.querySelectorAll('[data-teaching-effect]'));
    const end = Math.max(0, ...(drawing.cues ?? []).map(c => c.startMs + c.durationMs));
    const cues = drawing.cues && [...drawing.cues, ...groups.filter(g => !drawing.cues.some(c => c.id === g.getAttribute('data-el'))).map((g, i) => ({ id: g.getAttribute('data-el'), startMs: end + i * 120, durationMs: 120 }))];
    const id = view.id, key = drawing.key;
    player.current.last = null;
    player.current.play(key, node, groups, drawing.durationMs, () => window.kite.boardDrawn(id, key), reduced(), wait, () => window.kite.boardStarted(id, key), cues ? { cues, clock: () => current.current?.drawing?.audioId === voiceRuntime.audioId ? voiceRuntime.audioMs : -1,
      onCue: (_element, expected, actual) => window.kite.boardCue(id, key, expected, actual) } : undefined);
  }, [view?.drawing?.key, view?.id]);
  useLayoutEffect(() => {
    const cues = view?.drawing?.cues; if (!cues) return;
    const end = Math.max(0, ...cues.map(c => c.startMs + c.durationMs));
    const extras = [...(view.transition?.erased ?? []), ...Array.from(svg.current?.querySelectorAll('[data-teaching-effect]') ?? []).map(g => g.getAttribute('data-el'))];
    player.current.updateTiming([...cues, ...extras.filter(id => !cues.some(c => c.id === id)).map((id, i) => ({ id, startMs: end + i * 120, durationMs: 120 }))]);
  }, [view?.drawing?.cues]);
  // Between beats: keep the camera on the last beat; a finished lesson shows the whole board; a resized panel re-plans at once.
  useLayoutEffect(() => {
    if (!view || !frame || view.drawing) return;
    if (board.current !== view.id) { board.current = view.id; planned.current = null; focus.current = []; }
    const size = `${viewport.width}x${viewport.height}`, resized = sized.current !== size; sized.current = size;
    moveTo(planCamera(view.elements, view.status === 'done' ? [] : focus.current, viewport, planned.current), resized);
  }, [view?.id, view?.status, view?.drawing === null, elements.length, viewport.width, viewport.height]);
  // Presentation mode: the panel fills most of the screen, and goes back to where it was after.
  useEffect(() => {
    if (!view) { restored.current = null; return; }
    if (view.presenting && !restored.current) { restored.current = frame; setFrame(initialFrame(true)); setCamera(null); }
    else if (!view.presenting && restored.current) { setFrame(restored.current); restored.current = null; setCamera(null); }
  }, [view?.presenting, view === null]);
  useLayoutEffect(() => {
    boardRuntime.frame = view && frame ? frame : null;
    window.kite.setBoardBounds(view && frame ? frame : null);
    boardRuntime.hit = view && frame ? region => {
      const matrix = svg.current?.getScreenCTM()?.inverse(); if (!matrix) return [];
      const a = new DOMPoint(region.x, region.y).matrixTransform(matrix), b = new DOMPoint(region.x + region.width, region.y + region.height).matrixTransform(matrix);
      return elementsAt(current.current?.elements ?? [], { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }).slice(0, 3).map(e => e.id);
    } : null;
  }, [view === null, frame]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2600); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { setToast(''); }, [view?.id]);
  const rings = useMemo(() => (view?.highlight ?? []).map(id => elements.find(e => e.id === id)).filter(Boolean).map(e => {
    const b = elementBounds(e), pad = 14;
    return { id: e.id, paths: ringPaths({ x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2 }, e.seed) };
  }), [view?.highlight, elements]);
  if (!view || !frame) return null;
  const control = (action: BoardAction) => window.kite.boardControl(action);
  const drag = (kind: 'move' | 'resize') => (e: React.PointerEvent) => {
    if (e.button !== 0 || (kind === 'move' && (e.target as HTMLElement).closest('button'))) return;
    e.preventDefault(); const start = { x: e.clientX, y: e.clientY }, from = frame, target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) => setFrame(kind === 'move' ? { ...from, x: from.x + m.clientX - start.x, y: from.y + m.clientY - start.y }
      : { ...from, width: Math.max(480, from.width + m.clientX - start.x), height: Math.max(340, from.height + m.clientY - start.y) });
    const up = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up); };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
  };
  const pan = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const start = { x: e.clientX, y: e.clientY }, from = cam, target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) => setCamera({ ...from, x: from.x - (m.clientX - start.x) / from.scale, y: from.y - (m.clientY - start.y) / from.scale });
    const up = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up); };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
  };
  const zoom = (e: React.WheelEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('details,form,button')) return;
    const rect = svg.current?.getBoundingClientRect() ?? e.currentTarget.getBoundingClientRect(), px = e.clientX - rect.left, py = e.clientY - rect.top;
    const scale = Math.max(0.15, Math.min(4, cam.scale * Math.exp(-e.deltaY * 0.0015)));
    setCamera({ scale, x: cam.x + px / cam.scale - px / scale, y: cam.y + py / cam.scale - py / scale });
  };
  const share = async (action: 'copy' | 'save') => {
    try {
      const png = await exportPng(svg.current, elements);
      const result = await window.kite.exportBoard(action, png, view.title);
      setToast(result.ok ? (action === 'copy' ? 'Copied the board as an image.' : 'Saved to Documents › Kite Boards.') : result.error ?? 'Could not export the board.');
    } catch { setToast('Could not export the board.'); }
  };
  const prefix = `b${view.id}`, playing = view.status === 'playing', appearance = view.delight ? boardAppearance(view.appearance) : undefined;
  return <section className={`board ${view.status}${view.editable ? ' editable' : ''}${view.delight ? ' delight' : ''}`} aria-label={`Whiteboard: ${view.title}`} onKeyDown={editor.onKey}
    style={{ transform: `translate(${frame.x}px, ${frame.y}px)`, width: frame.width, height: frame.height }}>
    <header onPointerDown={drag('move')}>
      <SailMark size={18} /><strong className="board-title">{view.title}</strong>
      <span className="board-progress">{view.status === 'done' ? `${view.total} of ${view.total}` : `${view.beat + 1} of ${view.total}`}</span>
      <div className="board-tools">
        {view.status !== 'done' && <button onClick={() => control(playing ? 'pause' : 'resume')}>{playing ? 'Pause' : 'Resume'}</button>}
        {view.status !== 'done' && <button onClick={() => control('next')}>Next</button>}
        {view.teaching && <button disabled={view.beat === 0} onClick={() => control('previous')}>Previous</button>}
        {!!view.breadcrumbs?.length && <button onClick={() => control('back')}>Go back</button>}
        {view.teaching && <label className="board-speed"><span className="sr-only">Lesson speed</span><select aria-label="Lesson speed" value={view.speed ?? 1} onChange={e => control({ type: 'speed', speed: Number(e.target.value) })}>{[0.75, 1, 1.25, 1.5].map(n => <option key={n} value={n}>{n}×</option>)}</select></label>}
        <button onClick={() => control('replay')}>Replay</button>
        <button aria-pressed={!!view.presenting} onClick={() => control(view.presenting ? 'smaller' : 'bigger')}>{view.presenting ? 'Smaller' : 'Bigger'}</button>
        {camera && <button onClick={() => setCamera(null)}>Fit</button>}
        <button onClick={() => { void share('copy'); }}>Copy</button>
        <button onClick={() => { void share('save'); }}>Save</button>
        <button className="board-close" aria-label="Close whiteboard" onClick={() => control('close')}>×</button>
      </div>
    </header>
    <div className="board-canvas" onPointerDown={e => { if (!editor.start(e)) pan(e); }} onWheel={zoom}>
      <svg ref={svg} className="board-svg" data-theme={appearance?.theme ?? 'paper'} data-paper={themePaper(appearance?.theme ?? 'paper')} data-revision={view.revision} viewBox={`${cam.x} ${cam.y} ${viewport.width / cam.scale} ${viewport.height / cam.scale}`} width={viewport.width} height={viewport.height}
        xmlns="http://www.w3.org/2000/svg" role={view.editable ? 'group' : 'img'} aria-label={`${view.title}: ${elements.length} drawn elements`}>
        {appearance ? <BoardPaper appearance={appearance} prefix={prefix} /> : <rect className="board-sheet" x={-4000} y={-4000} width={canvas.width + 8000} height={canvas.height + 8000} fill="#ffffff" />}
        {editor.elements.map(e => <g key={e.id} data-focus={view.editable ? e.id : undefined} role={view.editable ? 'button' : undefined} tabIndex={view.editable ? 0 : undefined}
          aria-label={view.editable ? editor.outline.find(n => n.id === e.id)?.label : undefined} onFocus={() => view.editable && editor.setSelected(e.id)} onDoubleClick={() => view.editable && editor.editLabel(e.id)}>
          <BoardElement key={JSON.stringify(e)} e={e} prefix={prefix} appearance={appearance} before={view.transition?.changed.includes(e.id) ? view.transition.before.find(old => old.id === e.id) : undefined}
            dim={view.effects?.some(f => f.kind === 'dim' && !f.ids.includes(e.id))} pulse={!reduced() && view.effects?.some(f => f.kind === 'pulse' && f.ids.includes(e.id))} /></g>)}
        {view.transition?.before.filter(e => view.transition.erased.includes(e.id)).map(e => <g key={`erase-${e.id}`} data-el={e.id} data-kind="erase" data-order={0}><BoardElement e={e} prefix={`${prefix}-erase`} animated={false} appearance={appearance} /></g>)}
        {(view.effects ?? []).flatMap((effect, i) => {
          const ids = effect.kind === 'badge' ? [effect.id] : effect.ids;
          return ids.map(id => { const e = elements.find(n => n.id === id); if (!e || effect.kind === 'dim' || effect.kind === 'pulse') return null; const b = elementBounds(e);
            return <g key={`${i}-${id}`} data-teaching-effect="1" data-el={`effect-${i}-${id}`}>
              {effect.kind === 'badge' ? <><circle data-kind="stroke" data-order={0} cx={b.x - 20} cy={b.y + 10} r={14} stroke={themeInk(appearance?.theme ?? 'paper','black').stroke} fill={themePaper(appearance?.theme ?? 'paper')} /><text data-kind="text" data-order={1} x={b.x - 20} y={b.y + 16} fill={themeInk(appearance?.theme ?? 'paper','black').stroke} textAnchor="middle" fontFamily={boardFontFamily} fontSize={18}>{effect.number}</text></>
                : <path data-kind="stroke" data-order={0} d={`M${b.x} ${effect.kind === 'strike' ? b.y + b.height / 2 : b.y + b.height + 8}h${b.width}`} stroke="#e03131" strokeWidth={2.5} />}
            </g>;
          });
        })}
        {rings.map(r => <g key={`${view.drawing?.key ?? 0}:${r.id}`} className="board-ring">{r.paths.map((d, i) => <path key={i} d={d} pathLength={1} className={`pass-${i}`} />)}</g>)}
        {editor.overlay}
      </svg>
      {editor.ui}
    </div>
    <footer className="board-caption" role="status" aria-live="polite">
      {!!view.breadcrumbs?.length && <span className="board-breadcrumb">{[...view.breadcrumbs, view.title].join(' › ')}</span>}
      {view.teaching && <nav className="board-beats" aria-label="Lesson beats">{Array.from({ length: view.total }, (_, i) => <button key={i} aria-label={`Go to beat ${i + 1}`} aria-current={view.beat === i ? 'step' : undefined} onClick={() => control({ type: 'jump', beat: i })}>{i + 1}</button>)}</nav>}
      {toast || view.note || (view.captions === false ? <span className="sr-only">{view.caption}</span> : view.caption)}
    </footer>
    <span className="board-resize" aria-hidden="true" onPointerDown={drag('resize')} />
  </section>;
}
