import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SailMark } from '../kite/SailMark';
import { boardColors, canvas, elementBounds, elementsAt, fitView, lineHeight, panelChrome, panelSize, panelViewport, sceneBounds, type BoardAction, type BoardView, type LaidElement, type TextBlock } from '../../shared/board';
import type { ScreenBounds } from '../../shared/types';
import { cursorInput } from '../kite/useKiteLoop';
import { runtime } from '../kite/runtime';
import { ringPaths } from '../guide/ring';
import { react } from '../voice/runtime';
import { elementStrokes } from './rough';
import { BoardPlayer } from './player';
import { boardRuntime } from './runtime';
import { exportPng } from './export';
export const boardFont = `'Ink Free', 'Segoe Print', 'Comic Sans MS', cursive`;
type Camera = { scale: number; x: number; y: number };
/** Written line by line; the player clips each line while it is being "handwritten". */
function Lines({ block, color, clip, order }: { block: TextBlock; color: string; clip: string; order: number }) {
  return <>{block.lines.map((line, i) => {
    const x = block.align === 'center' ? block.x + block.width / 2 : block.x, id = `${clip}-${i}`;
    return <g key={i}>
      <clipPath id={id}><rect x={0} y={0} width={0} height={0} /></clipPath>
      <text data-kind="text" data-order={order + i} data-clip={id} x={x} y={block.y + i * block.size * lineHeight + block.size}
        fontSize={block.size} fontFamily={boardFont} fill={color} textAnchor={block.align === 'center' ? 'middle' : 'start'}>{line}</text>
    </g>;
  })}</>;
}
/** One element in drawing order: fill (under), outline passes, arrowheads, then its words. */
const Element = memo(function Element({ e, prefix }: { e: LaidElement; prefix: string }) {
  const strokes = useMemo(() => elementStrokes(e), [e]);
  const color = boardColors[e.color] ?? boardColors.black, clip = `${prefix}-${e.id}`;
  const label = e.kind === 'text' ? e.text : e.kind === 'shape' || e.kind === 'arrow' ? e.label : null;
  let outline = 0;
  return <g data-el={e.id}>
    {strokes.filter(s => s.role === 'fill').map((s, i) => <path key={`fill${i}`} d={s.d} data-kind="fade" data-fill="1" data-order={20}
      fill={s.solidFill ? color.fill : 'none'} stroke={s.solidFill ? 'none' : color.stroke} strokeOpacity={0.5} strokeWidth={1.3} strokeLinecap="round" />)}
    {strokes.filter(s => s.role !== 'fill').map((s, i) => {
      const second = s.role === 'outline' && outline++ > 0;
      return <path key={i} d={s.d} data-kind={s.dashed ? 'fade' : 'stroke'} data-order={s.role === 'head' ? 30 + i : 10 + i} data-fast={second ? '1' : undefined}
        fill="none" stroke={color.stroke} strokeWidth={second ? 1.5 : 2.1} strokeDasharray={s.dashed ? '10 9' : undefined} strokeLinecap="round" strokeLinejoin="round" />;
    })}
    {e.kind === 'arrow' && e.label && <rect x={e.label.x - 5} y={e.label.y - 2} width={e.label.width + 10} height={e.label.height + 4} rx={6} fill="#ffffff" opacity={0.9} />}
    {label && <Lines block={label} color={color.stroke} clip={clip} order={40} />}
  </g>;
});
function initialFrame(): ScreenBounds {
  const g = cursorInput.geometry, origin = g?.origin ?? { x: 0, y: 0 };
  const d = g ? { x: g.display.x - origin.x, y: g.display.y - origin.y, width: g.display.width, height: g.display.height } : { x: 0, y: 0, width: innerWidth, height: innerHeight };
  const { width, height } = panelSize(d);
  return { x: Math.round(d.x + (d.width - width) / 2), y: Math.round(d.y + Math.max(24, (d.height - height) / 2 - 16)), width, height };
}
const onScreen = (f: ScreenBounds) => f.x + f.width > 40 && f.y + 20 > 0 && f.x < innerWidth - 40 && f.y < innerHeight - 40;
/**
 * The whiteboard: hand-drawn elements on paper, drawn beat by beat while Kite narrates. The kite holds
 * the pen (see boardRuntime). The panel can be dragged, resized, zoomed with the wheel, and panned.
 */
export function BoardLayer() {
  const [view, setView] = useState<BoardView | null>(null);
  const [frame, setFrame] = useState<ScreenBounds | null>(null);
  const [camera, setCamera] = useState<Camera | null>(null);
  const [toast, setToast] = useState('');
  const svg = useRef<SVGSVGElement>(null), player = useRef(new BoardPlayer()), current = useRef<BoardView | null>(null);
  const reduced = () => runtime.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    const off = window.kite.onBoardEvent(next => {
      const before = current.current; current.current = next;
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
      boardRuntime.rest = v?.status === 'playing' ? player.current.last ?? boardRuntime.rest ?? restPoint() : null;
    };
    return () => { off(); player.current.cancel(); boardRuntime.tick = null; boardRuntime.pen = null; boardRuntime.rest = null; boardRuntime.hit = null; boardRuntime.frame = null; window.kite.setBoardBounds(null); };
  }, []);
  const restPoint = () => { const f = boardRuntime.frame; return f ? { x: f.x + 60, y: f.y + panelChrome.header + 40 } : null; };
  const viewport = frame ? panelViewport(frame) : { width: 1, height: 1 };
  const elements = view?.elements ?? [];
  const auto = useMemo(() => fitView(sceneBounds(elements), viewport, 40), [elements, viewport.width, viewport.height]);
  const cam = camera ?? auto;
  // Draw the beat's elements once per drawing key; a view without drawing shows everything at once.
  useLayoutEffect(() => {
    const drawing = view?.drawing, node = svg.current;
    if (!view || !drawing || !node) { player.current.cancel(); return; }
    if (player.current.key === drawing.key) return;
    const groups = drawing.ids.map(id => node.querySelector(`[data-el="${CSS.escape(id)}"]`)).filter(Boolean);
    const id = view.id, key = drawing.key;
    player.current.last = null;
    player.current.play(key, node, groups, drawing.durationMs, () => window.kite.boardDrawn(id, key), reduced());
  }, [view?.drawing?.key, view?.id]);
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
    const rect = e.currentTarget.getBoundingClientRect(), px = e.clientX - rect.left, py = e.clientY - rect.top;
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
  const prefix = `b${view.id}`, playing = view.status === 'playing';
  return <section className={`board ${view.status}`} aria-label={`Whiteboard: ${view.title}`}
    style={{ transform: `translate(${frame.x}px, ${frame.y}px)`, width: frame.width, height: frame.height }}>
    <header onPointerDown={drag('move')}>
      <SailMark size={18} /><strong className="board-title">{view.title}</strong>
      <span className="board-progress">{view.status === 'done' ? `${view.total} of ${view.total}` : `${view.beat + 1} of ${view.total}`}</span>
      <div className="board-tools">
        {view.status !== 'done' && <button onClick={() => control(playing ? 'pause' : 'resume')}>{playing ? 'Pause' : 'Resume'}</button>}
        {view.status !== 'done' && <button onClick={() => control('next')}>Next</button>}
        <button onClick={() => control('replay')}>Replay</button>
        {camera && <button onClick={() => setCamera(null)}>Fit</button>}
        <button onClick={() => { void share('copy'); }}>Copy</button>
        <button onClick={() => { void share('save'); }}>Save</button>
        <button className="board-close" aria-label="Close whiteboard" onClick={() => control('close')}>×</button>
      </div>
    </header>
    <div className="board-canvas" onPointerDown={pan} onWheel={zoom}>
      <svg ref={svg} className="board-svg" viewBox={`${cam.x} ${cam.y} ${viewport.width / cam.scale} ${viewport.height / cam.scale}`} width={viewport.width} height={viewport.height}
        xmlns="http://www.w3.org/2000/svg" role="img" aria-label={`${view.title}: ${elements.length} drawn elements`}>
        <rect className="board-sheet" x={-4000} y={-4000} width={canvas.width + 8000} height={canvas.height + 8000} fill="#ffffff" />
        {elements.map(e => <Element key={`${e.id}:${JSON.stringify(e)}`} e={e} prefix={prefix} />)}
        {rings.map(r => <g key={`${view.drawing?.key ?? 0}:${r.id}`} className="board-ring">{r.paths.map((d, i) => <path key={i} d={d} pathLength={1} className={`pass-${i}`} />)}</g>)}
      </svg>
    </div>
    <footer className="board-caption" role="status" aria-live="polite">{toast || view.note || view.caption}</footer>
    <span className="board-resize" aria-hidden="true" onPointerDown={drag('resize')} />
  </section>;
}
