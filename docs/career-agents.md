# Career Scout and application preparation: phase 4

Development implementation on 9 October 2026. Career Scout discovers published jobs on selected Greenhouse/Lever company boards, saves source cards and a shortlist PDF, and prepares a selected application in its own Chromium window. Standard contact fields and a frozen PDF resume can be staged after review. **You review remaining answers, sign in/handle CAPTCHA, and submit manually.** Kite never clicks Submit or posts an application API request automatically.

Fixtures validate the real Electron runtime and bundled Agents/preload/IPC flow. No real applicant, employer login, resume upload or job submission was used. Supervised live ATS testing remains a release gate; individual employers' custom forms and upload/login services can differ.

## Discover jobs

1. Open **Agents → New run → Career Scout (Greenhouse/Lever)**.
2. Choose a provider and enter its company board token, taken from its hosted board URL. For example, a board URL shaped `job-boards.greenhouse.io/company` uses `company`; a Lever board shaped `jobs.lever.co/company` also uses `company`. Select EU for `jobs.eu.lever.co`. Arbitrary URLs and tracking redirects are not accepted as board tokens.
3. Add up to four boards. Enter keywords and a location substring if desired. All space/comma-separated keywords must occur in the title/description; matching ignores case. These are literal filters, **not AI ranking, resume matching or a recommendation**.
4. Set the result limit (1–20; default 10), start, and **Approve job discovery**. The approval names the boards and result limit. Applicable Look/Add permissions set to Never block work. No resume/contact details are part of discovery.
5. Read the source cards and export **Career shortlist.pdf**. Additional matches/scan limits are reported. A board failure fails the run rather than presenting a silently partial successful result. Run again performs a fresh discovery with fresh approval.

Discovery uses the providers' public listing interfaces: [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html) and [Lever Postings API](https://github.com/lever/postings-api). Provider-supplied arbitrary URLs are ignored; application URLs are constructed from the validated provider, board and job identity. A company can use a custom career page that this adapter does not support.

Save a reusable Career Scout under **My agents** with boards, filters and limits. Each run keeps its helper revision. Voice can start Career Scout and leave a durable board/filter question in Agents; personal inputs never belong in that tool.

## Discover boards from Gmail alerts

In a completed Inbox Briefing, select **Scout jobs from this briefing**. Kite extracts up to four direct Greenhouse/Lever board identities from the saved message excerpts, then asks before reading those public boards. It does not perform another mailbox read or follow tracking/shortened/arbitrary links. Results include other current postings on those boards, not just the original alerted roles. Excerpt truncation can omit a link; enter the board manually when no supported link is found. The new run retains the briefing as its parent.

## Prepare an application

1. In a completed shortlist, choose **Prepare application** on a role. Only a stored shortlisted job can create an application run; arbitrary caller URLs are rejected.
2. Enter your exact first/last name, email and optional phone, and choose **one supported plain PDF resume** through the native picker. The existing document admission rules apply: at most 5 MB, no encryption/signature/interactive features. The accepted bytes and hash are frozen locally. Kite does not infer experience, authorization, demographics or custom answers.
3. The selected application page loads **hidden**, without switching the active desktop app. Its URL, title, bounded visible text and form fields/labels/options become a snapshot. The review shows the role, destination, contact details, resume name/size/SHA-256 and current page identity **before the approval button**. Review them, then **Approve application preparation**.
4. On recognized Greenhouse/Lever forms, Kite stages only standard name/email/phone fields and the frozen PDF in the resume input. It leaves consents and custom questions alone. Form/page changes force fresh review. No preparation POST/upload/submit is permitted; a page that expects an immediate asynchronous upload may need the resume reselected manually in the browser.
5. Select **Open application browser** for explicit takeover. This is the only step that shows/focuses the browser. During approved handoff, the page can send requests to its provider and the permitted CAPTCHA services. Review every answer and attachment yourself, complete supported sign-in/CAPTCHA steps, and submit if you choose.
6. Use **Check acknowledgement** after submission. Kite records a fresh same-origin page acknowledgement only after observing a potential external write. The displayed URL/title/time is page evidence, **not independent employer confirmation**; check employer email/portal as needed.
7. If you only want preparation, use **Finish preparation without submitting** before any potential external write. Completion says preparation finished and explicitly does not claim an application was submitted.

Unrecognized forms or login/CAPTCHA pages receive **no automated personal inputs**. You can approve a manual handoff and complete them yourself. If a fresh page is reached before an external write, **Review current page** captures it and requires fresh approval before automated staging. Once any potentially mutating request occurs, the run remains conservative: finish the manual flow and check its acknowledgement instead of asking Kite to refill or replay it.

## Isolation and uncertain outcomes

Each application owns an ephemeral Chromium session, separate from Kite and from other application runs. There is no Kite preload, Node integration, existing user-browser cookie sharing, global mouse/keyboard automation, clipboard use or model call. Closing the window clears its session storage. Popups, downloads, OS permissions and top-level cross-origin navigation are denied. This builds on Electron's [session isolation](https://www.electronjs.org/docs/latest/api/session) and [webContents controls](https://www.electronjs.org/docs/latest/api/web-contents); it is not an OS sandbox or a promise of containment if Chromium is compromised.

Requests are restricted to HTTPS within the chosen provider's domain family and a small CAPTCHA-service allowlist. The other ATS provider, arbitrary hosts, local resources and credentials in URLs are blocked. Application pages run their own JavaScript and can access the personal inputs you approved releasing to them. The request filter blocks non-GET/HEAD/OPTIONS methods during preparation; it cannot infer the server-side semantics of every GET. During handoff, asynchronous page requests can occur as part of your interaction.

Before allowing the first potentially mutating handoff request, main synchronously saves a durable external intent and marks the outcome **uncertain**. CAPTCHA/login/analytics/upload writes can also trigger this conservative marker; it is not proof that an application was submitted. An acknowledgement can resolve the run's displayed outcome. A job-level intent prevents creating another potential duplicate, even after that run leaves the recent list. Application **Run again** is disabled.

After crash, quit, sleep, pause, cancellation or lost browser state, a run with an external intent is never reopened/refilled/replayed automatically. Check employer email/portal to reconcile it. There is no override/deletion/retry UI for a recorded potential submission yet. This can block a legitimate retry after an unrelated handoff write; that is a documented limitation of this first implementation. No automatic submission capability is present.

Closing/reopening Agents preserves its questions and inputs. Closing the application browser before any external write requires loading a fresh page and renewing personal-input approval. Pause Kite or pause/cancel a run closes its owned browser. In-flight navigation and late results are generation-fenced. Login cookies are ephemeral, so reconnection after restart requires signing in again. SSO/popups/cross-origin login and unlisted upload/CDN services remain unsupported rather than widening destinations silently.

## Budgets, storage and validation

Discovery reads at most four boards, inspects the first 500 postings per board, returns at most 20 jobs, and caps each response at 8 MB/20 seconds. Excessive provider arrays are rejected; truncation is visible. Browser preparation uses at most two owned windows, a 25-second initial navigation deadline and the shared two-minute active attempt deadline. Snapshots include at most 20,000 visible-text characters, 100 fields and 30 options per select. These limits do not constitute a hard Chromium memory limit. An open manual handoff remains user-owned until closed, paused, cancelled or checked.

Shortlists, applicant inputs, page snapshots and receipts are encrypted inside the existing `background.db` payloads. Resume snapshots use its separately encrypted binary source store. Personal fields are excluded from activity events, notifications and the cursor-overlay detail API. Intent metadata and source identity persist for recovery. Generated/exported shortlist PDFs are ordinary **unencrypted files** in `agent-artifacts/`; there is no retention/delete UI. Staging the approved resume in the application page releases bytes into that page's memory; its scripts can read them even before a manual upload. The original resume is never overwritten.

```sh
npm run typecheck
npm run lint
npm run test:unit
npm run test:career
npm run test:mail
npm run test:background
npm run test:background:documents
npm run package
npm run test:career:panel
npm run test:mail:panel
npm run test:background:panel
npm run test:startup
npm run test:native
npm run test:packaged
npx electron tests/packaged-runtime.cjs
npm test
```

Build before bundle-based tests and never run them while Forge replaces `.vite/build`. Native fixtures cover discovery/filters/limits, inert source text, shortlist PDF, hidden isolated sessions, frozen resume, changed-page approval, Greenhouse/Lever standard fields, manual-only submission, acknowledgement evidence, crash-after-write no replay, fresh login/CAPTCHA review, pause and cancellation. The bundled panel fixture covers private IPC, composer, restored approval, source cards/PDF, native resume selection, personal-input review, staging, explicit takeover and preparation-only completion. Automated provider traffic is redirected to local fixtures; no credentials or real job application are used.

Public rollout still needs supervised live provider/form/upload/login tests, broader layout compatibility, long-run browser-resource measurements and independent foreground-input/voice latency measurements. Hidden/no-global-input checks establish the implementation mechanism, not a live productivity benchmark. Automatic job submission needs separate exact mutation approval, provider-specific reconciliation and durable evidence before enabling it. Phase 5 now adds [local schedules and bounded board tasks](scheduled-agents.md). See [ADR 025](adr/025-career-preparation.md).

Windows validation: typecheck/lint, 21 Vitest tests and 308 existing regression tests passed. Native career/mail/background/document tests, bundled career/mail/document panel tests, startup/native storage/tray, packaged executable and dependency probes passed. The native career test additionally verifies saved scout settings, Gmail-excerpt board derivation and recovery of a published shortlist without another provider read. The synthetic shortlist PDF was rendered with Poppler and visually checked; the panel and staged browser form were captured and inspected. No runtime dependency was added.
