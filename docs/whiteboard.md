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

The lesson starts before the model has finished writing it. Its input streams in, and each beat is handed to the board once it is complete. Beat 1 is drawn and narrated while the model writes the rest; reaching the newest beat waits for the next. The final call adds whatever has not arrived. A lesson cut off mid-stream plays the beats that did arrive. The lesson is the whole answer: the voice turn ends on it, with no filler line. Whatever the model said before the call ends as soon as the lesson starts streaming, and narration follows it.

Lessons are repaired rather than rejected (`sanitizeLesson` in `src/shared/board.ts`):
- Elements that can't be drawn are dropped.
- Duplicate ids are renamed.
- References to ids that aren't on the board are dropped.
- Numbers are clamped.
- A shape written with `text` gets it as its label.

The model is told what was fixed.

## Privacy

The lesson text goes only to your configured model, as part of the conversation. The board is excluded from Kite's own screen captures. Nothing is saved unless you press Save.

## Measuring

`src/shared/boardMetrics.ts` scores a board as numbers: colliding elements, labels that don't fit their shape (or had a word split), arrows and lines through shapes they don't connect, crossing arrows, free text lying on a line, and the smallest text on screen in the default panel on a 1080p display. The harness and the dev panel both use it.

- **Harness:** `npm run eval:board` runs the 60 golden prompts in `scripts/board-eval/prompts.json`, with their follow-ups, through a real voice turn on each model with a key. It records parse success, repairs, time to the first token, to the first complete beat (when streaming could start drawing), and to the valid lesson call (when today's Kite starts drawing), plus output tokens and the metrics. Results go to `docs/performance/whiteboard/latest.json`, merged by model. Then `npm run eval:board:gallery` renders every finished board through the overlay renderer and writes `docs/performance/whiteboard/index.html`. See [the baseline](performance/whiteboard/README.md).
- **Dev panel:** one line for the latest lesson, with the time from the model request to the first stroke, output tokens, repairs, and lint counts. It holds numbers only, never lesson text; the same numbers are logged as `board:lesson`.

## Verification

- `npm test` (`tests/tools.test.cjs`): a tool that ends the turn, and a lesson streamed through the real agent loop (beats reach the board before the call completes, cut-off and rejected inputs).
- `npm test` (`tests/board-metrics.test.cjs`): each metric on small boards, nesting and containers, the 1080p text size, and per-beat counts for follow-ups.
- `npm test` (`tests/board.test.cjs`): layout, text wrapping, arrow binding and label placement at every angle, parallel arrows, beats that add, replace, and erase, deterministic rough strokes and hatching, commands, the lesson state machine (speech and drawing sync, no voice, cut and failed speech, next/repeat/replay, follow-up insertion), the service's model context and marks, lenient tool input and `sanitizeLesson` repairs, streaming (appended beats, waiting at the newest beat, sealing, a streamed follow-up, the final call adding only the rest, cut-off and rejected streams), the lesson log, and announcement hooks, including lesson lines that play beside a model turn still writing.
- `npm run test:renderer` (after a build): drawing stroke by stroke, the kite flying to the pen, highlight rings, nothing left half drawn, PNG export, and the board controls.
