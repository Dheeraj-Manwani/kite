# Gmail background agents: phase 3

Implemented on 9 October 2026. **Inbox Briefing** reads a bounded Gmail search, shows source excerpts in Agents, creates a PDF, and optionally saves supported attachments. Named helpers freeze their account/search settings. Execution continues with the panel closed while Kite is running.

This development implementation requires your own Google Desktop OAuth client. Automated validation uses synthetic local services; no real mailbox or Google login was accessed. Public connector release and supervised live sign-in remain gates.

## Configure Gmail

1. In your Google Cloud project, enable the Gmail API. Configure Google Auth Platform branding/audience and, for an external project in Testing, add the Google account you will use as a test user. Google's [Gmail quickstart](https://developers.google.com/workspace/gmail/api/quickstart/nodejs) explains these console prerequisites.
2. Create an OAuth client with application type **Desktop app**, then download its client JSON. A Web client file is rejected. Use a dedicated client for Kite's read-only integration.
3. Open **Agents → Mail accounts → Import Google client** and choose that file. Kite stores its configuration using OS encryption; the original downloaded JSON remains wherever you saved it.
4. Select **Connect Gmail**. Sign in through your system browser, choose the intended account, and grant read-only Gmail access. Return to Kite once the account appears. Cancel connection is available; unanswered connections expire after five minutes.
5. You can connect up to five live accounts. Replacing the client requires disconnecting every live account first. Reconnect then uses the replacement client.

Kite requests only `https://www.googleapis.com/auth/gmail.readonly`. OAuth consent permits mailbox reads; each run adds a separate review of its account, search, limits and downloads. Sending, drafts, deletion and marking mail as read are unavailable. System-browser authorization uses a temporary loopback listener, state validation and PKCE S256, following Google's [installed-app OAuth flow](https://developers.google.com/identity/protocols/oauth2/native-app).

## Run or save a briefing

1. Select **New run → Inbox Briefing (Gmail)**. Name the run, choose an account, enter a Gmail search such as `in:inbox newer_than:7d`, and set the maximum messages (1–20; default 10).
2. Optionally enable attachment downloads. Start the run. Starting without an account creates a durable account/search question in **Needs you**; voice delegation follows the same path.
3. In **Needs you**, review and **Approve this mail search**. A run always asks, even when general Look/Add permissions allow actions. Setting either applicable permission to Never blocks the action. No mailbox search runs before approval.
4. Open the finished run for its PDF and source cards. **Open source in Gmail** opens a link constructed from the saved account/thread identity. Gmail's current browser session still controls which accounts are signed in.
5. Attachments offer **Show in folder** and **Save a copy**, with a new filename required. Kite never previews or opens a downloaded attachment automatically. PDF preview/open is reserved for the generated briefing.
6. Under **My agents → Create agent**, choose Inbox Briefing and save an account/search/limit/download preference. Each run retains its helper revision. **Run again** creates a fresh search with a fresh approval.

Briefings are **local extracts, not AI-written summaries**. They make zero model calls and do not send mail bodies to an external model. Up to 4,000 characters per message appear in the panel; the PDF includes up to 2,500. Plain text is preferred; HTML fallback becomes inert text, without scripts, images or remote resources. MIME/charset decoding is bounded and cannot guarantee complete formatting or text for every message. Missing messages and additional search matches are reported. The query uses one result page rather than silently scanning the entire mailbox.

## Limits and recovery

Supported attachment suffixes are PDF, TXT, MD, PNG, JPG/JPEG, DOCX, XLSX and PPTX. This is a download filter, **not content validation or an Office converter**. Downloads remain untrusted. There are at most eight files, 5 MB each and 16 MB total per run; unsupported or over-budget attachments are counted as skipped. Filenames are normalized and private originals use `.bin`. Identity and byte count are checked on retrieval; export rechecks the saved hash.

Each API request has a 20-second deadline. Message responses are capped at 2 MB, attachment responses at their bounded base64 size, MIME trees at 200 nodes/12 levels, and attachment metadata at 30 entries per message. Inputs exceeding structural limits fail clearly. The durable runtime's overall attempt deadline and concurrency limits also apply. Phase 3 one-off runs always require per-search approval. Phase 5 adds [explicitly approved recurring checks](scheduled-agents.md).

Revoked/reduced access, invalid refresh grants, network failures and rate limits park work with an account-access request. **Reconnect** the same account if required, then **Review and resume** and approve again. Runs cannot switch to another mailbox. An account revision change invalidates old approval and fences in-flight reads/publication. A saved briefing can resume its remaining exports after same-account reconnection; Run again fetches fresh mail. Deleted source attachments may require a fresh run.

Pause/cancel/quit use the existing generation fences. Cancel aborts mail reads and prevents late publication. A shared token refresh can finish within its request deadline, but an obsolete account/run generation cannot commit an output. The attachment journal recovers a file published before its run checkpoint without a duplicate download/output.

**Disconnect** removes local refresh credentials and stops pending reads immediately, then attempts Google revocation. If revocation cannot be confirmed, Kite tells you to remove the app grant in your Google account. Disconnect retains account identity, helper settings and completed local outputs. It does not delete your original mailbox messages.

## Storage and privacy

`userData/mail.db` separately stores encrypted OAuth configuration and account credentials using Electron `safeStorage`, with no plaintext fallback. Access tokens remain in main-process memory. The renderer receives account identity/status/revision, never tokens or the client JSON. The cursor overlay cannot read the account list or briefing bodies. Only the trusted Agents/settings window receives the saved briefing detail.

Bound search settings and briefing excerpts are encrypted in the run payload in `userData/background.db`; raw bodies and tokens are omitted from activity events and generic notifications. Generated briefing PDFs and private downloaded attachments in `userData/agent-artifacts/`, plus exported copies, are **unencrypted files**. They remain until manually removed; there is no retention/delete UI yet. Disconnecting or deleting voice history does not remove these files. The imported source JSON and backups are outside Kite's encrypted store.

If mail storage or OS encryption is unavailable, Mail accounts is unavailable while the document runtime can remain usable. There is no plaintext credential fallback or renderer-based mailbox client.

## Validation and release gates

```sh
npm run typecheck
npm run lint
npm run test:unit
npm run test:mail
npm run test:background
npm run test:background:documents
npm run package
npm run test:mail:panel
npm run test:background:panel
npm run test:startup
npm run test:native
npm run test:packaged
npx electron tests/packaged-runtime.cjs
npm test
```

Build before tests using `.vite/build`, and never run those tests while Forge replaces that directory. Fixtures exercise real loopback OAuth callbacks, SQLite/OS encryption, Chromium PDF generation, the bundled React/preload/IPC panel, approval restart, account binding, broader-scope rejection, revoked access, same-account reconnect, independent accounts, cancellation, inert message instructions, intact attachments and crash recovery. Provider transport/browser authorization alone are redirected to synthetic services. These passes establish implementation behavior, not Google's production approval or Gmail compatibility across live account policies.

Validation on Windows: typecheck/lint passed, all 17 Vitest tests and 308 existing regression tests passed, and native mail/background/documents/preview plus bundled mail/document panel, startup, native storage/tray and packaged executable/dependency checks passed. The mail test also verifies that an obsolete refresh failure cannot invalidate a fresh reconnect. The generated synthetic briefing PDF was rendered with Poppler and visually checked. No runtime dependency was added.

Before public release, validate an actual Desktop OAuth client with a supervised account, cancellation, expiry, provider revocation, account selection and Gmail source links. `gmail.readonly` is a restricted scope: Google's [scope documentation](https://developers.google.com/workspace/gmail/api/auth/scopes) describes verification and the additional assessment requirements when restricted data is stored/transmitted through servers. No verified shared client is bundled. Introducing external-model summaries or server execution requires a separate architecture/policy assessment; local-only fixtures do not resolve that gate.

Outlook, drafts/sending and AI summaries remain future work. Phase 4 adds [application preparation](career-agents.md); phase 5 adds [local scheduled checks](scheduled-agents.md). See [ADR 024](adr/024-read-only-gmail.md) and the [background-agent roadmap](background-agents-plan.md).
