# Background agents: phases 0 and 1

Implemented on 9 October 2026. The first workflow turns supplied text into PDFs while Kite remains available for other work. Open **Agents** from the tray or the settings sidebar. No model key or extra converter installation is needed for this workflow.

## Using the panel

1. Select **New run**, name the document, and paste text or choose UTF-8 `.txt` / `.md` files. The native picker grants access to those selected files only.
2. Select **Start run**. A run without input waits in **Needs you**; supply text or files when ready. If **Add or save** is configured to Ask, approve the specific inputs and PDF layout there.
3. Close the panel and keep working. Reopen it to see progress and activity. **Completed** includes finished, failed, and cancelled runs.
4. Open a checked PDF or use **Save a copy**. Choose a new filename: export does not overwrite existing files.
5. In **My agents**, save a named helper, brief, and Readable (12 pt) or Compact (10 pt) layout. Editing a helper creates a new revision. Existing runs keep their starting revision and input snapshot.

The brief currently describes the helper's purpose. It does not drive a model or execute arbitrary instructions. Markdown is printed as source text, including its notation. Compact changes typography; it is not a document compression capability.

Voice can request a background PDF run through `start_background`. Starting requires the existing action approval. If the user refers to a file, the tool creates a persisted input question rather than guessing its contents or passing a filesystem path. The acknowledgement returns a run ID and does not claim completion. New voice interactions and Escape do not cancel work already handed off.

## Lifecycle and limits

Closing the Agents window keeps work running. Per-run Pause preserves its checkpoint; Resume continues it. Cancel revokes the execution generation so late callbacks cannot commit outputs. **Run again** creates a new run with the original frozen input and agent revision, and asks again if permission requires it.

Pause Kite blocks dispatch and parks active work. Suspend and graceful quit also checkpoint it. On next launch, interrupted work is recovered; only this deterministic local conversion is safe to replay. Work cannot continue while Kite is quit or the PC is asleep. Repeated unexpected interruptions stop recovery after the third interruption. User pauses do not consume that budget.

There are two active run slots and one PDF print worker. A run accepts at most eight inputs; each is at most 100,000 characters and selected files at most 2 MB. PDF output is capped at 20 MB each and 1,000 pages. Execution has a two-minute limit per active attempt. At most 50 unfinished runs may exist; the panel lists up to 200 runs, including every unfinished run followed by recent finished runs. File-selection handles expire after 30 minutes; accepted runs already hold their snapshots.

## Storage and access

Agent definitions, revisions, frozen inputs, requests, events, and operation journals live in `userData/background.db`. Their payloads use OS encryption through Electron `safeStorage`, with no plaintext fallback. IDs, status, revisions, and timestamps used for indexing remain visible. Deleting voice history does not delete agent work.

Generated PDFs in `userData/agent-artifacts/` and user-exported copies are ordinary **unencrypted files** containing the supplied text. They remain until manually removed; this phase has no retention or delete UI. Inputs and PDF rendering stay local. The converter does not fetch resources, run document scripts, launch shell commands, or read mail. Source files are never overwritten. Run notifications can show the helper name and generic status; keep names nonsensitive if desktop notifications are shared.

PDF checking verifies the complete Chromium output, page objects, size, and SHA-256 hash. Opening/exporting rechecks the stored file. This verifier is deliberately restricted to Kite-generated PDFs; it is not a parser for uploaded third-party PDFs.

## Phase 0 evidence and remaining gates

The [packaged probe](performance/background/phase0.json) records engine versions, fixture timings, process working sets, event-loop responsiveness, browser profile isolation, and zero model usage. The isolated browser retains a synthetic login after its window is reopened and exposes neither the Kite preload nor Node. It is a test probe, with no browser capability exposed to agents.

LibreOffice detection is included, but no Office adapter is installed or enabled. Office fidelity fixtures, real account sign-in, browser automation, and an installer-size comparison against an identical baseline remain gates. The synthetic probe does not establish production browser compatibility, overlay animation responsiveness, or live voice latency under load. Read [ADR 022](adr/022-background-agents.md) before adding side-effecting executors.

Mail, job applications, document compression, schedules, and model-planned custom capabilities are later phases. This implementation establishes the durable runtime and usable panel with one bounded workflow.

## Validation commands

```sh
npm run test:unit
npm run test:background
npm run package
npm run test:background:panel
npm run test:startup
npm run test:packaged
npm run eval:background:phase0
npm test
npm run typecheck
npm run lint
```

The native test uses real encrypted SQLite and a real Chromium PDF, plus controlled worker callbacks for cancellation/recovery races. The panel test uses the bundled main, preload, React UI, trusted IPC, and native export dialog stub in an isolated profile. Neither test uses provider credentials or a live microphone.
