import { z } from 'zod';
import { defineTool } from '../define';
import { preview, type StreamEnd, type ToolResult } from '../types';
import { boardColorNames, elementTypes, fills, textSizes, type ElementInput, type LooseLesson } from '../../../shared/board';
// Lenient on purpose (repair instead of reject): the schema gives every provider the shape and the enums, and accepts
// anything of the right kind. Wrong optional values are dropped here; positions, sizes, lengths, limits, ids and
// references are repaired by sanitizeLesson when the board starts, and the tool result lists what was changed.
// A static `.optional().catch(undefined)` keeps the field optional in the JSON schema and adds no `default`.
const loose = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);
const point = z.object({ x: z.number(), y: z.number() });
/** One flat element object (no unions or tuples): every provider's tool schema subset accepts it. */
export const boardElement = z.object({
  id: z.string(), type: z.enum(elementTypes),
  x: loose(z.number()), y: loose(z.number()), width: loose(z.number()), height: loose(z.number()),
  label: loose(z.string()), text: loose(z.string()),
  size: loose(z.enum(textSizes)), align: loose(z.enum(['left', 'center'])),
  color: loose(z.enum(boardColorNames as [string, ...string[]])), fill: loose(z.enum(fills)),
  from: loose(z.string()), to: loose(z.string()), points: loose(z.array(point)),
  dashed: loose(z.boolean()), heads: loose(z.enum(['end', 'both', 'none'])),
});
export const lessonInput = z.object({
  title: z.string(),
  mode: loose(z.enum(['new', 'add'])),
  beats: z.array(z.object({
    say: z.string(),
    // One element of an unknown type (or not an object) is left out rather than losing the beat's whole drawing.
    draw: loose(z.preprocess(v => Array.isArray(v) ? v.filter(e => boardElement.safeParse(e).success) : v, z.array(boardElement))),
    highlight: loose(z.array(z.string())),
    erase: loose(z.array(z.string())),
  })).min(1),
});
/** The lesson as written; BoardService.start repairs it against the board (sanitizeLesson). */
export function toLesson(input: z.infer<typeof lessonInput>): LooseLesson {
  return { title: input.title, mode: input.mode ?? 'new', beats: input.beats.map(b => ({ say: b.say, draw: b.draw as Partial<ElementInput>[] | undefined, highlight: b.highlight, erase: b.erase })) };
}
export const whiteboardDescription = `Explain something visually. Kite opens a whiteboard, draws hand-drawn (Excalidraw-style) shapes, arrows and text beat by beat, and says each beat aloud while the kite draws it. Use it for concepts, processes, systems, architectures, algorithms, comparisons, timelines, maths, and anything a sketch explains better than words.
Canvas: 1600 wide by 900 tall, origin top-left, y grows downward. Keep everything inside with 40 px margins; the board zooms to fit.
Elements (each needs a unique id of letters, digits, _ or -, which you can refer to later):
- rectangle, ellipse, diamond: x and y (top-left corner), label (≤ 6 words). width/height are optional: omitted, the shape is sized to its label (about 160 × 80 for a short label). fill "hachure" or "solid" shades it.
- text: x, y (top-left), text, size "title" for the heading, "medium" (default) or "small" for notes.
- arrow: from and to ids (drawn edge to edge between those elements), or points [{x,y}, …]; optional label (1–3 words), dashed, heads ("end", "both", "none").
- line: points [{x,y}, …], optional dashed.
Colors: black (default), blue, red, green, orange, purple, teal, gray. Use color to group related parts, not for decoration.
Messages exchanged over time (a request and its reply, handshakes, protocols, API calls): draw a timeline. Put the parties side by side at the top, give each a dashed vertical line down, and draw each message as its own arrow with points at its own height, lower for later messages, labelled with its name. Do not stack several from/to arrows between the same two boxes.
Beats: usually 3–7. Beat 1 draws a title. Each beat's "say" is one or two short spoken sentences about exactly what that beat draws; "draw" adds 1–5 elements. Lay things out left to right or top to bottom with at least 60 px between shapes, and plan the whole layout before the first beat so nothing overlaps. "highlight" circles existing ids while that beat is spoken; "erase" removes ids.
mode "add" keeps the current board and continues it (for follow-up questions about it): reuse an id to change that element, use new ids in free space, and highlight the parts you talk about.
Kite speaks every "say" itself, and the lesson is its whole answer: call this straight away, without announcing it, and write nothing else in this turn.`;
/**
 * The beats of a partly written lesson that are complete: every one before the last (which may still be growing),
 * checked like a final lesson. `mode` stays unknown until the model has written it.
 */
export function completeBeats(partial: unknown): LooseLesson | undefined {
  const p = partial as { title?: unknown; mode?: unknown; beats?: unknown };
  if (!Array.isArray(p?.beats) || p.beats.length < 2) return undefined;
  const parsed = lessonInput.safeParse({ title: typeof p.title === 'string' ? p.title : '', beats: p.beats.slice(0, -1) });
  if (!parsed.success) return undefined;
  return { ...toLesson(parsed.data), mode: p.mode === 'add' || p.mode === 'new' ? p.mode : undefined };
}
/** `stream`: lets the board start drawing complete beats while the model is still writing the rest. */
export function explainOnWhiteboard(start: (lesson: LooseLesson, callId?: string) => ToolResult,
  stream?: { update(callId: string, lesson: LooseLesson): void; end(callId: string, end: StreamEnd): ToolResult | undefined }) {
  const sent = new Map<string, string>();
  return defineTool<z.infer<typeof lessonInput>>({
    name: 'explain_on_whiteboard', kind: 'info', inputSchema: lessonInput, description: whiteboardDescription, endsTurn: true,
    summarize: ({ title, beats, mode }) => `${mode === 'add' ? 'Add to' : 'Draw'} "${preview(title, 60)}" on the whiteboard: ${beats.length} beat${beats.length === 1 ? '' : 's'}, ${beats.reduce((n, b) => n + (b.draw?.length ?? 0), 0)} elements.`,
    execute: async (input, ctx) => { ctx.signal.throwIfAborted(); if (ctx.callId) sent.delete(ctx.callId); return start(toLesson(input), ctx.callId); },
    ...(stream ? {
      stream: (callId: string, partial: unknown) => {
        // Hand over only what changed: another complete beat, the title, or the mode.
        const lesson = completeBeats(partial), seen = lesson && `${lesson.beats.length}|${lesson.mode}|${lesson.title}`;
        if (!lesson || sent.get(callId) === seen) return;
        sent.set(callId, seen); stream.update(callId, lesson);
      },
      streamEnd: (callId: string, end: StreamEnd) => { sent.delete(callId); return stream.end(callId, end); },
    } : {}),
  });
}
