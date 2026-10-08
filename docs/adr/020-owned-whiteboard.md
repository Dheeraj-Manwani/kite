# ADR 020 — Editable, accessible and portable whiteboards

Date: 8 October 2026. Status: implemented behind `KITE_BOARD_PHASE4=1`; hosted export gates pending.

## Decision

Users can select and ask about an element, drag it, edit its label, delete it and add pen strokes, arrows or text. A local overlay of element overrides and deletions sits above the compiled lesson. It preserves element identities and pinned positions through future teaching updates, follow-ups and replay. Deleting an endpoint removes its arrows; rerouting preserves the free endpoint of partially bound arrows. Thirty undo/redo states are retained during a session. Edits persist with the original archive identity, and edited paused boards refresh their thumbnails. Reopening restores edits but starts a fresh undo stack.

Main validates operations, ids, coordinates, label length and stroke size. The renderer receives the visible inputs and a scene revision. User additions are blue and marked `user`; overrides never reveal a model element before its beat. Editing invalidates a pending specialist plan and seals its current stream, so an old generation cannot overwrite a user edit.

## Asking and visual context

Element clicks show a typed question chip. Enter asks about the focused element; “Is this right?” asks about the sketch. Typed questions enter the ordinary conversation path without recording audio or preparing a screen capture. Shortcut marks continue identifying elements by id.

The ordinary model and a vision-capable follow-up specialist receive the edited board structure and an optional PNG rendered from the board SVG. Each renderer image reply is tied to a UUID request, board id and scene revision; changed or closed boards discard it. Requests time out after five seconds and cancel on abort/shutdown. Images are attached to a copied request message, not persisted in conversation history. A text-only model uses structure without an image; no automatic model reroute is required for an owned drawing. Existing screen-capture flows retain their own routing and consent behavior.

## Export formats

SVG clones the current drawing, removes animation/clipping/selection state, crops to the scene and embeds the bundled font subsets with their Unicode ranges. PNG and PDF use this same rendering. The native PDF handout prints the board followed by narration/question notes, with escaped text, a restrictive CSP and JavaScript/network disabled. Locally generated filenames use exclusive writes in Documents › Kite Boards.

The `.excalidraw` and clipboard mapping follows the public [scene format](https://docs.excalidraw.com/docs/codebase/json-schema/) and [element skeleton API](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/excalidraw-element-skeleton). Shapes and labels get reciprocal container references; arrows retain endpoint references and targets retain their bound arrows. Pen strokes become freedraw elements. Math paths become embedded SVG image files with the original TeX in metadata. Icons and exact rough-stroke variations are not editable objects in this mapping; use SVG/PDF for the drawn appearance.

“Open in Excalidraw” opens a dedicated sandboxed window at the fixed editor origin, with no Node or preload bridge. It denies permission requests and additional windows. Once the canvas is ready, only local Escape/Ctrl+V keyboard events transfer clipboard JSON into that window. The shared clipboard transaction materializes and restores all prior clipboard payloads after the paste delay, including failures. A failed load/readiness/paste closes the window and returns an export error. Explicit “Copy editable elements” intentionally leaves the JSON on the clipboard.

Mermaid exports the structured flow/sequence diagram in a GitHub markdown fence. Generated aliases and entity-escaped labels prevent labels becoming directives. Sequence edges retain their original order; deleted/unrevealed elements are excluded and edited labels are used. Other families report that Mermaid is unavailable. Freehand ink is represented by the visual/editable exports, not the semantic Mermaid diagram. Syntax follows the official [flowchart](https://mermaid.js.org/syntax/flowchart.html) and [sequence](https://mermaid.js.org/syntax/sequenceDiagram) documentation.

## Accessibility and rollout

Every visible element has a keyboard focus target and a complete label/connection description. An untruncated outline repeats these descriptions as ask buttons. Tab, Enter, Space, F2, Delete, Ctrl+Z and Ctrl+Shift+Z provide keyboard actions; form inputs keep normal text editing. The screen-reader caption preference remains authoritative. Editing controls reserve space around the drawing.

Phase 4 implies phases 2 and 3; an explicit `KITE_BOARD_PHASE2=0` disables the structured extensions. The released default remains unchanged while the earlier latency/clarity gates and hosted export checks remain pending.

## Verification

Sixteen new unit tests bring the passing serial suite to 297. `npm run eval:board:phase4` builds a development fixture using Excalidraw 0.18.1 and Mermaid 12.1.0, imports 314 stored boards and checks all element ids, formula files and reciprocal bindings for 1,340 arrows/2,160 bound endpoints. It locally renders 82 applicable Mermaid scenes and runs native keyboard, drag/edit/sketch, own-image and export checks through the actual BoardLayer/preload/service path. An export pixel check protects label visibility; the two-page PDF was rendered and inspected with Poppler. Earlier native, renderer and clipboard smoke checks pass. See [phase4-verification.json](../performance/whiteboard/phase4-verification.json) and [the roadmap](../whiteboard-roadmap.md).

These checks do not substitute for importing every golden board on excalidraw.com or verifying Mermaid in GitHub's hosted renderer. Those two release gates remain open. The editor SDK and Mermaid packages are dev dependencies used only by the validation fixture; they are absent from the production renderer bundle.
