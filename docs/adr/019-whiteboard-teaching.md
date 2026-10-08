# 019 — Whiteboard teaching follows the audio clock and explicit changes

Date: 2026-10-08. Status: implemented behind `KITE_BOARD_PHASE3=1`; provider-clarity release gate pending.

## Context and decision

Phase 2 separates specialist planning from local layout. Phase 3 adds teaching behavior to that same contract: word-cued drawing, next-beat audio, emphasis and state changes, data/equation/plot families, questions, child boards and expanded playback controls. The eight implementation items exist. The released default remains unchanged because Phase 2's complete-path latency gate and Phase 3's scored clarity gate remain open.

`KITE_BOARD_PHASE3=1` implies the structured path and teaching extension; `KITE_BOARD_PHASE2=0` explicitly disables them. The Whiteboard action toggle and independent specialist picker still apply. Phase 3 defaults to streamed JSON; Phase 2 keeps its measured compact line format. Both parsers support teaching metadata and old saved coordinates retain their legacy adapter.

Early line probes produced clean pictures while describing swaps without emitting changes, placing metadata in reference fields, or confusing node identities with current positions. The teaching prompt now provides complete action/question examples and explains that a swapped node retains its value and id. Fresh JSON probes on DeepSeek Flash, Groq GPT OSS 120B and Kimi K2.6 all emitted the two actual swaps for `[7,3,5]`, ended at `[3,5,7]`, and included an `ask` pause. Prompt and format changed between probes; this is a capability check, not a controlled format-performance experiment or semantic quality guarantee.

## Timing and audio ownership

`boardTeaching.ts` maps explicit phrases or matching label words to Cartesia's word timestamps. Quiet announcement hooks forward timestamp batches and the playback id into `BoardSession`. The overlay follows that id's real Web Audio elapsed time rather than the arrival time of network events. Estimated reading timing is available without voice and before complete timestamps arrive; stale generation callbacks are ignored. Cue acknowledgements log numeric expected/actual timings, without lesson labels. Teaching cameras cut to the beat to avoid a 500 ms camera glide delaying the first spoken cue.

The session requests one known next beat while the current beat plays. `TTSService` uses a separate stream with a 12 MB PCM limit; it buffers timestamps/audio silently until `speak` adopts the matching text, voice and speed. Arriving tail chunks retain the adopted playback id. Pause, navigation, mute, close and cancellation discard stale work. Questions do not prefetch an answer. Beats still wait for both narration and drawing; the teaching gap is 150 ms. An unknown streamed beat or slow synthesis can still introduce a longer wait.

## Scene changes, maths and conversation

Effects are underline, pulse, dim-other-elements, numbered badges and strike-through. Erased elements remain temporarily visible for an eraser animation; old values cross out before replacement text is written. Moves/swaps animate together with bound arrows. Compiled beats deduplicate multiple changes to one id. Reduced motion completes transformations directly and suppresses pulse animation.

The data family provides array slots/indices, stacks, queues, linked-list nodes, hash buckets and pointer nodes. Equal measured slots reserve future value widths and keep index labels fixed when node identities swap. Pointer moves can retarget their bound arrow. These are explicit teaching operations; arbitrary user element editing remains Phase 4.

The steps family aligns formula baselines and equals columns, with measured side notes. A lazy, cached Node worker runs MathJax 4 (`@mathjax/src`) and extracts only bounded paths/transforms from its SVG output; no provider HTML is inserted. Worker/font dependencies and their notices ship locally. See the [MathJax source/license](https://github.com/mathjax/MathJax-src) and `assets/licenses/mathjax.txt`. Failed conversion uses plain-text notation. The plot family uses a bounded recursive-descent expression parser, a fixed sample budget, discontinuity breaks, axes, highlighted points and shading. It never evaluates executable provider code. Neither family proves the provider's mathematical reasoning.

An `ask` beat waits after audio and drawing finish. A spoken answer enters model context; follow-up feedback is inserted before the original remaining lesson, with a pause before continuing. Next/continue can skip a question. The prompt requests questions for “teach me”/“quiz me”, plus recaps, simpler explanations, examples and detail. Explicit drill-downs can create a child board; breadcrumbs and Go back restore the paused parent session, scene and archive identity. Reopening an archive does not make the previously open board its parent.

Previous, beat jumps and 0.75×–1.5× lesson speed run locally. A jump reconstructs the scene from compiled beats and invalidates later question answers. Speed changes affect lesson narration/timing, not ordinary conversations.

## Evidence and remaining gate

All **281 unit tests** passed serially. Native smoke verifies the real Electron formula worker. Renderer smoke verifies cues, simultaneous changes/bound arrows, erasure, effects, formula paths and controls; two earlier full runs hit existing kite-animation timing assertions before an isolated pass. Type checking, lint and main/renderer builds passed.

[Five deterministic fixtures](../performance/whiteboard/phase3-fixtures.json) contain 16 clean beats. [Nine final provider probes](../performance/whiteboard/phase3-provider-probe.json) are clean; they are three targeted prompts per provider, not the full golden set. The [14-board gallery](../performance/whiteboard/phase3/index.html) shows finished boards.

The [real audio fixture](../performance/whiteboard/phase3-live.json) uses the 1080p offscreen overlay, ordinary motion, Cartesia sonic-3.5 and actual Web Audio scheduling with speaker output muted. Across six cues in three fully known beats, median error is **19.5 ms** and maximum between-beat dead air is **406 ms**, passing the 250/700 ms targets for this sample. [Synthetic renderer checks](../performance/whiteboard/phase3-renderer.json) remain separately identified. The initial live harness startup did not complete; the current harness supplies complete model settings and waits for voice/board listeners before dispatch. The incomplete attempt is not counted as a pass.

A scored comparison establishing clarity above Phase 2 on **every provider** is still missing. The timing fixture does not establish all voice/network/speed behavior or waits for not-yet-generated beats. Keep teaching opt-in until the remaining gate is demonstrated; preserve the earlier Phase 1/2 baselines.
