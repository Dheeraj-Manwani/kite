# Explain it on a whiteboard

Ask "explain how a TCP handshake works" or "sketch how React renders" and Kite opens a whiteboard. It draws the idea one piece at a time in a hand-drawn style while it narrates, and the kite holds the marker. Turn it off in **Settings → Actions**.

## Using it

- **Start:** ask Kite to explain, compare, or walk through something with a tool-capable model. No approval is needed: the board is Kite's own drawing and nothing on your PC changes.
- **Follow:** each beat is spoken (or captioned when voice is off) while its shapes, arrows, and words are drawn. Parts Kite talks about again get circled.
- **Voice commands** (hold the shortcut and say):
  - "wait", "pause" → pause. The current beat stays on the board.
  - "continue", "go ahead" → carry on (the paused beat is said again).
  - "next", "skip" → the next beat.
  - "repeat", "say that again" → the current beat again.
  - "replay", "start over" → the whole lesson from the beginning.
  - "close the board", "stop" → put the board away.
- **Ask about it:** anything else you say goes to the model, which sees every element on the board by id. It answers by adding to the same board (new beats play, then Kite waits before the rest of the original lesson) or by starting a new one.
- **Point at it:** hold the shortcut and circle or tap part of the board while asking "what's this?". Kite tells the model which elements you marked. No screenshot is taken for marks on the board.
- **Board buttons:** Pause/Resume, Next, Replay, Copy (PNG to the clipboard), Save (PNG to Documents › Kite Boards), and Close. Drag the title bar to move it, the corner to resize it, the wheel to zoom, and the paper to pan; Fit resets the view.
- **Dev panel:** **Demo whiteboard** plays a built-in lesson ("How a kite flies") without a model.

## How it works

The model plans the whole lesson in one `explain_on_whiteboard` call: a title and up to 16 beats, each with a spoken line and the elements it adds on a 1600 × 900 canvas (rectangles, ellipses, diamonds, text, arrows between elements, and lines, in eight colors with optional hatching). Kite's code sizes shapes to their labels, binds arrows edge to edge, keeps a request and its reply apart, and puts arrow labels beside the line. Drawing starts when a beat's audio starts; the next beat waits for both. [ADR 013](adr/013-whiteboard.md).

## Privacy

The lesson text goes only to your configured model, as part of the conversation. The board is excluded from Kite's own screen captures. Nothing is saved unless you press Save.

## Verification

- `npm test` (`tests/board.test.cjs`): layout, text wrapping, arrow binding and label placement at every angle, parallel arrows, beats that add, replace, and erase, deterministic rough strokes and hatching, commands, the lesson state machine (speech and drawing sync, no voice, cut and failed speech, next/repeat/replay, follow-up insertion), the service's model context and marks, tool validation, and announcement hooks.
- `npm run test:renderer` (after a build): drawing stroke by stroke, the kite flying to the pen, highlight rings, nothing left half drawn, PNG export, and the board controls.
