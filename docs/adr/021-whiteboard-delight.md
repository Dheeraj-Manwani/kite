# ADR 021 — Whiteboard themes, traced labels and narrated replay

Date: 8 October 2026. Status: implemented behind **KITE_BOARD_PHASE5=1**; background reviewer deferred by its evidence gate.

## Decision

Phase 5 implies phases 2–4, while **KITE_BOARD_PHASE2=0** disables every extension. Whiteboard's existing Settings toggle remains the master switch. A local lesson appearance stores paper/chalkboard/blueprint and whether short labels use handwriting. Style changes pause playback, change the scene revision and save with the original archive. Reopening restores appearance; old archives default to paper.

Theme ink and paper are SVG presentation attributes. Blueprint adds a local grid pattern; themes bypass the legacy dark-mode inversion. SVG, PNG, PDF and video therefore retain the chosen colors. Editable Excalidraw and Mermaid exports retain their existing semantic representation.

**src/shared/boardDelight.ts** contains an authored monoline Latin/digit/punctuation font. Each glyph is a centerline path, and each move command lifts the pen. Labels of at most 32 characters use these paths in the existing stroke player. Horizontal scaling keeps them within the measured label box. Longer text or any unsupported character uses ordinary shaped text with a clip reveal. There is no external font download or change to the planner's geometry. The accessible outline retains complete text.

Exact Hindi, romanized Hindi, Spanish, French and German board commands join the English commands only on the Phase 5 path. Questions and longer phrases continue going to the conversation model. This changes local command recognition; narration and transcription still use their existing services.

## Video boundary and lifecycle

The user explicitly selects **Export → WebM with narration**. Main freezes the completed lesson, edits, appearance, voice and speed under a UUID, current board id and revision. A still-streaming plan cannot export. Sequential, one-at-a-time narration requests take their text from this snapshot, using a dedicated Cartesia connection that never emits to live voice playback. Each connection collects PCM and incremental timestamps, and closes on success, failure or cancellation. A Cartesia key and selected voice are required even when live voice is muted.

The lazily loaded renderer builds an isolated SVG scene from each beat and reuses the pen player. It records a 1280 × 720 canvas with generated audio routed only to a Web Audio stream destination. It takes no microphone, camera or desktop stream. Narration is prepared before recording so network waits do not appear between beats. Captions paginate inside the video; quizzes play their prompts without waiting for an answer. Compiled value/move/swap/erase changes and emphasis render in the replay; pulse is a steady emphasis frame in video. A final hold leaves the completed drawing visible.

Main checks trusted overlay IPC, the UUID, sequential beat index, current board/revision and completion. The renderer bounds narration to 64 MB total, each beat to 60 seconds, recording to 15 minutes and output to 100 MB. Main checks the WebM EBML header and bounds before saving exclusively in Documents › Kite Boards. Cancel, board closure/replacement, scene/style changes, provider failure, expiry and shutdown invalidate the job and stop its dedicated voice connection. The renderer releases tracks, audio nodes, context, detached React root and temporary DOM on every exit.

## Evidence

**npm run eval:board:phase5** verifies actual theme pixels, SVG validation, handwriting controls, cancellation cleanup, the export menu, audio decoding and distinct video frames using synthetic PCM. **npm run eval:board:phase5:live** repeats recording and decoding with real Cartesia speech. Both use an Electron window painted at zero opacity with speakers muted. An entirely hidden test window intermittently yielded no video frames; explicit canvas frame requests and a painted test window exercise the overlay's visible-page behavior. The recorder reports an empty output as a failure.

Retained [synthetic](../performance/whiteboard/phase5-verification.json) and [live](../performance/whiteboard/phase5-live.json) reports describe fixture scope. Frames are sampled using the video container's duration; decoding PCM alone omits silent gaps and cannot supply the last video timestamp. Visual review confirms full long-label text in the final frame.

## Background reviewer

The roadmap requires a measured clarity improvement without a first-stroke penalty before implementing a second model pass. No scored comparison establishes that improvement. The reviewer remains unimplemented and makes no extra model calls. Existing provider latency, human clarity and hosted export rollout gates remain in force.

## References

- [MediaStream Recording](https://www.w3.org/TR/mediastream-recording/)
- [Media Capture from DOM Elements](https://www.w3.org/TR/mediacapture-fromelement/)
