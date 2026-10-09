# 024: Account-bound, read-only Gmail background runs

Accepted for the phase 3 development implementation, 9 October 2026. Builds on [ADR 022](022-background-agents.md) and [ADR 023](023-document-workers.md). Gmail first is the user's selected provider.

## Decision

Use a main-process Gmail API adapter behind a typed `MailConnector` interface and the existing durable run service. Read/search/attachments are API operations rather than inbox UI automation. Add account controls and Inbox Briefing to Agents, including reusable helper settings. Produce bounded local excerpts and a PDF using the existing text executor; make no model calls. This gives background mail utility without adding a server, mail SDK or AI data-transfer dependency.

OAuth uses an imported Google **Desktop** client, the system browser, random-port `127.0.0.1` callback, high-entropy one-use state and PKCE S256. Google documents these installed-app mechanisms in its [native-app flow](https://developers.google.com/identity/protocols/oauth2/native-app). Reject Web-client JSON, pin authorization/token/revocation/API destinations, and reject credential-bearing redirects. An installed client secret is configuration rather than a proof of confidentiality; it still stays out of UI/events/logs.

Request only `gmail.readonly`, and reject a returned broader or missing grant at initial authorization. Refresh responses may omit scopes; if supplied they must match. Gmail requests expose GET only; POST is restricted to token exchange/revocation. Draft/send/delete/mark-read capabilities and uncertain mutation replay are absent. Google's [scope reference](https://developers.google.com/workspace/gmail/api/auth/scopes) establishes read-only scope semantics and the public verification gate.

## Identity, approval and credentials

Accounts have stable local UUIDs, normalized provider email identity and a monotonically changing revision. OAuth profile verification identifies the principal. Reconnect checks the same identity before replacing credentials. Store encrypted client/account data in a separate `mail.db` with `safeStorage`; keep access-token caches and refresh deduplication in main memory. Deduplicate refreshes by account **and revision** so an obsolete refresh cannot replace/invalidate a new grant.

Freeze account UUID/email/revision, query, message limit, attachment preference and helper revision in the approval binding. Every mail run asks independently of Allow; Never still blocks. A request response cannot smuggle a different mailbox into approval. Validate the provider profile and recheck the account revision around reads and artifact publication. Account changes abort affected reads, reset approval and park unfinished work; other accounts remain usable.

No mailbox bodies/tokens flow through the voice tool, overlay account API, activity events or generic notifications. Trusted settings IPC exposes account metadata and stored source cards. Native import selects a bounded JSON file; arbitrary renderer-supplied paths/provider URLs are not accepted. Source links are constructed from a stored account/thread pair, never from message HTML.

## Bounded execution and recovery

One bounded search page, sequential message reads, bounded MIME trees and attachment budgets keep deterministic work predictable. Strip HTML to inert text; never load message DOM/resources or evaluate retrieved instructions. Excerpts are clearly labeled, with truncation and further-match signals rather than claims of comprehensive AI analysis. Supported attachment suffixes permit downloads only; no parser, preview or default application launch receives mail attachments.

Encrypt the normalized briefing snapshot in the existing run payload. Publish its PDF and attachment bytes through the existing generation fence and prepared/committed journal. Recover a hash-checked published attachment without another download. Pause retains the snapshot; same-account reconnection requires fresh approval; Run again clears it and re-queries. Local disconnect removes credentials before provider revocation, and communicates uncertain revocation. Completed files remain available.

The run database stays schema v2 because mail fields are additive inside encrypted JSON; document operations and legacy bindings remain compatible. The connector database has its own schema v1. A connector initialization failure must not disable otherwise usable document runs.

## Alternatives and remaining gates

Driving Gmail's GUI would borrow the user's session and couple reliability to focus/layout. A mail SDK adds dependency surface without removing account binding, OAuth, limits or durable recovery; built-in fetch is sufficient for this narrow API. A cloud connector would add credential hosting and restricted-data transfer obligations before there is an always-on requirement. An external model offers semantic summaries but introduces a separate consent/provider-policy decision; this release uses local extracts.

Google verification, supervised live OAuth/source-link checks, broader MIME compatibility, data deletion/retention UI and cross-platform encryption validation remain release gates. No real account was used for automated validation, and no verified shared client is distributed. Sending must be implemented as a distinct future capability with exact mutation approval, durable intent and uncertain-outcome reconciliation; never infer it from read authorization. Operational limits, setup and fixture commands are in [the Gmail guide](../mail-agents.md).
