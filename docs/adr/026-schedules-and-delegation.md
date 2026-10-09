# ADR 026: Local schedules with frozen consent and typed child reads

Date: 2026-10-09. Status: Accepted for the phase 5 development implementation.

## Context

Kite already has encrypted, app-owned runs, immutable helper revisions, approval bindings, result journals, two run slots and sleep/resume controls. Repeated mailbox/job checks need durable dispatch and quiet results. Parallel work is useful only when it does not multiply permissions, attempts or resource limits.

## Decision

Keep scheduling in the existing main-process service. Add SQLite schema v3 schedule definitions and a unique dispatch ledger. Use a transaction to reserve an occurrence, insert its frozen run and advance its cursor. Dispatch on a 15-second poll and startup/resume. Coalesce missed occurrences into one latest run and block overlap while any run for that schedule remains unfinished.

Support UTC intervals and daily civil times using Electron's `Intl` timezone data. Skip nonexistent DST times; choose the first occurrence of repeated civil minutes. Store the next UTC occurrence. Do not keep the PC awake or claim checks run while Kite is closed.

Require explicit recurring-read/local-save approval in the trusted Settings renderer. Capture one helper revision, its exact sources, the complete permissions hash and the Gmail identity/grant revision. A later helper edit cannot widen that grant. Current Never/Preview settings and changed consent take precedence at execution boundaries. Permission changes invalidate recurring access conservatively; renewal is an explicit review. Only Inbox Briefing and Career Scout can be scheduled. Application browsers and mutations remain outside scheduler authority.

Fingerprint bounded source content and coverage metadata independently of fetch time/order. Commit the new baseline with successful completion. Unchanged checks retain a history record without duplicate output or completion notices. Failures block future dispatch; unresolved input/access requests provide backpressure. History uses stable SQLite row cursors rather than timestamps or the recent-run projection.

Use typed, parent-owned child board tasks for Career Scout. Four attempts, two concurrent reads, 32 MB aggregate input, 8 MB per board, zero models and one two-minute deadline constrain the whole parent. Persist child starts before requests. Join cancelled siblings. Merge in approved board order under one result cap. Interrupted reads consume attempts; re-reading requires remaining budget, otherwise the user starts a new reviewed run. No arbitrary custom code, recursive spawning or cross-workflow delegation is exposed.

## Alternatives

An in-memory timer alone loses missed work and can repeat on restart. Per-occurrence jobs without a transaction can reserve a run without advancing the cursor. An external cron/Windows service would add lifecycle and credential ownership without providing remote execution; it is unnecessary for the local-first phase.

Always asking separately for every periodic read prevents useful unattended checks. Treating a saved helper as unlimited permission silently broadens consent. A scoped recurring grant with explicit renewal supports predictable checks without granting send/submit authority.

General-purpose free-form child agents add tool and model-budget complexity before those workflows exist. Serial public discovery remains simpler, but the controlled four-board fixture measured about 364 ms serial versus 182 ms at concurrency two with identical merged output. Limit delegation to this measured workflow.

## Consequences

No additional framework or runtime dependency is required. Schemas v1/v2 migrate additively to v3; older clients fail closed. Schedule definitions have a 20-definition limit and no deletion/editing flow in this phase; pause old definitions. Source snapshots, history and artifacts remain local and OS-encrypted where stored in database payloads. Retention/cleanup UX remains future work.

Conservative recovery can exhaust a discovery budget after interruption even though some boards finished. This is explicit in the run and avoids granting fresh attempts on every restart. Schedules operate only on this device while Kite is awake; phase 6 is separate always-on product scope.

## References

- [Electron powerMonitor](https://www.electronjs.org/docs/latest/api/power-monitor) exposes suspend/resume events used by the existing pause integration.
- [SQLite transactions](https://www.sqlite.org/lang_transaction.html) provide the atomic boundary for dispatch and completion; [table constraints](https://www.sqlite.org/lang_createtable.html) enforce occurrence uniqueness.
- [Operating guide and validation](../scheduled-agents.md).
