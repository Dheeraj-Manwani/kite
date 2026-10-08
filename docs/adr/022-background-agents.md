# 022: App-owned background runs with deterministic executors

Date: 2026-10-09. Status: accepted for phases 0/1; browser automation and Office distribution remain undecided.

## Problem

Foreground voice interactions own cancellation and desktop tasks own a specific window. A long conversion should survive a new voice hold and a closed panel. Holding an approval Promise in a chat cannot restore a pending question after restart. Reusing desktop automation for every file operation would also make background work depend on focus.

## Decision

Create an app-owned `BackgroundRunService`, started separately from voice, with a separate encrypted SQLite store and a lazy Agents view in the existing settings window. SQLite holds versioned agent definitions, frozen run inputs and agent snapshots, revision-checked run updates, ordered events, durable requests, and operation records. UI commands carry expected revisions; refreshes replay persisted state instead of being the owner of execution.

Use the existing Electron Chromium print engine for the first capability: UTF-8 text / Markdown source to PDF. It adds no runtime packages or bundled Office/browser engine. Rendering takes place in a hidden sandboxed renderer with no preload, Node, JavaScript, or network resources. Main schedules two run slots and serializes PDF printing. Large layout work therefore occurs outside the main event loop, although SQLite encryption and bounded input handling still run in main. Add a utility-process executor when measurements justify heavier work.

The native file picker grants opaque, expiring IDs. The service freezes source text at selection/start; renderers cannot supply filesystem paths, shell commands, executable workflow code, or unregistered capabilities. The saved brief is descriptive for this deterministic workflow. A later planner must compose registered capabilities under the same broker.

Reuse the existing Add or save permission, including site/app rules using `app:kite-pdf`. Check policy at dispatch and before publication/commit. An Ask request binds run ID, agent revision, layout, and frozen inputs and expires after 24 hours. Answers are tied to a specific request and expected revision. Denial cancels. Preview actions creates no run. Explicit manual export exclusively creates a new file.

## Recovery contract

Each PDF operation has a deterministic ID and records intent before execution, a verified hash/byte/page record before publication, and committed artifact metadata with the run checkpoint in one SQLite transaction. Write into the app-owned run directory, rename staging to a stable output filename, and publish artifact metadata only while its execution generation is current.

After an interruption, reconcile a prepared output against its journal. A matching output is committed without a second conversion. An absent output can be regenerated from the immutable source; a changed output fails reconciliation. Cancel and Pause increment generation and abort workers; stale completions cannot become visible artifacts. A late filesystem rename can leave an unexposed file on disk, so cancellation is not a secure erasure promise.

Only pure local conversion uses this replay contract. Do not reuse it for send mail, submit applications, or other remote mutations. Those require account/resource serialization, provider idempotency where supported, operation-specific reconciliation, and an uncertain-outcome state before any retry. No exactly-once remote execution is claimed.

Per-run pause and global pause preserve checkpoints. Graceful shutdown first blocks new IPC and dispatch, then waits for aborted executors before closing the database. Restart reconciles running/verifying work; repeated unexpected interruptions end automatic recovery. User pauses are counted separately from that recovery limit. Foreground cancellation never owns an accepted background run.

## Alternatives and consequences

- **Foreground task reuse:** useful later for supervised desktop actions, but would tie file work to focus and the foreground interaction. Keep the existing desktop agent unchanged until a shared desktop lease exists.
- **Cloud engine:** could run with the PC off; needs accounts, credential custody, storage, billing, and explicit cloud consent. Local-first matches current Kite architecture.
- **Planner-first universal agents:** broadens apparent coverage before reliable tools/verifiers exist. Start with the deterministic workflow, then add capabilities with their own permission and recovery contracts.
- **LibreOffice:** appropriate candidate for Office conversion; detection only in this phase. Decide packaging, license notices, sandbox/process limits, and fidelity corpus before enabling it. Existing Chromium is sufficient for the explicitly supported source-text format.
- **Playwright:** remains the candidate from the research plan for general browser automation. This phase probes an Electron BrowserWindow with a dedicated persistent session to measure the smaller-footprint alternative. Passing synthetic session isolation does not select a production automation driver or establish real login support. Measure Playwright distribution and supported flows before phase 4.

The probe browser has no trusted preload/IPC and denies permissions, downloads, popups, and non-HTTPS top-level navigation (a local HTTP fixture is explicitly permitted only inside tests). It never copies the user's normal browser cookies. It is not registered as an agent capability. Rendering and the probe use Chromium already distributed with Electron; existing Electron/Chromium license notices still apply. No third-party converter distribution or new license bundle is introduced.

## Evidence

See [phase 0 report](../performance/background/phase0.json), [operating guide](../background-agents.md), `tests/background-native.cjs`, and `tests/background-panel.cjs`. Native tests cover concurrent independence, encrypted SQLite, immutable revisions, durable questions/approvals, input grants, stale-command rejection, cancellation fencing, failure isolation, foreground handoff, voluntary pauses, bounded crash recovery, and publication reconciliation. The real panel test closes/reopens around work, supplies a restored request, exports a checked PDF, refuses overwrite, and saves a helper.

The first full regression run passed 307/308 with a shopping variant test failure. That test passed in isolation and the full rerun passed 308/308. New unit checks cover strict schemas, markup escaping, and incomplete PDF rejection. Packaged smoke covers native SQLite and keyboard hooks. Real provider traffic, real account sign-in, Office files, cloud execution, and remote mutation recovery are outside this evidence.
