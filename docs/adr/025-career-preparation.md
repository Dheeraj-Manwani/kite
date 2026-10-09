# 025: Public job discovery and isolated application preparation

Accepted for phase 4 development implementation, 9 October 2026. Extends [ADR 022](022-background-agents.md) and [ADR 024](024-read-only-gmail.md).

## Decision

Use typed public Greenhouse/Lever GET adapters for discovery and the bundled Electron Chromium engine for per-application preparation. Keep discovery and application runs distinct. Discovery exposes explicit boards/literal criteria, saved helpers, bounded source cards and a journaled PDF. A completed Gmail briefing can supply direct supported board identities without another mailbox read. Arbitrary career URLs, search engines, tracking redirects and generated answers are outside this adapter.

The [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html) provides public listing GET endpoints; [Lever's Postings API](https://github.com/lever/postings-api) provides the other typed source. Construct canonical provider URLs from validated board/job identities rather than trusting provider HTML or supplied links. Use one bounded source page per board, visible limits and deterministic literal filtering. No model receives a resume or mail/page content.

For this first browser workflow, reuse packaged Chromium rather than introduce Playwright/browser distribution. The browser driver has typed load/observe/prepare/show/check/close operations, hardcoded standard-field maps, no caller JavaScript/selector/path API, and no global desktop input. Each run owns a separate ephemeral session with no privileged preload or Node integration. Explicit takeover shows/focuses it; hidden preparation does not. [Electron sessions](https://www.electronjs.org/docs/latest/api/session) provide separate cookie/cache state. Persistent authenticated profiles, extension bridges and broader browser drivers remain later alternatives.

## Approval and external effects

Application runs start only from stored shortlist identity. Native selection admits and freezes one supported PDF resume in encrypted storage, with explicit applicant values. Main captures URL/title/bounded visible text/fields/labels/options, hashes that snapshot and binds it with the role, applicant values and resume hash. Reobserve before execution and compare the same bounded snapshot atomically before staging. Changed identity/page/fields/answers invalidate review. Unsupported forms, consent boxes and custom questions remain manual.

Staging releases approved bytes to the destination page. Its scripts are not trusted with app credentials, Node or arbitrary file access, but can read the applicant values/resume in their own DOM. Restrict traffic to the selected provider family and explicit CAPTCHA origins; deny arbitrary destinations, popups, permissions and downloads. During preparation block potential network writes. File inputs use a browser File/DataTransfer from the frozen bytes, without exposing a user path or using the clipboard. An asynchronous upload dependency can require manual reselection; do not broaden hosts or claim that every ATS field is supported.

There is **no automated Submit operation**. Approved manual handoff temporarily allows provider requests while the human operates the browser. Main writes a durable intent before a potential external write proceeds and records uncertainty. This deliberately includes writes whose semantics are unknown, including login/CAPTCHA/upload. A fresh same-origin no-form acknowledgement after an intent provides page evidence; it is not an independent employer receipt.

Persist a job-level operation key so a potential duplicate is blocked after the run leaves the recent list. Reconcile incomplete intent on startup; never reopen/refill/replay such a run. No application retry control or uncertainty override is exposed. Before any write, finishing preparation may complete the run without claiming submission. Pause/cancel/quit close owned browser sessions, fence late navigation and preserve durable questions. Lost browser state before a write triggers fresh observation and approval.

## Persistence, tests and tradeoffs

Add career/application data inside encrypted schema-v2 run JSON and reuse binary snapshots/artifact journals. No dependency or SQL migration is required. Keep application detail out of the cursor overlay, voice tool, activity text and notifications. Owned browser session state is ephemeral; source/intent/receipt data persists independently. Generated PDFs remain unencrypted artifacts under the existing retention policy.

Synthetic native and bundled panel tests exercise real Chromium isolation, standard Greenhouse/Lever shapes, review renewal, staged file bytes, manual handoff and recovery. They do not certify current employer DOMs, CAPTCHA/SSO, ATS acknowledgements, provider terms, or live foreground latency. The measured fixture results and operational boundaries are in [the Career Scout guide](../career-agents.md). A browser memory benchmark and supervised live compatibility gates precede public release.

The conservative intent policy can block retries after an unrelated manual-browser write. A future provider-specific mutation adapter must distinguish and reconcile these operations without automatic duplicate submissions. Full automatic application submission is a separate capability requiring exact payload/destination approval and provider-specific uncertain-outcome recovery; manual preparation is the shipping development path now.
