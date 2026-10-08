# Kite background agents: product and implementation plan

**Date:** 8 October 2026  
**Repository baseline:** `691d0b2`, branch `master`  
**Status:** proposal; no runtime functionality implemented by this document.

## 1. Recommended direction

Build an **Agents panel backed by a durable local execution service**. Users can create reusable agents in plain language, start one-off runs, attach files, connect accounts, review results, and eventually schedule recurring work. Kite's voice companion becomes the entry point for delegation: “Kite, compress these PDFs” starts a run and returns control immediately.

Use a hybrid execution model, in this order:

1. **Typed local tools** for conversion, compression, extraction, and file operations.
2. **Connectors and service APIs** for mail, calendar, and other authenticated services.
3. **An agent-owned browser** for research and web forms that have no useful API.
4. **Existing Windows UI Automation** for desktop apps, with explicit takeover and foreground coordination.

Put one common runtime, permission broker, artifact store, and panel around these executors. Use deterministic workflows for repeatable tasks and bounded model planning for ambiguous tasks. A PDF converter should execute a known conversion pipeline; a job-search agent may need to choose sources and adapt to forms.

The largest missing piece is **durable ownership of work**, rather than another model or a new chat window. A run needs its own identity, state, inputs, approvals, budgets, and outputs, independent of a voice interaction or renderer lifetime.

### What “background” promises

- **Panel closed, Kite running:** file, connector, and isolated-browser work continues.
- **User working in another app:** those executors continue without taking the keyboard or mouse. Desktop automation may need a supervised turn.
- **Kite quit or PC asleep:** local execution stops. Persist the run and recover safely next time; do not promise work continues.
- **Laptop closed or PC offline:** continuous execution requires a separate always-on host or cloud service. Add that later as an explicit option.

A new Electron window or a hidden browser tab does not, by itself, provide background execution or security isolation.

## 2. What Kite already has

These findings come from source inspection, rather than treating roadmap statements as proof of shipped behavior.

- **Desktop executor:** [`TaskService`](../src/main/agent/service.ts) owns one `TaskSession` and one action sidecar. `start()` disposes the previous session. This cannot become concurrent agents simply by rendering multiple task cards.
- **Adaptive task loop:** [`TaskSession`](../src/main/agent/session.ts) observes accessibility controls, asks for one action, validates it, checks permissions, and acts. Ordinary tasks have a small step budget; planned browser errands have expanded phase budgets in [`job.ts`](../src/shared/job.ts). Here, “job” currently means a browser errand, not specifically a job application.
- **Desktop interference protection:** `TaskService.mouse/key` and `TaskSession.userTookOver()` pause active work on user input. Some UI Automation patterns can operate without moving the pointer, but keyboard operations bring the target window forward. A new tab in the user's browser does not guarantee uninterrupted parallel work.
- **Model selection:** the existing jobs-model setting and provider adapters are reusable. Keep the foreground voice model separate from an agent's planning model.
- **Permissions:** [`permissions.ts`](../src/shared/permissions.ts) already classifies actions into look, fill, add, saved, submit, send, money, delete, and system. It has Allow/Ask/Never, per-place rules, Hands-off, and floors for commands and secrets. Extend these rules instead of creating a competing permission system. The current permission code is more nuanced than the README's broad “always ask” description.
- **Voice tool machinery:** [`runAgentLoop`](../src/main/ai/agentLoop.ts) has voice-specific limits, streamed responses, and turn completion. [`ApprovalBroker`](../src/main/tools/approval.ts) holds one pending approval in memory, with a default 30-second timeout. Neither is a durable multi-run execution service.
- **Serialized tools:** [`registry.ts`](../src/main/tools/registry.ts) has a module-level execution queue to protect interrupted clipboard actions. Preserve that protection for shared resources; placing every background operation behind the same queue would unnecessarily serialize unrelated work.
- **Persistence and memory:** [`database.ts`](../src/main/storage/database.ts) has SQLite WAL, migrations, history, audits, reminders, memory, and boards. It has no dedicated reusable-agent/run/event/checkpoint schema. Existing encrypted secrets and masked memory are useful building blocks.
- **Window and IPC:** [`settings.ts`](../src/main/window/settings.ts) and [`index.tsx`](../src/renderer/index.tsx) provide a separate window with Settings, History, and Memory. [`trust.ts`](../src/main/ipc/trust.ts) checks the exact sender and main frame. Add Agents to this desktop window first; retain the overlay for brief status and questions.
- **Composition:** [`voice/service.ts`](../src/main/voice/service.ts) currently constructs `TaskService`, connects it to voice context, and owns shutdown. Extract background service ownership into app-level composition so agent work is not owned by a voice turn.

The existing system is a useful **desktop executor**, not yet a general background agent platform. Reuse its validated actions, permissions, memory, and provider integration while changing run ownership.

## 3. Research: how similar products approach this

### HeyClicky: reusable helpers with a persistent management surface

HeyClicky's official changelog documents named Clickys, routines, connected accounts, follow-ups on completed agent cards, output-file previews, and one browser window per task. Its 2 October update also discusses approval continuity across helper-agent handoffs. These are strong product references for an Agents panel with reusable definitions, run history, and visible outputs. [Source: HeyClicky changelog](https://www.heyclicky.com/changelog).

Its public repository says development after 27 April 2026 is private. The old open-source companion is therefore insufficient evidence of the current agent runtime. “Agents can do almost everything” is a product impression, not a verified compatibility guarantee. We can adopt the documented interaction pattern without claiming to know its execution architecture. [Source: public Clicky repository](https://github.com/farzaa/clicky).

**Apply to Kite:** named reusable agents, a panel, per-agent follow-ups, outputs, schedules, and account identity. Keep the cursor companion lightweight.

### Claude Cowork: task sessions, tools, and execution location

The current help page describes file access, connectors, browser actions, progress, steering, and parallel sub-agents. It also documents cloud sessions, with cloud availability in beta on Team and Enterprise, while local files, browser, and computer access still require the desktop app open and connected. This is a useful distinction: an always-on session does not make an offline laptop's resources available. Availability is evolving; this reflects the page checked on the plan date. [Source: Claude Cowork guide](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork).

**Apply to Kite:** task-centric sessions, explicit resource access, progress and steering; model local/cloud availability separately. Do not use older descriptions of Cowork's VM as proof of its current whole architecture.

### Manus: isolated browser versus the user's authenticated browser

Manus documents both a cloud browser and Browser Operator in a user's local browser. Browser Operator requests session authorization, uses a dedicated task tab/group, logs actions, and supports intervention. This exposes the main browser tradeoff: isolation and portability versus existing logins, extensions, and private-network access. [Source: Manus Browser Operator](https://manus.im/en/blog/manus-browser-operator).

**Apply to Kite:** start with an agent-owned browser; consider a browser extension later for accounts that genuinely require the user's browser. Make account and environment selection visible.

### Microsoft UFO and Windows agent workspaces: separate planning from app execution

The UFO2 research paper describes a HostAgent coordinating app-specific agents through a combined GUI/API action layer. This supports a routing approach that uses the most reliable interface available, rather than screenshots and clicks for every task. [Source: UFO2 paper](https://arxiv.org/abs/2504.14603).

Microsoft also documents experimental agent accounts and contained workspaces with their own desktop, permissions, monitoring, and takeover. Those are substantially stronger isolation mechanisms than a second window. They are not an MVP dependency for Kite: availability and access need verification on target Windows installations. [Source: Windows agentic security](https://learn.microsoft.com/en-us/windows/security/book/operating-system-agentic-security).

**Apply to Kite:** executor adapters now; separate desktop/VM execution later if real desktop parallelism becomes essential.

### Framework lesson: model loops and durable workflows solve different problems

The AI SDK offers model/tool loops and explicit workflow patterns; LangGraph documents checkpoint persistence and human interrupts. A tool loop chooses actions. A durable runtime owns recovery, parked approvals, retries, and state over time. Framework adoption does not automatically make external side effects safe to repeat. [Sources: AI SDK agents](https://ai-sdk.dev/docs/agents/overview), [LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence), [LangGraph interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts).

**Apply to Kite:** retain AI SDK provider integration and implement explicit persisted run boundaries. Reconsider LangGraph if branching and orchestration outgrow a small runtime.

## 4. Approaches considered and decision

### A. Expand the existing UI Automation loop

Fastest way to increase desktop coverage and reuse current code. However, it remains tied to app accessibility, user input, keyboard focus, and a single desktop. PDF conversion through Word menus is slower and less predictable than a file converter. Email through a GUI is more fragile than a mail API.

**Decision:** retain as the desktop adapter; do not make it the universal engine.

### B. Give every agent a general coding harness or shell

A coding harness can write scripts, install tools, manipulate files, and orchestrate many tasks. It offers broad capability, but adds environment provisioning, provider/account coupling, arbitrary-code execution, dependency failures, and a much larger trust boundary. Launching a CLI in a child process is process separation, not a sandbox.

**Decision:** defer unrestricted coding agents. A future advanced “Build a tool” mode belongs in a constrained VM/container with controlled exports. Ordinary custom agents should configure capabilities, not gain arbitrary Node or shell execution.

### C. Deterministic workflows with typed tools

Best for conversion, compression, attachments, extraction, and repeatable mail processing. Easy to verify, inexpensive, and compatible with background execution. Purely fixed workflows are less flexible for research and unfamiliar websites.

**Decision:** the foundation. Let a model select and parameterize registered tools, while known tasks use code-defined workflows.

### D. Cloud-first agents and remote browser/desktop

Can keep working when the PC is off and simplify centrally managed environments. Adds a backend, authentication, billing, credentials, uploads, retention, operations, and remote/local handoff. Local apps and private-network resources still need a live bridge.

**Decision:** defer. Kite currently uses local persistence and direct BYOK provider requests; a backend should be a separate product decision.

### E. Hybrid local runtime with optional remote executors

Combines reliable tools, adaptable planning, connectors, browser isolation, and desktop fallback. Requires thoughtful orchestration, but fits Kite's current Electron/TypeScript/SQLite architecture and the requested range of tasks.

**Selected:** E, built on C. Add optional remote execution behind the same executor contracts later.

## 5. Agent panel and user experience

### Two different objects

- **Agent:** a reusable definition, such as “Document Helper,” “Inbox Briefing,” or “Career Scout.” It has instructions, approved capabilities, account/resource scopes, model choice, and default budgets.
- **Run:** one execution, such as “Compress report.pdf below 2 MB.” It has a frozen definition revision, inputs, state, events, approvals, and artifacts.

An agent can have many runs. A one-off request can create a run from a built-in template without first making the user save a named agent. “Save as agent” makes it reusable afterward.

### Panel layout

Use the existing Kite desktop window with a top-level **Agents** entry. Open it from the tray, the cursor companion, a completion notice, or “show my agents.” A dedicated pop-out window can come later if usage demands it; the runtime must be independent of either window.

The main view has three regions:

1. **Navigation:** Active, Needs you, Completed, My agents, and Connections. Show counts for active runs and unanswered requests.
2. **Run list:** title, agent name, current step, execution location, elapsed time, and status. Example: “Document Helper · Compressing 3 of 8 files · On this PC.”
3. **Selected run:** goal, compact plan, timestamped action/result timeline, outputs, and a follow-up composer. Tabs or collapsible sections expose Files, Access, and detailed activity.

Make **Needs you** prominent. Approval cards name the account, destination, exact action, and data being sent. A job application card shows the company, role, resume version, answers, and final submission action. A mail card shows sender account, recipients, subject, and attachment preview.

Show meaningful progress: “Converted 4 of 7 documents,” “Waiting for sign-in,” or “Checking the saved PDF.” Avoid fabricated percentages for an open-ended research task. Activity shows actions, results, and brief decision summaries; it does not expose hidden chain-of-thought.

### Creating a custom agent

Start with “What should this agent help you with?” Provide templates and plain-language editing. Required configuration:

- Name and instructions.
- Capabilities: Files, Web research, Browser forms, Email, Desktop apps.
- Selected folders/files, connected account, allowed sites, and output location.
- Permission profile inherited from Kite, with agent-specific restrictions.
- Model override and default run limits under Advanced.
- Manual trigger initially; recurring schedule added later.

Kite can draft a structured definition from natural language. The user reviews access and saves it. Editing instructions cannot silently grant new capabilities. Installing a new executor or plugin is separate from creating an agent.

### Starting and steering work

1. User speaks, types, drops files, or starts a saved agent.
2. Kite resolves inputs, chooses a known workflow or bounded planner, and checks granted access.
3. Within existing authorization, persist and enqueue immediately. Ask only for missing scope, unresolved choices, or actions that require approval.
4. Voice replies briefly: “I’m converting those files. You can keep working.”
5. The panel tracks progress; the overlay shows a small active-run badge.
6. Completion provides verified outputs and a concise result. Notify for completion, failure, or needed input; recurring runs stay quiet when nothing actionable changed.

Follow-ups target a specific agent/run ID. “Make it smaller” on a finished PDF run creates a new child run referencing that output; it does not mutate the historical run. Changes during execution are saved as steering events and applied at the next safe boundary. Changes to destination, account, or submission content invalidate affected approval requests.

**Pause** prevents new steps and parks at a safe boundary. **Cancel** fences late callbacks, stops further actions, and attempts to terminate owned processes; it cannot undo a sent email. **Retry** creates a new linked run and reuses validated safe checkpoints. **Take over** yields the browser or desktop and invalidates stale observations. “Stop all agents” is a separate global control.

## 6. Runtime architecture

```mermaid
flowchart TD
  Voice[Voice or text delegation] --> Runtime[BackgroundRunService]
  Panel[Agents panel] <-->|Typed IPC and event replay| Runtime
  Runtime <--> Store[(SQLite definitions, runs, events, operations)]
  Runtime --> Planner[Bounded planner through existing AI SDK adapters]
  Runtime --> Policy[Capability, scope, permission and budget broker]
  Policy --> File[Trusted file workers and converter processes]
  Policy --> API[Mail and service connectors]
  Policy --> Browser[Agent-owned browser executor]
  Policy --> Desktop[Existing TaskService behind a desktop lease]
  File --> Artifacts[Validated artifacts and run workspace]
  API --> Artifacts
  Browser --> Artifacts
  Desktop --> Artifacts
  Runtime --> Notices[Tray, overlay and completion notifications]
```

### Ownership and process boundaries

- **Main:** owns SQLite writes, credentials, policy decisions, operation authorization, resource leases, and lifecycle. Keep work here lightweight; execute expensive parsing/conversion elsewhere.
- **Planner worker:** optional trusted `utilityProcess` for model-context assembly and planning. Use a minimal environment and broker model calls through main so provider credentials remain there. Simpler initial planners can make asynchronous model calls in main if measurements justify it.
- **File workers:** bounded trusted code and allowlisted converter executables. Run with fixed argument arrays, no shell interpolation, a run-specific workspace, timeouts, and process-tree cancellation.
- **Browser process:** agent-owned browser with isolated contexts/profiles and a narrow control bridge. Website content gets no Kite preload bridge.
- **Renderer:** renders snapshots/events and sends validated commands. It owns no execution state or secrets.

Electron `utilityProcess` supplies a Node child process and message ports. It is useful for failure and responsiveness isolation, but **is not a security sandbox for malicious code**. A trusted worker can still access the user's filesystem. Keep the initial worker code first-party and fixed; enforce resource access in the broker. Arbitrary plugins or generated scripts require an OS-enforced boundary before release. [Sources: Electron utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process), [Electron security](https://www.electronjs.org/docs/latest/tutorial/security).

### Execution strategies

Each run uses either:

- **Workflow:** a versioned code-defined sequence, such as inspect → convert → validate → publish.
- **Planned:** observe → propose typed next step → authorize → execute → verify → checkpoint; repeat within limits.

Expose only the tools granted to that run. Prefer existing `streamText`/structured calls with explicit step control. Do not expand the voice loop's four-call budget to accommodate long runs. AI SDK's higher-level loop is an option, but API compatibility must be checked against Kite's pinned package before adoption. Keep durability outside the model loop.

Use one coordinator per run initially. A “Document Helper” can batch conversions without model-driven sub-agents. Later, allow bounded child runs for independent research, with inherited or narrower capabilities, a shared parent budget, and aggregated results. Children cannot expand scope or independently bypass a parent's approvals.

### Resource-aware concurrency

Initial engineering defaults, to be tuned by measurement:

- Two active background runs; one CPU-heavy conversion worker.
- One browser mutation run per account/profile. Independent anonymous read-only contexts can run separately within global limits.
- One desktop lease across agents, guides, clipboard/focus actions, and other operations touching the user's desktop.
- Per-output-path locks; account mutation locks; provider request/token rate limits.
- Foreground voice gets priority over agent model work at the next safe boundary.

Do not wrap every tool in one global execution queue. Lock the actual shared resource. Input in the user's normal apps must not pause file/API/browser runs. Preserve takeover detection for the desktop executor, and detect interaction with the agent browser itself when yielding that context.

The old `TaskService` must reject or queue a second request while leased; its current “replace the previous task” behavior is unsuitable for unrelated runs. Background starts must also stop calling its `starting` callback that closes boards/guides unless acquiring a desktop lease actually requires that handoff.

## 7. Persistence, recovery, and side effects

### Proposed records

Extend the existing database with versioned migrations:

- `agent_definitions`: ID, name, current revision, enabled/archived state.
- `agent_revisions`: immutable instructions, capability references, resource scopes, workflow version, model selection, and default budgets.
- `agent_runs`: UUID, definition revision or one-off snapshot, goal, status, execution location, origin message, parent/retry ID, checkpoint, counters, timestamps, attempt generation, and lease expiry.
- `agent_events`: ordered per-run sequence, event type, timestamp, and validated payload. Unique `(run_id, sequence)`.
- `agent_operations`: step/operation ID, tool name/version, validated argument hash, resource identity, attempt, status, result reference, and recovery classification.
- `agent_requests`: approval or question, bound operation, payload hash, revision, account/destination, expiry, and resolution.
- `agent_artifacts`: run ID, generated/attached provenance, workspace-relative path, media type, size, hash, validation status, and retention metadata.
- Later, `agent_schedules`: trigger, timezone, next occurrence, missed-run policy, and enabled state.

Keep connector metadata in a connection store and credentials in encrypted secret storage. Runs reference connection IDs; they do not contain OAuth refresh tokens. Origin-message references should be nullable and should not cascade-delete active runs when chat history is cleared. Define explicit deletion behavior in the panel.

### State machine

```mermaid
stateDiagram-v2
  [*] --> queued
  queued --> running: claim lease
  running --> waiting_user: approval, answer or login
  running --> paused: pause or safe suspension
  running --> verifying: outputs ready
  running --> recovering: worker exits or lease expires
  waiting_user --> queued: valid answer
  paused --> queued: resume
  recovering --> queued: safe checkpoint reconciled
  recovering --> waiting_user: uncertain external effect
  verifying --> succeeded: verifier passes
  verifying --> running: bounded repair
  verifying --> failed: verification exhausted
  running --> failed: failure or budget reached
  queued --> cancelled
  running --> cancelled
  waiting_user --> cancelled
  paused --> cancelled
  recovering --> cancelled
  succeeded --> [*]
  failed --> [*]
  cancelled --> [*]
```

Transitions, operation records, checkpoints, and associated events are committed together where applicable. A parked approval is a persisted `waiting_user` state, not a Promise keeping a worker alive. On startup, rehydrate pending questions and reconcile stale leases before resuming work.

Use a single writer in main. Claim runs transactionally. Every worker request/result carries `(runId, attemptGeneration, operationId)`; only the current lease holder can commit. Cancellation increments the generation and revokes future authorization. A late result can be recorded as diagnostic evidence but must not publish files, advance the run, or restart it.

### The operation boundary

1. Planner proposes a typed action or the workflow selects its next step.
2. Broker validates arguments, scope, resource identity, current permission, and budgets.
3. Persist an operation intent; if approval is required, persist the exact request and release the worker.
4. On approval/resume, revalidate arguments, resource versions, policy, and attempt generation.
5. Persist execution authorization and dispatch the identified operation.
6. Record the outcome, verify the result, and commit the next checkpoint/event.

Never claim universal exactly-once execution. A process can crash after a remote service accepts a submission but before Kite records its response.

- **Read:** retry with bounded backoff.
- **File conversion:** rerun into a fresh staging path; verify and publish once under a deterministic operation identity. If publication occurred before a crash, reconcile the file hash/manifest before writing again.
- **Remote mutation with service idempotency support:** reuse a stable idempotency key.
- **Mail send or form submit without such support:** inspect remote evidence if available. If the outcome is uncertain, mark it “Needs review” and do not automatically repeat it.

Approval must bind the actual recipients/form answers/attachments, not just a text summary. A new content hash, changed account, expired request, changed output file, or different submission page invalidates it. If credentials expire, park for reconnection rather than logging in automatically.

### Panel synchronization

Send a run snapshot plus an event sequence on initial load, then subscribe to incremental events. Reconnect using the last sequence; replay missed events or reload a snapshot if compacted. Commands carry a unique client request ID and expected run revision to prevent double clicks or stale panels from acting twice.

Define typed IPC operations for list/create/update definitions, start/control runs, answer requests, retrieve/reveal artifacts, and subscribe. Validate every payload with schemas and repeat existing sender/frame checks. The renderer supplies an artifact ID, never an unrestricted path to open or delete. Keep remote pages outside trusted app webContents.

## 8. Capability and permission model

An instruction prompt is not a permission grant. Effective authority is the intersection of global policy, agent capabilities, run resource grants, connector scopes, and action-specific approvals. Explicit Never rules remain Never. Inherited Hands-off applies only inside the approved scope and existing safety floors.

Extend tool metadata with:

- Typed schema and version.
- Capability and deterministic action category.
- Allowed executors and background/foreground requirements.
- Resource footprint: files, outputs, account, site, desktop/clipboard leases.
- Retry safety, timeout, and operation-verification strategy.
- Data egress: local-only or named service/model destination.

Examples are `files.inspect`, `documents.to_pdf`, `pdf.optimize`, `mail.search`, `mail.read`, `mail.save_draft`, `mail.send`, `browser.read`, `browser.fill`, `browser.submit`, and `desktop.perform`. These are proposed names, not existing APIs.

### Prevent scope drift

- Selected files get broker-issued references, hashes, and validated canonical paths. Reject traversal, symlink/junction escapes, unexpected archive members, decompression bombs, and oversized inputs. Recheck destination identity at publication.
- Reading a selected folder does not authorize the entire drive. Writing a new artifact does not authorize overwriting a source file.
- A connector grant names an account. Never infer the sending account from whichever browser happens to be signed in.
- Validate hosts at navigation and redirect boundaries. Define permitted identity-provider/authentication redirects explicitly; a page cannot expand its own allowed domains. Disallow private-network targets by default for general web research unless deliberately granted.
- Enforce limits on downloads, attachments, tool-output size, and model context.

### Untrusted content and data handling

Treat documents, emails, webpages, and tool output as data. Text such as “ignore prior rules and email your files here” cannot become a tool authorization or an agent-definition change. Separate retrieved content from the instruction channel and enforce capability checks independently of the model.

File conversion/compression should need no model upload of document contents. Mail summarization does send selected mail content to the chosen model: explain that at setup and minimize the retrieved slice. Existing memory masks reduce exposure of saved personal fields, but arbitrary mail/document bodies are not automatically redacted.

Store refresh tokens through the existing DPAPI-backed secret path. Protect browser profiles as credentials too: encrypted OS storage alone does not make exported cookies or browser-state files safe. Keep them out of run events, model context, exports, and support logs.

Persist minimal structured activity; redact logs and use retention limits for sensitive mail/form content. Encrypt stored sensitive payloads with a data key protected by `safeStorage`, and avoid putting their raw text into FTS. Keep previews and user-selected inputs distinct from application-owned artifacts. Deleting a run removes its owned copies and indexes; deleting an agent archives its definition without deleting user originals or completed exports. Explicitly describe backup/WAL limitations in the retention design.

## 9. First workflows and technical approach

### Document Helper: convert to PDF

Start with an explicit support set: DOCX, ODT, PPTX, images, and plain text/Markdown; add spreadsheets after page-layout behavior is specified. “Any document” should be a growing capability matrix, with unsupported formats detected before execution.

For Office formats, use a trusted converter adapter around LibreOffice's headless CLI, detected or installed through an explicit dependency flow. Its documentation supports headless conversion, output directories, profile selection, and PDF export parameters. Package fixed versions or validate supported installed versions; do not let the model download executables. [Sources: LibreOffice startup parameters](https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html), [PDF export parameters](https://help.libreoffice.org/latest/en-US/text/shared/guide/pdf_params.html).

Pipeline:

1. Inspect file signature, format, size, protection, and available engine.
2. Copy to a run workspace; process macros-disabled input using a dedicated converter profile.
3. Invoke an allowlisted executable with fixed arguments and a timeout. Begin with one conversion at a time.
4. Confirm a real, parseable PDF exists. Check page count, renderability, and expected text where applicable. Collect warnings for missing fonts and unsupported elements.
5. Publish a new artifact atomically; preserve the original.

Fonts, complex Office layouts, tracked changes, and spreadsheet print areas need representative fixtures and preview verification. A valid PDF does not establish exact visual fidelity. If the user requires Word's own rendering and the converter fails that bar, offer supervised native-app export as a separate desktop run.

### Document Helper: reduce file size

Dispatch by format and requested quality, rather than applying one compressor to everything.

- **PDF:** structural optimization first; optionally recompress/downsample images through a validated adapter with explicit quality settings.
- **DOCX/PPTX:** reduce supported embedded images in a copied ZIP package while preserving relationships and content. Skip unsupported embedded objects initially. ZIP recompression alone often gives little benefit.
- **Images:** resize/re-encode through a trusted image library with dimensions and quality controls.
- **Archives:** ordinary archive compression; do not label it equivalent to a smaller editable document.

qpdf documents structural recompression/object streams and image optimization. Its image-optimization option can be lossy and does not resample images, so it is not a universal “make any PDF under 2 MB” solution. Start with structural optimization and supported image cases; benchmark before selecting a separate downsampling engine. [Source: qpdf CLI](https://qpdf.readthedocs.io/en/stable/cli.html).

Ghostscript is an option for broader PDF processing, but its official distribution offers AGPL or commercial licensing. Review the chosen integration and distribution model before bundling it in Kite's MIT product; do not treat it as a license-free binary dependency. [Source: Ghostscript distribution/licensing](https://ghostscript.com/releases/gsdnld.html).

Report original size, output size, achieved reduction, method, and quality warning. Use a bounded search over quality settings. If the target cannot be met within the user's quality constraints, return the best acceptable result and explain the unmet target. Skip signed/protected files until the user chooses a supported transformation; changing a signed document can invalidate the signature. Verification includes rendering and document features, not just byte count. Treat actual ratios shown in UI mockups as illustrative until measured.

### Inbox Briefing: read and summarize mail

Begin with Gmail read/search using a direct connector. Add other providers behind the same account-aware interface after the first one is reliable. Do not drive the inbox GUI for the default mail workflow.

Use installed-app OAuth in the system browser with PKCE, state validation, and a short-lived loopback callback. Tokens stay in main. Google documents PKCE and loopback redirects for desktop apps. [Source: desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app).

Important dependency: Gmail's scopes have different access levels. `gmail.readonly` reads mail; metadata cannot read bodies. The compose scope covers both drafts and sending, so “draft-only” must also be enforced by Kite, not assumed from OAuth alone. Restricted scopes require verification, and server storage/transmission of restricted data introduces assessment requirements. Assess the exact architecture, including sending mail content to an external model, before public connector rollout; BYOK does not remove this question. [Source: Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes).

Workflow: select account and query/label/date window → retrieve a bounded set → summarize with links/message references → save briefing artifact. Then add draft creation; sending is a distinct typed operation controlled by the existing Send permission and exact content approval where required.

For local recurring summaries, use periodic synchronization while Kite runs, persisted cursors, deduplication, and rate limits. Gmail push uses Cloud Pub/Sub; Google's guide recommends polling synchronization for installed clients. Do not add a public webhook backend just to deliver the local MVP. [Source: Gmail notifications](https://developers.google.com/workspace/gmail/api/guides/push).

### Career Scout: discover, prepare, then apply

Separate three capabilities so users can grant the level they actually want:

1. **Discover:** read authorized job-alert mail and career pages; deduplicate company/role/listing IDs; match against user criteria; save a shortlist with source links.
2. **Prepare:** draft a tailored cover letter, select the approved resume, and fill supported forms. Extract factual claims from the user's profile; ask about work authorization, salary, relocation, eligibility, and unknown required answers.
3. **Submit:** show the actual company, role, URL, answers, account, and attachment hashes. Submit only under the configured permission and run scope; initial default requires review per application. Broader preauthorization can be a later explicit feature, bounded by sites, roles, count, and unchanged profile materials.

Use official application endpoints where supported; otherwise use the browser adapter. Start with one or two verified application flows and report coverage. Stop for CAPTCHA, sign-in, OTP, unexpected assessments, or blocked automation; provide takeover and resume from a fresh observation. Do not invent qualifications or solve identity challenges unattended.

Success requires confirmation-page evidence, a submission identifier, or a receipt matched to the application. Clicking Submit alone yields “Submission attempted,” not “Applied.” Keep application history and resume versions to avoid duplicates. Ambiguous submission outcomes must be reconciled before retry.

This is a later release than PDF conversion because site variation, uploads, accounts, factual accuracy, and irreversible submission all meet in one workflow.

### Additional common agents

The same runtime can support attachment downloading, PDF merge/split, OCR, extracting invoice fields, organizing copies of downloads, meeting preparation, converting image formats, calendar drafts, and structured web research. Each needs a registered capability and a verifier. “Custom” means users compose available abilities; it does not mean arbitrary apps become reliably supported immediately.

## 10. Browser execution decision

Recommend **Playwright with a dedicated Chromium installation/profile** as the first browser executor. Anonymous runs use isolated contexts. Authenticated runs use a dedicated agent account/profile after the user signs in there; mutations on the same account are serialized. The agent keeps its work separate from the user's normal browser.

Playwright documents isolated browser contexts and persistent profiles, and warns against automating the default Chrome user profile. Do not attach to the user's normal Chrome directory or quietly copy cookies into a new profile. Authentication state contains sensitive credentials. [Sources: browser isolation](https://playwright.dev/docs/browser-contexts), [BrowserType/profile guidance](https://playwright.dev/docs/api/class-browsertype), [authentication state](https://playwright.dev/docs/auth).

Provide “View browser” and “Take over.” A visible agent window can be opened for login and supervision without moving the OS pointer for normal automation. Headless mode may work for public research, but authenticated/interactive sites need a tested headed path. Packaging, browser updates, and visibility switching require an early spike; do not assume a live headless process can simply become headed without state transfer.

Alternatives:

- **Electron WebContentsView:** smaller incremental browser footprint and easier embedded preview. More custom automation/security work; remote webContents must have no trusted Kite preload, Node integration, or app IPC authorization. Reconsider after measuring Playwright packaging costs.
- **Browser extension:** best route to an existing authenticated browser context. Adds extension installation, explicit host grants, account/tab routing, and a secure native bridge. Add later for sites that justify the integration.
- **UI Automation in Edge:** reuse immediately for supervised flows, but it inherits desktop focus and accessibility limitations.
- **Remote browser:** useful for work continuing when the PC is off; requires cloud consent, credentials, storage, and billing.

Regardless of driver, browser form submission must pass the same operation/permission broker. Do not rely on an LLM to label an arbitrary click as safe: uncertain page actions use conservative classification or supported site adapters. Validate uploads and navigation with fresh page state immediately before execution.

## 11. Scheduling, costs, and lifecycle

Add scheduling after manual runs and recovery work reliably. Save the schedule, agent revision policy, timezone, next occurrence, input query, and limits. For an 8:00 AM routine in India, store `Asia/Kolkata` and derive UTC execution times; do not assume a fixed local offset for every timezone.

Default to at most one outstanding run per schedule. After sleep, coalesce missed briefings into one current run rather than replaying every missed occurrence. Use a unique `(schedule_id, occurrence)` key to prevent duplicate dispatch. Persist “nothing new” cursors so unchanged mail does not trigger repeated model calls or notifications.

Split controls clearly:

- **Hide companion:** visual only; agent runs continue.
- **Pause Kite:** preserves the current meaning of pausing active work and pauses background dispatch too. If the product later offers separate voice-only pause, name it explicitly.
- **Close Agents panel:** does not stop runs.
- **Quit:** stops execution, checkpoints where possible, and leaves recoverable work visible next launch.
- **Lock/suspend:** revoke desktop lease; park interactive browser/login steps. Safe local/API work on a locked-but-awake PC can continue only under its configured policy. Suspension stops execution.
- **Update:** quiesce at safe boundaries, reconcile in-flight mutations, then restart. Never kill a known submission midway without recording uncertain outcome.

Give every run wall-clock, step, token, and output-byte budgets. Meter model usage, tool runtime, retry counts, and browser lifetime. Treat cost displays as estimates when prices are unavailable; never invent a cost. Workflows such as conversion need zero planning-model calls once dispatched.

Retries use bounded exponential backoff with jitter and service retry hints. Authentication errors need user action; malformed input is a permanent failure; repeated model/tool failure ends the run with saved partial outputs. Release idle browser contexts, workers, and model buffers; preserve only checkpoints and necessary context summaries.

## 12. Implementation map

Suggested new modules, deliberately separate from the existing desktop `agent/` directory:

```text
src/shared/background.ts                  Definition, run, event and request schemas
src/main/background/service.ts            App-owned run lifecycle and control
src/main/background/store.ts              Run migrations and transactional records
src/main/background/scheduler.ts          Queue, leases, limits; schedules later
src/main/background/runner.ts             Workflow/planned step boundaries
src/main/background/operations.ts         Authorization, journals and reconciliation
src/main/background/capabilities.ts       Tool metadata and resource grants
src/main/background/resources.ts          Desktop/account/path/provider leases
src/main/background/artifacts.ts          Staging, verification, publication, retention
src/main/background/executors/files.ts    Trusted file/converter adapter
src/main/background/executors/browser.ts  Agent-owned browser adapter
src/main/background/executors/desktop.ts  TaskService adapter and takeover
src/main/background/workflows/            Code-defined workflows and verifiers
src/main/connectors/                      OAuth/account abstractions and Gmail adapter
src/main/ipc/background.ts                Validated panel/overlay commands and events
src/main/tools/impl/start_background.ts   Short voice/text delegation tool
src/renderer/agents/                      Agent list, editor, run details and requests
```

Reuse rather than copy:

- Provider adapters and jobs-model fallback from `src/main/ai` and shared model selection.
- Encrypted keys/memory from `src/main/settings` and `src/main/memory`.
- Action classification and policy from `src/shared/permissions.ts`.
- SQLite opening/migration conventions from `src/main/storage/database.ts`.
- Renderer styling, window sizing, tray entry points, and IPC trust checks.
- Existing `TaskService` and sidecar action validation for desktop execution.

Required integration edits:

- Add `agents` to shared `View`, renderer window detection, desktop navigation, preload, and `view:open` allowlist. If a later separate panel window is added, register its exact webContents in the trust model.
- Create the background service at app lifetime, not in an individual interaction. Wire shutdown, suspend/resume, pause, and updater behavior.
- Make `start_background` persist/enqueue before acknowledging acceptance. It should return a run ID and status, not claim completion.
- Route supported file/mail/research requests to background runs; retain `do_task` for immediate desktop operations. Avoid starting both for the same request.
- Keep original desktop budget and approval contracts intact; wrap them with the shared lease and run event adapter.
- Add nullable run references to audits or create run-specific audit records. Do not overload unrelated voice-message identifiers.

## 13. Phased rollout and acceptance gates

Effort labels are relative engineering scope, not calendar commitments: M spans several components; L adds a subsystem. Discovery and browser/connector spikes can change these estimates.

### Implementation status — 9 October 2026

Phase 1 now has an app-owned runtime, encrypted durable storage, agent revisions, one-off runs, persisted input/approval requests, verified artifacts, panel controls, trusted IPC, and foreground delegation. The first supported workflow is UTF-8 text / Markdown **source** to PDF using existing Electron Chromium, with no added runtime packages. Saved custom helpers select a name, brief, and PDF layout; arbitrary briefs are not model-executed in this phase. See the [operating guide](background-agents.md) and [ADR 022](adr/022-background-agents.md).

The packaged phase 0 spike measures this converter and an Electron isolated persistent browser session with a synthetic login fixture. It is evidence for the Electron alternative, not a final replacement for the Playwright recommendation in section 10. Office fidelity, real-account manual login, a Playwright packaging comparison, identical-baseline installer impact, and live voice responsiveness under conversion load remain phase 0 gates. No Office, mail, compression, application-submission, or browser-automation capability is advertised as available. [Raw probe results](performance/background/phase0.json).

Runtime acceptance is exercised with real SQLite/Chromium and controlled callbacks: concurrent runs, foreground cancellation independence after handoff, durable requests after restart, cancellation fencing, publication recovery without duplicate output, and failure isolation. The bundled panel test verifies close/reopen, answering a restored question, completion with the panel closed, export, and saved helpers. This does not establish live provider/desktop interaction performance.

Phase 2 now extends the runtime with text/image conversion, lossless structural optimization of plain PDFs, per-file targets and no-growth reporting, batch inputs, in-app preview/reveal, binary dependency health and versioned reusable helpers. Uploaded binary snapshots are encrypted separately in schema v2. Packaged worker tests and independent parse/render comparisons cover the supported synthetic corpus, source preservation and recovery. Office conversion, image downsampling and broad PDF compatibility remain gated. See [ADR 023](adr/023-document-workers.md), [phase 2 results](performance/background/phase2.json) and [fidelity results](performance/background/phase2-fidelity.json). The earlier status and phase 0 results describe the phase 1 baseline; phase 2 adds runtime dependencies.

### Phase 0 — capability and packaging spikes (M)

Confirm converter engine/distribution, supported input fixtures, browser footprint, model-call usage reporting, and workflow recovery contracts. Write the ADR for local execution and side-effect recovery.

**Exit:** packaged Windows spike converts representative documents without touching the active desktop; records outputs/engine versions; browser spike opens a separate profile and supports manual login; dependency/license decisions recorded. Measure startup, memory, responsiveness, conversion time, and installer impact.

### Phase 1 — durable runtime and Agents panel (L)

Build agent definitions/revisions, one-off runs, event store, durable questions, artifacts, IPC, panel, and cancellation. Implement one deterministic file workflow through the real runtime. Saved custom agents can use the capabilities available in this phase.

**Exit:** two independent runs coexist; closing/reopening the panel preserves progress; a foreground voice interaction does not cancel a run; recovery reconstructs a pending request; stale callbacks cannot publish after cancellation; one run failure leaves the other usable.

### Phase 2 — useful document release (M–L)

Ship PDF conversion, supported PDF optimization, output preview/reveal, batch inputs, dependency health, and reusable Document Helper. Add image/Office package compression only for fixtures that meet quality gates.

**Exit:** all supported fixtures produce parseable/renderable outputs with documented fidelity tolerances; unsupported/protected files fail clearly; originals remain byte-identical; size targets are measured and unmet targets reported; staged output recovers without duplicate exports after a crash.

This is the first public background-agent release. It demonstrates useful work while the user keeps working and establishes the platform before irreversible workflows.

### Phase 3 — mail connector and Inbox Briefing (L)

Ship account-aware OAuth, read/search, bounded summaries, attachment outputs, revocation/reconnect, and provider-policy prerequisites. Add drafts next; sending only after mutation recovery and approval verification pass.

**Exit:** results identify the selected account and source messages; refresh tokens remain out of renderer/events/logs; revoked access parks the run; cross-account writes are rejected; an uncertain send is never retried automatically.

### Phase 4 — browser and Career Scout (L)

Ship isolated browser execution, takeover, job-alert discovery, shortlist artifacts, approved resume inputs, and one or two supported application flows. Start with preparation and per-application review.

**Exit:** the user can type in another app throughout browser preparation; changed page/answers invalidate approval; login/CAPTCHA handoff resumes from fresh state; application completion has evidence; crash-after-submit does not trigger a duplicate application.

### Phase 5 — schedules and bounded delegation (M–L)

Add recurring agents, missed-run coalescing, quiet unchanged runs, budgets shared across children, and richer agent history. Add child agents only for workflows whose measured parallelism improves completion time or quality.

**Exit:** schedule dispatch is deduplicated across restart/sleep; permissions survive without widening; aggregate limits constrain parent and children; no repeated notifications for unchanged state.

### Phase 6 — optional always-on execution (separate product scope)

Add a cloud/second-device host only when users need work to continue while the PC is off. Introduce remote identity, encrypted credential management, consented uploads, data deletion, quotas/billing, and an online-only local bridge. Keep local-only runs available.

## 14. Verification and open decisions

### Tests that matter when implementing

- **Crash injection:** before/after operation authorization, file publication, mail send, and form submit. Verify safe replay versus uncertain-outcome handling.
- **Concurrency:** two conversions to the same destination, competing runs on one account, desktop lease contention, provider rate limits, and cancellation racing worker completion.
- **Durable approvals:** restart with pending requests, double-click response, stale panel revision, changed recipient/file hash/page, revoked scope, and expired credentials.
- **Untrusted inputs:** injected email/page/document instructions, path traversal, Windows junction escapes, archive bombs, hostile filenames, and remote page attempts to call app IPC.
- **Artifacts:** format/signature checks, corrupt outputs, missing fonts, multipage layouts, links/forms, large images, and protected/signed inputs. Compare visual fidelity where relevant.
- **Scheduling:** duplicate occurrences, sleep/wake, missed runs, timezone changes/DST, quota exhaustion, and no overlapping routine runs.
- **Packaged Windows:** worker/converter/browser paths, native SQLite ABI, process-tree termination, clean-machine dependency setup, and user-profile permissions.
- **Experience/performance:** type in another app during browser/file work; close the panel during a run; verify keyboard-accessible requests and output controls; measure foreground latency against Kite's own baseline.

Use mock mail/form services and local fixtures for automated mutation tests. Run existing lint, typecheck, and relevant task/permissions/memory tests after integration; add meaningful runtime recovery tests and supervised live checks for supported services. A planning-only document does not require running those application tests.

### Decisions to resolve before their release phase

1. Which Office formats and fidelity bar ship in the first document release?
2. Is LibreOffice detected as an optional installation, delivered as an optional managed dependency, or bundled? What is the measured installer/runtime impact?
3. Which PDF engine meets measured quality targets and distribution obligations?
4. Can the initial Gmail integration satisfy OAuth verification and external-model data requirements without a Kite backend?
5. Which authenticated browser flows need a dedicated profile versus a future extension?
6. Which application sites/flows are sufficiently stable for supported job submissions?
7. Do users actually need always-on cloud execution, or is local background work sufficient?

None blocks drafting the runtime/panel contracts. Dependency packaging blocks the document release; provider verification blocks public mail access; submission reliability blocks unattended application submission.

### Immediate next implementation task

Phases 1–2 provide end-to-end document runs and reusable helpers. The next implementation is **phase 3: a read-only mail connector and Inbox Briefing**, beginning with account-aware OAuth, encrypted tokens, bounded access and revocation. Keep drafts/sending gated until approval and uncertain-mutation recovery are implemented.

### Research and validation limits

Competitor behavior comes from the linked primary documentation checked on 8 October 2026; it is not a hands-on reliability benchmark. Architecture and roadmap choices are this proposal's engineering judgments. The repository baseline was inspected directly; no current graphify output was present. No paid accounts, mailboxes, job sites, or live submissions were accessed. The original research produced a plan only; subsequent phase 1–2 implementation and validation are recorded above.
