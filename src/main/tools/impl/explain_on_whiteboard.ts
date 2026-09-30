import { z } from 'zod';
import { defineTool } from '../define';
import { preview, type ToolResult } from '../types';
import { boardColorNames, boardLimits, elementTypes, fills, shapeKinds, textSizes, type ElementInput, type LessonInput } from '../../../shared/board';
const id = z.string().trim().regex(/^[A-Za-z0-9_-]{1,40}$/, 'ids are 1–40 letters, digits, _ or -');
const coord = z.number().finite().min(-2000).max(6000);
const size = z.number().finite().min(16).max(3000);
const point = z.object({ x: coord, y: coord }).strict();
/**
 * One flat element object (no unions or tuples): every provider's tool schema subset accepts it.
 * Per-type requirements are checked below.
 */
export const boardElement = z.object({
  id, type: z.enum(elementTypes),
  x: coord.optional(), y: coord.optional(), width: size.optional(), height: size.optional(),
  label: z.string().trim().min(1).max(120).optional(), text: z.string().trim().min(1).max(300).optional(),
  size: z.enum(textSizes).optional(), align: z.enum(['left', 'center']).optional(),
  color: z.enum(boardColorNames as [string, ...string[]]).optional(), fill: z.enum(fills).optional(),
  from: id.optional(), to: id.optional(), points: z.array(point).max(24).optional(),
  dashed: z.boolean().optional(), heads: z.enum(['end', 'both', 'none']).optional(),
}).strict().superRefine((e, ctx) => {
  const need = (ok: boolean, message: string) => { if (!ok) ctx.addIssue({ code: 'custom', message }); };
  if ((shapeKinds as readonly string[]).includes(e.type)) need(e.x !== undefined && e.y !== undefined, `${e.type} "${e.id}" needs x and y`);
  if (e.type === 'text') need(e.x !== undefined && e.y !== undefined && !!(e.text ?? e.label), `text "${e.id}" needs x, y and text`);
  if (e.type === 'line') need((e.points?.length ?? 0) >= 2, `line "${e.id}" needs at least two points`);
  if (e.type === 'arrow') need((e.from ? 1 : 0) + (e.to ? 1 : 0) + (e.points?.length ?? 0) >= 2, `arrow "${e.id}" needs from and to ids, or points`);
});
export const lessonInput = z.object({
  title: z.string().trim().min(1).max(80),
  mode: z.enum(['new', 'add']).optional(),
  beats: z.array(z.object({
    say: z.string().trim().min(1).max(400),
    draw: z.array(boardElement).max(boardLimits.perBeat).optional(),
    highlight: z.array(id).max(10).optional(),
    erase: z.array(id).max(boardLimits.perBeat).optional(),
  }).strict()).min(1).max(boardLimits.beats),
}).strict().superRefine((lesson, ctx) => {
  const seen = new Map<string, number>();
  lesson.beats.forEach((beat, b) => beat.draw?.forEach(e => {
    // An id may be redrawn in a later beat (an update), never twice in one beat.
    if (seen.get(e.id) === b) ctx.addIssue({ code: 'custom', message: `id "${e.id}" is drawn twice in beat ${b + 1}` });
    seen.set(e.id, b);
  }));
});
export function toLesson(input: z.infer<typeof lessonInput>): LessonInput {
  return { title: input.title, mode: input.mode ?? 'new', beats: input.beats.map(b => ({ say: b.say, draw: b.draw?.map(e => e as ElementInput), highlight: b.highlight, erase: b.erase })) };
}
export const whiteboardDescription = `Explain something visually. Kite opens a whiteboard, draws hand-drawn (Excalidraw-style) shapes, arrows and text beat by beat, and says each beat aloud while the kite draws it. Use it for concepts, processes, systems, architectures, algorithms, comparisons, timelines, maths, and anything a sketch explains better than words.
Canvas: 1600 wide by 900 tall, origin top-left, y grows downward. Keep everything inside with 40 px margins; the board zooms to fit.
Elements (each needs a unique id you can refer to later):
- rectangle, ellipse, diamond: x and y (top-left corner), label (≤ 6 words). width/height are optional: omitted, the shape is sized to its label (about 160 × 80 for a short label). fill "hachure" or "solid" shades it.
- text: x, y (top-left), text, size "title" for the heading, "medium" (default) or "small" for notes.
- arrow: from and to ids (drawn edge to edge between those elements), or points [{x,y}, …]; optional label (1–3 words), dashed, heads ("end", "both", "none").
- line: points [{x,y}, …], optional dashed.
Colors: black (default), blue, red, green, orange, purple, teal, gray. Use color to group related parts, not for decoration.
Messages exchanged over time (a request and its reply, handshakes, protocols, API calls): draw a timeline. Put the parties side by side at the top, give each a dashed vertical line down, and draw each message as its own arrow with points at its own height, lower for later messages, labelled with its name. Do not stack several from/to arrows between the same two boxes.
Beats: usually 3–7. Beat 1 draws a title. Each beat's "say" is one or two short spoken sentences about exactly what that beat draws; "draw" adds 1–5 elements. Lay things out left to right or top to bottom with at least 60 px between shapes, and plan the whole layout before the first beat so nothing overlaps. "highlight" circles existing ids while that beat is spoken; "erase" removes ids.
mode "add" keeps the current board and continues it (for follow-up questions about it): reuse an id to change that element, use new ids in free space, and highlight the parts you talk about.
Kite speaks every "say" itself. After calling this, reply with one short sentence such as "Let me sketch it out." Never repeat the narration.`;
export function explainOnWhiteboard(start: (lesson: LessonInput) => ToolResult) {
  return defineTool<z.infer<typeof lessonInput>>({
    name: 'explain_on_whiteboard', kind: 'info', inputSchema: lessonInput, description: whiteboardDescription,
    summarize: ({ title, beats, mode }) => `${mode === 'add' ? 'Add to' : 'Draw'} "${preview(title, 60)}" on the whiteboard: ${beats.length} beat${beats.length === 1 ? '' : 's'}, ${beats.reduce((n, b) => n + (b.draw?.length ?? 0), 0)} elements.`,
    execute: async (input, ctx) => { ctx.signal.throwIfAborted(); return start(toLesson(input)); },
  });
}
