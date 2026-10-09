# Background agents: documents and Gmail

Phases 0–5 development implementations on 9 October 2026. Open **Agents** from the tray or settings sidebar. Document workflows run on this PC without a model key, while Kite remains available for other work. Phase 3 adds account-aware, read-only Gmail Inbox Briefings with local excerpts, PDF output and optional attachment downloads. Set up your own Desktop OAuth client using the [Gmail guide](mail-agents.md); real sign-in and public verification remain release gates. Phase 4 adds [Career Scout and isolated application preparation](career-agents.md), with public Greenhouse/Lever discovery, approved frozen resume/contact fields, manual submission handoff and no replay of uncertain outcomes. Live ATS compatibility remains a gate.

## Using the panel

1. Select **New run**, name it, and choose **Convert text or images to PDF** or **Optimize PDF (lossless)**. Paste text for conversion or use **Choose files**. Each selected input produces a separate PDF; files are not merged.
2. For optimization, optionally enter a target size per PDF in MB (1 MB = 1,048,576 bytes). Targets are goals, not guarantees. Start without input to create a durable question in **Needs you**.
3. Select **Start run**. If **Add or save** is configured to Ask, approve the frozen inputs and settings there. Close the panel and keep working; reopen it to see activity and progress.
4. In **Completed**, use **Preview**, **Open**, **Show in folder**, or **Save a copy**. Preview is inside Kite. Open uses the Windows default app. Save a copy requires a new filename and never overwrites an existing file.
5. In **My agents**, save a named Document Helper or PDF Optimizer with its workflow, brief, text layout, and optional target. Editing creates a revision. Existing runs retain the revision and input snapshot with which they started.

Optimization reports original/output size, bytes saved, and whether the target was met. If no smaller rewrite is available, Kite saves an unchanged copy and says so. An unmet target still produces a usable checked output and a visible **Target not met** result.

The brief describes the helper's purpose; it does not execute arbitrary instructions or drive a model. Markdown is printed as source text, including its notation. Compact changes text typography rather than compressing an existing document.

Voice can delegate conversion or PDF optimization through `start_background`. Existing action approval still applies. References to files create a persisted native-selection question rather than passing paths or guessing contents. The acknowledgement returns a run ID and does not claim completion. New voice interactions and Escape do not cancel accepted background work.

## Supported inputs and fidelity

- **Text:** nonempty UTF-8 `.txt` / `.md`, printed by Chromium with Readable (12 pt) or Compact (10 pt) layout. Markdown is literal source, not a rich Markdown renderer. Installed fonts determine script/glyph coverage; Latin UTF-8 fixtures are verified.
- **Images:** `.png` with 8-bit RGB/RGBA, noninterlaced pixels; `.jpg` / `.jpeg` with supported 8-bit grayscale/RGB frames. Each image is centered on A4 with an 18 pt margin. Pixels are embedded without downsampling; the display scales to fit. PNG alpha is preserved and JPEG compressed bytes are preserved.
- **PDF optimization:** plain, unencrypted PDFs with static page content. The worker rewrites structural overhead using object streams. It preserves page boxes/rotation and raw content/font/image streams, reparses the candidate, compares those invariants, and selects it only when smaller. It does not promise removal of every redundant object, metadata preservation byte for byte, archival conformance, or a particular percentage reduction.

Password-protected or signed PDFs, nonempty annotations (including links), forms/XFA, actions/scripts, attachments, optional-content layers, malformed inputs, and out-of-limit documents are rejected. Images with CMYK, custom ICC profiles, rotated EXIF, APNG, unsupported PNG bit depths/color types/interlacing or other unsupported color metadata are rejected rather than silently altered. Export those inputs to a supported static format first. Office formats and image downsampling are not enabled.

[Packaged fixture report](performance/background/phase2.json) and [independent fidelity report](performance/background/phase2-fidelity.json) establish the bounded synthetic corpus: strict parsing and rendering for every positive output; identical Poppler pixels at 100 DPI on all 15 optimization pages; identical page boxes/text; PNG pixels/alpha and JPEG stream bytes preserved. They are not a general PDF, font, or Office compatibility certification.

## Lifecycle and limits

Closing the Agents window keeps work running. Pause preserves a checkpoint; Resume continues. Cancel revokes the generation and terminates its current worker so late callbacks cannot publish. **Run again** creates a new run with the original frozen input and helper revision and asks again where permission requires it.

Pause Kite parks work. Suspend and graceful quit also checkpoint it. On launch, interrupted deterministic work recovers through its operation journal, including a file published before the run checkpoint, without duplicate outputs. Unexpected recovery stops after three interruptions. Work cannot continue while Kite is quit or the PC sleeps.

There are two active run slots, one Chromium print worker and one binary document worker at a time. Up to eight inputs and 16 MB are accepted per run. Text files are capped at 2 MB/100,000 characters; PDF/image files at 5 MB; uploaded PDFs at 200 pages; images at 12 million pixels and 12,000 pixels per dimension. The binary worker also bounds embedded PDF image dimensions, object count and nesting. PDF output is capped at 20 MB. Text output retains the legacy 1,000-page structural cap. Execution has a two-minute limit per active attempt; binary jobs have a 30-second deadline. At most 50 unfinished runs exist; the panel lists every unfinished run plus recent completed work, up to 200 runs.

Native selection grants expire after 30 minutes, with a 32 MB in-memory grant budget. Accepted runs already hold encrypted snapshots, so editing or moving the original after selection does not change their work. At most three PDF preview windows can remain open. Missing binary dependencies appear under **Capabilities and access**; text printing remains available.

## Storage and isolation

Definitions, revisions, text snapshots, requests, events and operation journals live in `userData/background.db`. Schema v2 adds separately encrypted binary snapshots, referenced from runs so progress updates do not repeatedly copy binary payloads. Existing v1 runs, helper revisions and pending approval bindings migrate intact. Payloads use Electron `safeStorage` OS encryption with no plaintext fallback; indexed IDs/status/revisions/timestamps remain visible. Deleting voice history does not delete agent work.

Generated PDFs in `userData/agent-artifacts/` and exported copies are ordinary **unencrypted files**. They remain until manually removed; this phase has no retention/delete UI. No model, document upload, mail access, shell command or external resource fetch is part of these workflows. Original files are never overwritten. Notifications show helper names and generic status.

Binary admission and execution run in a fresh Electron utility process with no user paths or credentials in its job and a small environment. It is terminated after each job, cancellation, timeout or shutdown; a 256 MB JavaScript heap setting and sampled 512 MB working-set threshold bound routine usage. This is process isolation, not an OS filesystem/network sandbox or an instantaneous hard memory limit. The parser is trusted application code and never evaluates embedded document instructions.

Preview receives verified immutable bytes in an independent, sandboxed Chromium session with no Kite preload or Node integration. A private HTTPS handler serves only that buffer; the URL never reaches DNS/network. Only the buffer and Chromium's own PDF viewer resources are allowed; external requests, navigation, popups, permissions and downloads are denied. The native viewer needs its own JavaScript; admission rejects active PDF features before publication. Opening in another Windows app is outside this preview session's isolation.

Every artifact has checked size/page count and SHA-256. Publication is journaled and generation-fenced; preview/export recheck stored bytes against the recorded hash. See [ADR 023](adr/023-document-workers.md) for implementation and dependency decisions and [ADR 022](adr/022-background-agents.md) before adding side-effecting workflows.

## Validation and remaining gates

Run the following after changes:

```sh
npm run test:unit
npm run typecheck
npm run lint
npm run package
npm run test:background
npm run test:background:documents
npm run test:background:preview
npm run test:background:panel
npm run test:startup
npm run test:native
npm run test:packaged
npx electron tests/packaged-runtime.cjs
npm run eval:background:phase2
python scripts/background-document-fidelity.py --pdftoppm /path/to/pdftoppm
npm test
```

Build before tests that use `.vite/build`; do not run those tests concurrently with Forge, which replaces that directory. Native fixtures cover cancellation, encrypted binary snapshots, originals, target/no-growth reporting, restart, v1 migration and publication recovery. The real bundled panel test covers restored input, completion after closing the panel, visible preview, reveal, exclusive export and saved helpers. The packaged probe checks actual worker/library paths and versions. No provider credentials, mailbox or live microphone are used.

The historical [phase 0 report](performance/background/phase0.json) measured the initial text workflow and synthetic isolated-browser login. Its zero-added-package finding belongs to that earlier baseline. Phase 2 adds pdf-lib and its dependencies; phases 3–5 add no runtime dependency. Office converter distribution/fidelity, broader production document corpora, identical-baseline installer impact, real browser sign-in/ATS compatibility, repeated-run memory, and live overlay/voice latency remain release gates. These local implementations and fixture passes do not publish a release. Gmail and Career Scout gates are recorded in their linked guides. Automatic submission, always-on hosting and model-planned custom capabilities remain future work.

## Schedules and bounded child work

Open **Schedules** to approve recurring reads for a saved Inbox Briefing or Career Scout helper. Daily timezone-aware checks or intervals (15 minutes minimum) run while Kite is awake; missed checks coalesce and unchanged results stay quiet. Existing schedules freeze helper revisions and require renewed consent when permissions or Gmail access change. Career board reads use up to two typed child tasks within one shared byte/attempt/deadline budget. [Setup, recovery and limits](scheduled-agents.md).
