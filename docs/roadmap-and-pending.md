# Kite — pending release work and product roadmap

Research date: **30 September 2026**. Code baseline: `f6f1cfe` on `master`, tagged `v1.0.0`.

This is the project backlog, kept entirely in this Markdown file. No GitHub issues are created. Items below are work to do, not promises that the features already exist. Competitor observations come from public first-party pages and repositories, not hands-on testing. Priorities and recommended designs are our judgment.

## Start here

**Recommended direction:** make Kite the Windows companion that helps you understand a specific thing, guides your next step, and produces a useful result without taking control away from you.

The strongest next sequence is:

1. Close the release acceptance gaps.
2. Fix setup, recovery, and history rough edges.
3. Add a typed fallback, precise visual guidance, and source-backed research.
4. Add user-controlled knowledge and memory.
5. Expand into integrations and bounded automation after permissions, cancellation, and evaluation are reliable.

Kite already has the hard foundations: push-to-talk, marked overview/zoom images, vision routing, streaming speech, deterministic approvals, an audit trail, encrypted provider keys, searchable history, and packaging. Reimplementing those as “new features” would waste effort. Improve the complete user journeys around them.

**Suggested core journeys**

- “What does this mean?” → mark a word/chart/error → a precise explanation.
- “Show me how” → a visible pointer and one instruction → the user acts → Kite checks the next step.
- “Turn this into something useful” → mark content → a cited summary, note, comparison, or draft.
- “Help me continue” → return to a previous conversation or explicitly saved project context.

**Not the next milestone:** an always-recording desktop, an autonomous agent swarm, a public plugin marketplace, cloud sync, a new rendering engine, or cross-platform parity. These multiply the reliability and privacy surface before we have measured everyday usefulness.

## Status and evidence

### Already completed — do not reopen as missing implementation

- [x] Unsigned Squirrel installer, ZIP, update manifest, and native dependency packaging.
- [x] Packaged executable smoke: SQLite, uiohook, and tray assets.
- [x] Onboarding, history/FTS/export/deletion, modifier hotkeys, low-risk tool trust settings, pause, startup setting, logging, and original brand assets.
- [x] 79 Node tests and 4 Vitest tests passed; native, renderer, and startup checks passed locally.
- [x] Renderer regression exercised 50 playback turns with stable IPC listener counts and at most one live playback AudioContext.
- [x] PR #1 merged; repository description/topics updated; README, architecture, ten ADRs, and demo script published in source.
- [x] [Merged-branch CI](https://github.com/Dheeraj-Manwani/kite/actions/runs/36645928182), [tag CI](https://github.com/Dheeraj-Manwani/kite/actions/runs/36645963469), and [tagged release workflow](https://github.com/Dheeraj-Manwani/kite/actions/runs/36645963468) passed.
- [x] Four assets uploaded to the [draft release](https://github.com/Dheeraj-Manwani/kite/releases). This is not a public, fully accepted release.
- [x] Quiet-workstation measurement: approximately **0.66% idle CPU, 430 MB total process working set, and 60 fps while moving**. See [method and limitations](performance/README.md) and [raw samples](performance/latest.json).

No live voice-latency median, clean-account installation, or installed-version update result has been established. A test passing on a developer machine does not establish those results.

### How to read an item

- **P0:** release acceptance blocker. **P1:** next iteration. **P2:** after the core journeys work well. **P3:** gated exploration.
- **Evidence:** “code-confirmed” means the relevant path was inspected, not that every failure was reproduced on a device. “Risk” needs a reproducer. “Proposal” is a product hypothesis.
- **Size:** S = contained change; M = several components; L = substantial subsystem; XL = architectural exploration. Sizes are relative, not delivery dates.
- Every unchecked item is open. Close it only with the stated evidence. Add owner, completion date, and evidence link when work starts/finishes.

## 1. Pending release acceptance

### R01 — Clean Windows installation and uninstall

- [ ] **P0 · validation · M.** Install the actual draft `KiteSetup.exe` on a clean Windows VM or separate Windows account with no developer dependencies.
- Exercise install/shortcuts, first launch, SQLite reopen, actual modifier press/release, Settings, second launch, launch-at-login, uninstall, and reinstall. Check the app name/icon and default startup-off behavior.
- **Done when:** a dated result records Windows build, architecture, installer SHA256, expected data-retention behavior, and each outcome. Any failure becomes a specific defect with reproduction steps.
- **Dependency:** interactive clean Windows environment. Existing packaged smoke is supporting evidence only. [Release procedure](releasing.md).

### R02 — Real installed-version update and failed-update recovery

- [ ] **P0 · validation · L.** Test an installed older Squirrel version receiving a higher eligible release, preserving settings/history, displaying the update-ready badge, and restarting into the new version.
- Include offline checks, interrupted download, declined restart, and an active voice/tool interaction at restart. Inspect stable-launcher/login registration after updating.
- **Done when:** version transition and retained data are demonstrated, failure does not strand the user, and updater channel eligibility is documented.
- **Dependency:** two versions and an appropriate published test/release feed. Do not publish a public release merely to satisfy this test without planning the channel. Draft availability does not prove update availability.

### R03 — Live voice, provider, and latency acceptance

- [ ] **P0 · validation · M.** Test real microphone → Groq → selected model → optional Cartesia with configured test accounts. Cover text-only mode, missing keys, rate limits, disconnects, barge-in, and spoken approvals.
- Run at least 30 successful short-question turns for the default supported configuration; report median/p95 release-to-first-audio, sample count, errors, model, network, and device. Keep cold-start samples separate. Exercise the other providers with a smaller documented conformance set.
- **Done when:** actual answers and audio work, actual responding models are recorded, and measured latency replaces “not measured.” A suggested 1.5-second median remains an aspiration until measured.
- **Dependency:** provider accounts and a person speaking; never commit credentials or private recordings.

### R04 — Mixed-DPI marking and display changes

- [ ] **P0 · validation · M.** Test 100%, 125%, 150%, and 200% scaling; a negative-origin second monitor; moving windows between displays; and disconnecting a display during a hold.
- Cover taps, circles, underlines, arrows, two disjoint marks, limits, and marks near screen edges. Use a numbered synthetic grid so alignment can be judged objectively.
- **Done when:** overview/zoom mark the intended target, no ink clicks through to the underlying app, and display changes cancel or recover cleanly. Record screenshots of non-sensitive fixtures and the display configuration.

### R05 — Capture exclusion and default retention

- [ ] **P0 · validation · M.** Verify test captures exclude Kite, every capture shows its indicator/flash, and normal OBS/Game Bar recordings show Kite outside its brief capture interval.
- Check default sessions create no screenshot files; opt-in retention creates referenced JPEGs; deleting history removes them; failed captures restore protection/visibility.
- **Done when:** evidence covers normal capture, thrown capture, interrupted turn, screen lock, and failed deletion. Document protected-content limitations rather than treating a black image as a successful observation.
- **Dependency:** Windows capture/recording setup. The development test-capture intentionally writes a PNG and must be kept separate from the default-retention assertion.

### R06 — Focus, keyboard accessibility, and lifecycle

- [ ] **P0 · validation · M.** Test approval by click and voice while typing into Notepad, a browser editor, and an Office editor; clipboard restoration must survive cancellation.
- Exercise keyboard-only bubble controls, Narrator, Windows text scaling, reduced motion, sleep/wake, audio-device change, pause/resume, and fullscreen applications.
- **Done when:** no accidental input reaches the underlying app, focus returns predictably, controls remain readable/reachable, and the hook recovers after wake. Record inaccessible controls as individual defects.

### R07 — Installed-app endurance and resource baseline

- [ ] **P1 · validation · M.** Extend the 50-turn playback check to real recording, capture, approved/denied tools, opening/closing Settings, and a 60-minute installed-app soak.
- Measure private memory and working set separately, CPU, GPU if available, frame p95, time to ready, and battery impact on a modest laptop and the current workstation.
- **Done when:** live contexts/listeners return to steady state, resource growth is bounded and explained, and idle/moving numbers are repeatable. The current 430 MB working-set measurement is not an acoustic/voice benchmark.

### R08 — Real narrated demo and truthful portfolio media

- [ ] **P1 · publication · M.** Record the [demo script](demo.md) using real responses and harmless sample content. Include an approval, annotated question, note result, and model switch.
- **Done when:** the video is reviewed for secrets, hosted, and linked in README. Keep checked-in simulation GIFs labeled; do not present them as live model evidence.

### R09 — Social preview and public-release decision

- [ ] **P1 · publication · S.** Upload [social-preview.png](../assets/social-preview.png) to the repository's Social preview setting using a signed-in GitHub browser.
- **Done when:** the repository preview visibly uses the image. Description and topics are already updated.
- After R01–R06, make a separate explicit release decision: audience, known limitations, stable versus preview channel, release notes, and whether signing is still intentionally deferred. Do not conflate merging source or tagging with public release acceptance.

## 2. What existing products teach us

These are feature observations, not claims that competitors work better, run faster, or have been security-audited. Their capabilities and availability can change. We did not install them or copy their code, artwork, branding, or onboarding text.

### HeyClicky — the closest interaction reference

The official site describes a macOS companion with voice questions, screen guidance, drawing, and agents; it still links a Windows waitlist. Its September 24, 2026 changelog describes smaller transient UI, follow-ups, conversation-scoped computer-use consent, and fixes for capture/overlay interference. Earlier entries discuss long-history responsiveness, stale screenshots, and quiet behavior during calls. Sources: [product](https://www.heyclicky.com/), [changelog](https://www.heyclicky.com/changelog), [trust page](https://www.heyclicky.com/trust).

**Our inference:** charm gets attention, but unobtrusive UI, continuity, accurate consent scope, and recovery make a companion usable every day. Kite should add visual teaching and easy follow-ups before pursuing multiple autonomous companions. Windows support alone is not a durable advantage.

### Clicky Windows community implementation — a direct Windows comparison

This community repository advertises pointing guidance, per-app Markdown memory, a drop-in knowledge folder, and local STT/TTS/vision options. It is a separate Windows implementation, not proof that HeyClicky's official Windows product has shipped. Its claimed grounding accuracy has not been independently tested here. Source: [Clicky Windows repository](https://github.com/AbhishekVulla/clicky-windows).

**Our inference:** user-owned knowledge and a viable offline path are credible needs. Kite should differentiate through measured targeting quality, understandable data flow, and reliable end-to-end tasks rather than claiming to be the only Windows option.

### Microsoft Copilot Vision — guidance without taking over

Microsoft documents voice interaction with shared apps/windows, visual highlights, and a screen-reader navigation path. The cited Vision guidance describes assisting the user rather than directly operating page content. Source: [Microsoft accessibility guide](https://support.microsoft.com/en-us/accessibility/copilot/basic-tasks-using-a-screen-reader-with-copilot-vision).

**Our inference:** “show me where, let me click” is a useful, lower-risk feature in its own right. Kite should make visual pointers understandable without relying solely on color and provide a keyboard-accessible stop control.

### Raycast — reusable actions and durable context

Raycast's Windows changelog describes AI chat, screen context, projects, automations, and extensions. Its command manual supports reusable prompts over selected text, with output either displayed or replacing a selection. Sources: [Windows changelog](https://www.raycast.com/changelog/windows), [AI Commands](https://manual.raycast.com/ai/ai-commands), [AI Chat](https://manual.raycast.com/ai/ai-chat).

**Our inference:** make frequent tasks reachable by a short command, and let users choose where the output goes. A keyboard-first composer and reusable task recipes complement Kite's voice/annotation interface.

### Wispr Flow — voice quality is an interaction system

Wispr describes personal dictionaries, snippets, application-sensitive styles, and transcription cleanup. Its current privacy documentation separates model-improvement consent, cloud storage, and local history controls. Sources: [features](https://wisprflow.ai/features), [security/privacy overview](https://docs.wisprflow.ai/articles/3467817258-security-and-compliance-faq).

**Our inference:** technical vocabulary and correction workflows matter as much as the STT provider. Kite should expose distinct choices for recording, sending context, retention, and saved memory rather than one ambiguous “private” toggle.

### Screenpipe — searchable personal context, with a different capture contract

Screenpipe's repository describes persistent local screen/audio history, search, accessibility/OCR context, and an API/MCP integration surface. Its privacy section also identifies optional remote processing and telemetry behavior; “local” should not be flattened into a blanket no-network claim. Source: [Screenpipe repository](https://github.com/screenpipe/screenpipe).

**Our inference:** retrieval is valuable, but continuous recording would change Kite's current trust contract. Begin with explicitly saved notes, conversations, and selected files. Keep ambient recording out of the near-term roadmap.

### Alter — context beyond screenshot pixels

Alter's first-party site describes combining screen/app context, voice actions, and local-model options in a macOS assistant. These are vendor descriptions, not verified cross-platform capabilities. Source: [Alter](https://alterhq.com/).

**Our inference:** screenshots alone omit structure and hidden document context. Explicit text selection, accessible UI labels, and user-selected files can improve precision while reducing image cost.

### Product conclusions

1. **Prioritize completed jobs over a longer feature list.** A user should end a session with understanding, a completed next step, or an artifact they can use.
2. **Add precision before autonomy.** Correct target identification and source grounding are prerequisites for computer control.
3. **Make the quiet path excellent.** Typed input, silent answers, resumable history, and deliberate context selection should work without voice.
4. **Make memory inspectable.** Save durable knowledge only through explicit controls, with edit/delete and provenance.
5. **Measure Kite against its own baseline.** Do not compare our workstation CPU figures with vendor marketing numbers from different workloads.
6. **Preserve independent identity.** Keep Kite's diamond/cross-spar/bow-tail design and its own interaction language.

## 3. Fixes and concrete gaps in current code

### F01 — Distinguish skipped setup from completed onboarding

- [ ] **P1 · code-confirmed · S.** [Onboarding](../src/renderer/components/Onboarding.tsx) sends both “Let's fly” and “Finish later in Settings” through `finish()`, which sets `onboardingComplete: true`. There is no persisted current step.
- **Change:** store not-started/in-progress/skipped/complete status and resumable step; make readiness explicit without trapping users in setup.
- **Acceptance:** a user who skips without keys can resume at the unfinished step; completed users do not get an unwanted tour; existing preferences migrate safely.

### F02 — Show onboarding setting failures and first-answer readiness

- [ ] **P1 · code-confirmed · S.** Final preference toggles ignore `updateSettings` results. Enabling TTS without a key/voice can fail silently. The first-question view checks Groq but does not establish readiness of the selected reply provider.
- **Change:** show actionable inline errors and a small readiness checklist; offer a deliberate text-only path.
- **Acceptance:** missing Groq, missing selected-model key, missing Cartesia voice, and rejected setting changes explain what to fix. Continue/skip stays a deliberate choice, not a false success.

### F03 — Release microphone resources on partial initialization failure

- [ ] **P1 · code-confirmed failure-path risk · M.** In [onboarding](../src/renderer/components/Onboarding.tsx), cleanup is assigned only after AudioContext/analyser setup. In [recorder warm-up](../src/renderer/voice/recorder.ts), a rejection resets the warm-up promise without disposing every partially created resource.
- **Change:** own the stream/context as soon as acquired; dispose partial initialization before allowing a retry.
- **Acceptance:** inject failures after getUserMedia, AudioContext construction, source creation, and suspend. No track/context survives a failed attempt; a later retry succeeds. This is a code-path finding, not a claim of an observed everyday microphone leak.

### F04 — Make history failures recoverable and ignore stale responses

- [ ] **P1 · code-confirmed gap/race risk · M.** [HistoryView](../src/renderer/components/HistoryView.tsx) has no rejection handling on detail/export/delete flows; its deletion refresh can apply results for an older query.
- **Change:** add operation states, retries, cancellation/generation guards, and clear errors.
- **Acceptance:** delayed/out-of-order responses cannot replace a newer search or selected conversation; rejected IPC does not become an unhandled rejection; retry preserves user intent.

### F05 — Preserve a retry path for screenshot cleanup failures

- [ ] **P1 · code-confirmed · M.** [History deletion](../src/main/ipc/history.ts) deletes attachment rows before unlinking JPEGs. A locked file produces a warning, but its database reference is already gone, so repeating deletion cannot discover it.
- **Change:** use a durable deletion queue/tombstone, or equivalent retryable cleanup record, restricted to managed screenshot paths.
- **Acceptance:** a locked JPEG is reported as pending removal, is deleted after the lock clears/restart, and cannot cause deletion outside `userData/screens`. Do not restore deleted message content just to retry cleanup.

### F06 — Remove the silent history browsing ceiling

- [ ] **P1 · code-confirmed limitation · M.** [Database listing](../src/main/storage/database.ts) returns at most 300 conversations; the UI has no pagination. Detail loads every message/tool record in the selected conversation.
- **Change:** keyset pagination for lists and long threads, stable selection, and lazy rendering.
- **Acceptance:** all entries in a 10,000-conversation fixture can be reached; search and deletion remain correct; loading older turns does not jump the reading position.

### F07 — Make circle practice demonstrate actual targeting

- [ ] **P2 · code-confirmed · S.** [Tutorial practice](../src/renderer/components/Onboarding.tsx) treats any stroke with more than eight sampled points as success, regardless of its location/shape, and lacks an explicit pointer-cancel path.
- **Change:** reuse stroke analysis, test intersection with the example target, offer reset/retry and a non-pointer alternative.
- **Acceptance:** an off-chart scribble is not celebrated as correctly identifying the chart; a valid enclosure/tap is explained; pointer cancellation never leaves drawing active.

### F08 — Publish exactly the distributables that were verified

- [ ] **P1 · code-confirmed process gap · S.** [Release workflow](../.github/workflows/release.yml) runs make/smoke and then `publish --skip-package`; Forge still performs the make phase again. Existing same-name draft assets are skipped by the publisher unless replacement is configured.
- **Change:** build once, persist publish metadata, verify hashes, then publish that artifact set (for example Forge dry-run/from-dry-run after validating its behavior).
- **Acceptance:** release asset hashes match the tested manifest; an existing conflicting asset fails loudly; reruns are idempotent. This is a provenance/efficiency gap, not evidence that the current installer is corrupt.

## 4. Improvements to existing pieces

### I01 — Reduce idle overhead before replacing Electron

- [ ] **P1 · measured baseline/proposal · L.** Profile the approximately 430 MB working set, not just JavaScript heap. [Cursor tracking](../src/main/cursor.ts) still emits updates when stationary; pause hides the overlay but does not itself stop all polling/render work.
- Separate unchanged cursor data from geometry changes; investigate paused/dozing work and unloaded views. Benchmark each change on the same setup.
- **Acceptance:** publish before/after measurements including regressions. Provisional objective: at least 20% less total working set with no worse input latency; revise the target after profiling. No framework migration without evidence.

### I02 — Device selection, hot-plug recovery, and speech calibration

- [ ] **P1 · proposal · M.** Add input/output device choices, a local test, recovery for ended tracks/device changes, and a short optional silence calibration.
- **Acceptance:** plugging/unplugging a headset during idle, capture, and playback yields a recoverable state; quiet speech and noisy rooms have fixture coverage; microphone acquisition remains explicit.

### I03 — Quiet mode and predictable attention

- [ ] **P1 · proposal · M.** Separate explicit-answer audio from unsolicited reminder/announcement audio. Provide presentation/fullscreen quiet mode and an obvious user override.
- **Acceptance:** timers remain visible in history while muted; direct questions behave according to the user's chosen response mode; no automatic call detection requires capturing call content.
- See the HeyClicky research summary for the interaction lesson; this is a Kite-specific design.

### I04 — Better annotations: undo, labels, correction, and capture age

- [ ] **P1 · proposal · M.** Add undo-last-stroke/clear, distinct A/B labels for multiple regions, editable targeting before submit when requested, and a capture-time indicator.
- **Acceptance:** “compare A and B” preserves label-to-region mapping through both images; changed screens cannot silently be presented as a fresh observation; editing never reaches the underlying app.

### I05 — Recoverable voice/agent stages

- [ ] **P1 · proposal · M.** Show concise states for listening, transcribing, reasoning, waiting for approval, acting, and speaking; allow safe retry or switch-to-text.
- **Acceptance:** retries do not repeat an already executed external action; cancellation propagates through every stage; model/provider failure preserves the user's recoverable input without persisting raw audio by default.
- **Dependency:** add idempotency rules before offering “Retry action.”

### I06 — Explicit capture scope and redaction

- [ ] **P1 · proposal · L.** Offer whole display, active window, selected region, and text-only modes; add temporary masks and an app exclusion list.
- Preserve the capture indicator for every image. Do not claim redaction is perfect or use a broader capture when a narrow capture fails.
- **Acceptance:** excluded windows/regions are absent from the actual outgoing payload, including overview images; tests inspect payload bytes/fixtures. Marked content remains understandable after masking.

### I07 — Provider conformance, routing explanation, and spending visibility

- [ ] **P1 · proposal · M.** Expand capability checks beyond static flags, explain fallback/routing, and show approximate per-turn token/image/TTS usage where APIs report it.
- **Acceptance:** supported providers pass a text/image/tool/cancellation fixture matrix; unknown capabilities fail clearly; estimates are labeled; a budget ceiling stops optional work instead of silently switching to a more expensive model.
- Do not promise that a saved key means every listed model is available to that account.

### I08 — A readable data and permissions center

- [ ] **P1 · proposal · L.** Display what is sent to which provider, retained locally, or saved as memory. Add private-session/history-off mode, retention periods, disk usage, and export/delete controls.
- **Acceptance:** disabling history covers conversations, annotations, tool audit content, and attachments according to a documented policy; logs remain content-free; deletion failures are visible and retryable.
- **Dependency:** F05. Maintain mandatory v1 approval for screen/clipboard/typing; memory consent is a separate setting.

### I09 — Useful history, not just an archive

- [ ] **P1 · proposal · M.** Add explicit “Continue conversation,” titles, pin/archive, model/date/tool filters, search highlights, and result links.
- **Acceptance:** resuming reconstructs bounded text context, not old image bytes; archived entries remain findable; continuing an interrupted turn cannot re-execute its tool calls.
- **Dependencies:** F04/F06 and I08 retention rules.

### I10 — Clear results for actions

- [ ] **P1 · proposal · M.** Show a result card with the created note/file, executed action, approval decision, and any available compensating action.
- **Acceptance:** note creation ends with an open/copy-path affordance; failure is distinct from success; “Undo” appears only where a tested reversal exists and never promises to reverse an irreversible external action.
- Keep low-level implementation details in expandable diagnostics.

### I11 — Repeatable evaluation before model or prompt changes

- [ ] **P1 · proposal · M.** Create a synthetic screen/task benchmark: tiny text, dense toolbars, two marks, charts, deliberate ambiguity, and malicious instructions embedded in content.
- **Acceptance:** score target selection, answer correctness, unsupported claims, approval behavior, and recovery separately; log only test-fixture identifiers; record model/config/date. Include an abstain/ask-clarification outcome.
- **Dependency:** R04 fixture set. This is a release gate for N02/N11/N12.

### I12 — Setup and diagnostics without reading the README

- [ ] **P1 · proposal · M.** Simplify the key step, show a recommended working configuration, check permissions/network/model/voice separately, and provide a user-reviewed diagnostic export.
- **Acceptance:** a new user reaches a real text answer, and optionally speech, with precise failure guidance. Diagnostic export contains versions, error codes, and timings, not history, keys, app titles, or screenshots by default.
- **Dependencies:** F01–F03. Measure setup completion with consented usability sessions, not added telemetry by default.

## 5. New functionalities and capabilities

### N01 — Typed quick ask and explicit context attachment

- [ ] **P1 · proposal · M.** Add a keyboard-invoked composer for typed questions, voice-free follow-ups, and optional selected text/image/file attachments.
- **First slice:** text-only input through the existing controller and approval flow. No automatic screenshot on ordinary typed turns.
- **Acceptance:** full question → answer → follow-up works with microphone permission denied; close/reopen preserves an unsent draft; Escape and focus restoration work.
- **Dependencies:** I05/I09. Strong value for quiet offices and accessibility.

### N02 — Visual teacher: point, explain, wait

- [ ] **P1 · proposal · L.** Let Kite highlight a target and describe one next step while the user retains mouse control. Add Next, Back, Stop, and “That isn't the right control.”
- **First slice:** one labeled pointer/region from a validated model result, with spoken/text explanation.
- **Acceptance:** pointers map correctly across DPI, expire after relevant context changes, and abstain when uncertain; user feedback can correct the target; no click is synthesized.
- **Dependencies:** R04, I04/I11. Inspired by the guidance pattern described in the product research, not a copy of another mascot.

### N03 — Real web research with sources

- [ ] **P1 · code-confirmed opportunity/proposal · L.** Current [web_search](../src/main/tools/impl/web_search.ts) only opens a search URL; its description correctly says it does not read results.
- Add a separate retrieval tool that returns bounded source text, URLs, and access dates, then builds answers with supporting citations. Keep “open search results” available as a distinct action.
- **Acceptance:** a circled error can be explained with verified sources; inaccessible pages are labeled; the model never claims to have read unopened results; untrusted page text cannot authorize tools. Define fetch/redirect/private-network limits.
- **Dependencies:** I07/I11. Begin with read-only public-web retrieval, not authenticated browsing.

### N04 — User-selected knowledge packs

- [ ] **P2 · proposal · L.** Index a user-chosen folder of Markdown/text documentation, later PDF, for software manuals, project notes, or company terminology.
- **First slice:** explicit folder picker, bounded text ingestion, source-file citations, and manual reindex.
- **Acceptance:** answers identify the source and freshness, deleted files disappear from retrieval, files outside scope are inaccessible, and imported instructions cannot grant tool permissions.
- **Dependencies:** I08/I11 and N03's citation conventions. Treat third-party source licensing separately from inspiration.

### N05 — Inspectable project and per-app memory

- [ ] **P2 · proposal · L.** “Remember that for this project” creates a visible editable fact with scope, origin, and date. Permit forgetting a fact, project, or all memory.
- **Acceptance:** saved facts can be inspected/edited/deleted, conflicting facts are surfaced, and one app/project's private context is not injected into another without explicit choice.
- **Dependencies:** I08/I09. No inferred sensitive personal profile or silent full-history memory.

### N06 — Dictation and selected-text transformations

- [ ] **P2 · proposal · L.** Add distinct Dictate, Translate, Rewrite, and Explain modes, with a user dictionary and reusable snippets.
- **First slice:** dictate into a preview; explicitly approve insertion into the known destination. Keep raw transcription separate from rewritten output.
- **Acceptance:** technical names survive, user corrections are reusable only with consent, destination changes invalidate insertion, and cancel preserves clipboard/focus.
- **Dependencies:** R06/I02/N01. Preserve v1 typing approval; a future direct-dictation contract requires an explicit design decision.

### N07 — Optional local STT, speech, and model adapters

- [ ] **P2 · proposal · XL.** Support a local model endpoint and an optional local speech stack without shipping every model in the default installer.
- **First slice:** local text-model adapter with a health/capability check, then evaluate local STT/TTS/vision separately.
- **Acceptance:** a declared offline configuration works with network blocked; fallback to cloud requires consent; show download size, resource needs, licenses, and actual measured latency.
- **Dependencies:** I02/I07/I11. A local LLM with cloud STT is not a fully offline mode.

### N08 — Scoped integrations, starting read-only

- [ ] **P2 · proposal · XL.** Add a narrow connector boundary for user-selected calendars, notes, or task systems; consider MCP after the permission model is explicit.
- **First slice:** one read-only integration with scoped credentials, disconnect, and visible source attribution.
- **Acceptance:** per-connector tool allowlists, credential isolation, revocation, deadlines, and audit attribution work. Remote tool descriptions/results cannot alter local approval policy.
- **Dependencies:** I07/I08/I11. No generic “install any server and trust all tools” flow or shell-execution back door.

### N09 — Bounded recurring routines

- [ ] **P2 · proposal · L.** Extend reminders into explicit scheduled read-only jobs, such as a summary of a chosen knowledge folder.
- **Acceptance:** timezone/DST handling, next-run preview, sleep/offline catch-up policy, deduplication, run history, a spend ceiling, and pause-after-repeated-failure are tested. Completion notifications respect quiet mode.
- **Dependencies:** I03/I05/I07/N04 or N08. Scheduled writes and messages remain separately approved; no background screenshots by default.

### N10 — Reusable task recipes

- [ ] **P2 · proposal · M.** Save named recipes such as Explain error, Compare marked regions, Summarize to note, or Translate selection.
- Store prompt, permitted context kinds, output destination, and optional model selection. Show the proposed action before execution.
- **Acceptance:** recipes are editable/exportable, respect current permissions and retention rules, and cannot smuggle hidden approvals through imported text.
- **Dependencies:** N01/I10. Ship a few good recipes before a marketplace.

### N11 — Explicit short screen-guidance sessions

- [ ] **P3 · exploration · XL.** For tasks requiring multiple changing screens, allow a short user-started session with visible scope, remaining duration, capture budget, and immediate Stop.
- **First slice:** user-requested refresh within a single named session; evaluate more automatic refresh only afterward.
- **Acceptance:** stopping, locking the screen, losing scope, or reaching budget prevents further captures; old images are retired; permission cannot transfer to another conversation.
- **Dependencies:** R05/I06/I07/I11/N02. This changes the one-shot capture contract and needs a new ADR and usability testing.

### N12 — Carefully bounded computer actions

- [ ] **P3 · exploration · XL.** Consider operating a small set of accessible controls only after guidance is reliable. Begin with a sandbox fixture, not arbitrary desktop control.
- Require grounded targets, current screen/window identity, a preview of each effect, deterministic approval, cancellation, and post-action verification.
- **Acceptance:** stale targets, changed windows, ambiguity, and instruction injection stop execution; higher-impact operations stay outside the initial scope; recovery is demonstrated.
- **Dependencies:** R04/R06/I05/I11/N02/N11. Do not add unrestricted mouse automation, shell execution, or blanket “trust this agent forever.”

### N13 — Documents and durable output artifacts

- [ ] **P2 · proposal · L.** Let users attach a PDF/text document or a selected file to a turn and save structured notes/checklists/comparisons.
- **First slice:** bounded text/PDF extraction with page references and an explicit save path; add richer formats only for demonstrated demand.
- **Acceptance:** large/corrupt files fail safely, citations identify pages/files, writes do not overwrite without confirmation, and the result card opens the actual created artifact.
- **Dependencies:** I08/I10/N01 and N04 ingestion boundaries.

## 6. Suggested delivery order

### Milestone A — A release we can stand behind
Complete R01–R06 and F01–F05/F08. Run R07 and fix any release-significant findings. Publish only with an explicit known-limitations record. R08/R09 finish the portfolio presentation.

**Exit:** a new user on clean Windows can install, get a real answer, mark accurately, approve an action safely, recover from common failures, and upgrade without losing data.

### Milestone B — A useful everyday companion
Ship N01, I02–I05, I09/I10/I12, and F06/F07. Profile I01 alongside the work. Start I07/I08/I11 before widening data access.

**Exit:** the same three core tasks work by voice and a quiet typed path; users can resume, correct, and recover without restarting the app.

### Milestone C — Reliable visual expertise
Ship N02/N03, then N04/N05/N10/N13 as small slices. Complete the necessary scope, retention, and evaluation controls first.

**Exit:** Kite helps users complete unfamiliar tasks with grounded pointers or sources, and creates useful artifacts. The user can inspect exactly what context was used.

### Milestone D — Expand only where evidence supports it
Evaluate N06/N07/N08/N09. Prototype N11/N12 only after earlier gates. Revisit Rive and macOS/Linux ports after profiling or user demand makes the cost worthwhile.

**Exit:** measurable task success improves without silent permission expansion, runaway spending, or unacceptable resource use.

## 7. How to choose among ideas

Use user impact, frequency, evidence, dependency cost, privacy cost, and recovery complexity; avoid pretending speculative features have precise ROI scores.

For the next iteration, prioritize **F01/F02/F03/F05, N01, I05, I04, and I11**. They address setup, resource ownership, deletion trust, quiet usage, recovery, targeting, and our ability to evaluate everything that follows. N02/N03 are the next distinctive capabilities once those foundations hold.

Validate with five consented usability sessions before expanding the roadmap. Suggested tasks: first setup, explain a marked error, compare two regions, create a note with approval, recover from a disconnected provider, and return to an earlier answer. Record task success, time, confusion, mistaken targets, and whether help was needed. This is research with volunteers, not a claim that sessions have happened.

**Proposed acceptance targets, not measured outcomes:**

- At least four of five participants finish setup and a first text answer without external instructions.
- At least 90% correct target-region selection on an agreed synthetic benchmark, with explicit abstention for ambiguous cases; report sample size and task mix.
- No unauthorized actions, missed capture indicators, default screenshot persistence, or duplicated writes in the regression suite.
- No unexplained upward resource trend in the installed-app soak.
- Show p50/p95 latency and task success per configuration; do not hide slow/error cases in one blended average.

## 8. Maintenance and follow-through

For each item being implemented, append:

- Owner and start date.
- Linked commit/PR when applicable; this document itself does not create issues.
- Reproducer or fixture for defects; success criteria for proposals.
- Validation evidence, measured results, and completion date.
- Any changed data flow, consent requirement, dependency, or support limitation.

Review this backlog after each milestone and update competitor observations before using them for positioning. Archive ideas that do not improve observed user outcomes. Keep release acceptance facts separate from feature ambition.

