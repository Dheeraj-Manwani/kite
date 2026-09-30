# Whiteboard lessons are scripts of beats, drawn by the kite

Status: Accepted for v1.3.

## Context

Spoken answers are poor at structure: architectures, handshakes, algorithms, and comparisons are easier to understand as a sketch that grows while someone talks. heyclicky draws Excalidraw-style shapes on screen. Kite already has a physics kite, hand-drawn guide rings, quiet guide announcements, and a click-through overlay.

## Options

- Render Mermaid or a generated image after the answer (no narration, nothing to follow).
- Stream free-form drawing commands while the model talks (no layout plan; speech and drawing race).
- Excalidraw or rough.js as a dependency, in a separate window.
- One tool call carrying the whole lesson as beats, drawn in the overlay by Kite's own renderer.

## Decision

`explain_on_whiteboard` takes a title and up to 16 beats. Each beat is a short spoken line, the elements it draws (rectangles, ellipses, diamonds, text, arrows bound to elements by id, lines), elements to circle, and elements to erase, on a 1600 × 900 canvas.

- **Layout is code.** Shared pure functions size shapes to their labels, bind arrows edge to edge, separate a request from its reply, place arrow labels beside the shaft, and describe the board back to the model with ids, so follow-ups can `add` to it.
- **Speech leads, drawing follows.** Each beat is a quiet announcement; its elements start drawing when its audio starts, and the next beat waits for both. Without voice, the caption is read and timed instead. A cut line (the user started talking) pauses the lesson; a failed voice falls back to the caption.
- **The kite holds the pen.** The overlay traces each stroke with its real path length, writes text left to right, and reports the nib position to the one frame loop, which springs the kite to it nose-first.
- **Own renderer.** A seeded rough.js-style generator (bowed double strokes, hachure) in `src/renderer/board/rough.ts` keeps every element's wobble stable and exports match the screen. No dependency.
- **In the overlay.** The board is a draggable, resizable, zoomable panel in the overlay with Pause, Next, Replay, Copy, Save, and Close. Marks drawn on it while holding the shortcut name board elements instead of taking a screenshot.
- **No approval.** The tool only draws on Kite's own board; nothing leaves the PC except the question to the model.

## Consequences

- One model call plans the whole lesson, so it is coherent and fast to start. Lessons use up to 4096 output tokens; spoken replies stay short by instruction.
- Coordinates come from the model. Bad plans can overlap; the layout keeps them legible but does not reflow a diagram.
- The board covers part of the screen while open. It is excluded from Kite's own captures by content protection and does not flash during them.
- Exports are PNGs rendered from the same SVG, so they match the screen exactly.
