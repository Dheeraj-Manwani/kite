# Scheduled agents and bounded delegation

Phase 5 development implementation, 9 October 2026. Recurring **Inbox Briefing** and **Career Scout** checks run on this PC while Kite is running and awake. Results remain in Agents. A routine cannot run while Kite is closed or the PC is asleep; wake/restart coalesces missed occurrences into one latest check.

## Use a schedule

1. Open **Agents → My agents** and save an Inbox Briefing or Career Scout helper. Gmail requires a connected account; see [Gmail setup](mail-agents.md).
2. Open **Schedules → New schedule** and choose that helper.
3. Choose **Daily** with a time and IANA time zone (for example `Asia/Kolkata`), or **Every interval** with 15–10,080 minutes.
4. Review the displayed mailbox/search/message/attachment limits or board/region/keyword/location/job limits. Check **Approve these recurring reads and local files**, then **Create schedule**.
5. Use **Latest check** for results and **History** for older checks. History pages include unchanged and unsuccessful checks, including runs beyond the main panel's recent 200.

Creating a schedule approves recurring reads and local output for this exact saved helper revision. Its first check is at the next future occurrence. Editing the helper does not change existing schedules; create a new schedule to adopt the edited revision. Archiving the helper prevents further reads. Scheduling arbitrary document paths, application preparation, mail sending, and application submission is unavailable.

**Pause future checks** stops new occurrences. A previously accepted check can still finish: use that run's Pause or Cancel to stop it. Review the shown frozen sources, then **Approve and enable recurring checks** to resume. This explicitly renews access under current settings and schedules the next future occurrence. Up to 20 schedule definitions are supported in this release.

## Timing and recovery

The main process checks persisted schedules every 15 seconds and on startup/resume. Dispatch can happen later while the two run slots are occupied; it is not a real-time alarm. One schedule has at most one unfinished run, including a paused run or a request waiting for you. Further missed occurrences collapse when that run finishes.

Intervals keep their stored UTC cadence. Daily times keep their stored time zone even if the PC's zone changes. A nonexistent minute during a daylight-saving jump is skipped. A repeated minute uses the first occurrence of that civil date. A backward clock change waits for the stored next occurrence; a forward jump coalesces due checks. Updating the timezone rules shipped with Electron can change future daily UTC times.

SQLite schema v3 adds encrypted schedule payloads and a dispatch ledger. A single transaction inserts the frozen run, reserves the `(schedule_id, occurrence)` identity, and advances the schedule cursor. Duplicate reservation rolls back the entire dispatch. Migrations preserve existing v1/v2 agents, sources, runs, events, and artifacts. Older Kite builds cannot open v3 databases.

Closing the Agents window leaves schedules active. Quitting or sleeping pauses execution. Recovery retains queued work and durable requests. This is local scheduling, not a Windows service, wake timer, or cloud executor.

## Quiet checks and access

The first successful check establishes a result fingerprint and saves normal output. Subsequent checks compare content, identities, source limits and truncation flags, ignoring fetch timestamps and API ordering. An unchanged check succeeds in history but produces no new PDF/attachment exports and no completion notification. Its saved source snapshot is still available in the selected run.

An unchanged selected Gmail attachment is identified by its immutable message/part metadata; it is not downloaded again just to compare bytes. A changed message, excerpt, selected attachment set, shortlist, or coverage flag counts as changed. Fingerprinting covers the bounded result, not the entire mailbox or employer's full job inventory.

The successful run and baseline update commit together. A failed or cancelled run cannot advance the baseline. Scheduled failures block further dispatch until review and renewal. A Gmail rate/network/access request can instead park the outstanding run; it prevents subsequent occurrences and needs your attention. Notifications fire on meaningful status/request-kind transitions, not every checkpoint. Cancellation remains quiet.

Recurring consent captures the full permission configuration and Gmail grant revision. Any permission change invalidates it conservatively, even if that change would be more permissive. A due check then fails before a new read and stops the schedule. Preview actions and Don't allow remain binding. Reconnecting Gmail requires renewal against the same account ID and email; another mailbox cannot inherit consent. Checks also revalidate access before new board requests and before publishing results.

## Bounded child work

Career Scout delegates only public board reads to typed child tasks. A child gets one board from the parent's frozen, approved list. It cannot choose another website, open an application browser, send personal details, call a model, create additional agents or spawn grandchildren.

Each parent has at most four child attempts, two simultaneous child tasks, a shared 32 MB response-byte ceiling, an 8 MB per-board ceiling and one two-minute deadline covering discovery and result preparation. The parent's `maxJobs` and first-500-rows-per-board bounds apply to the merged result. Children are merged in approved board order, so a slower board does not change which matches win the result limit. Two parent run slots can therefore use up to four board requests concurrently.

Child starts are durably checkpointed before fetching. Interrupted discovery consumes those attempts; because partial API rows are not retained, recovery fails if replaying all boards would exceed the remaining attempts. The original shared deadline survives recovery. Use **Run again** to deliberately start a new reviewed run with a new budget. It is a one-off run requiring ordinary approval, not another scheduled occurrence. One child failure cancels and joins its siblings before the parent returns; no partial shortlist is published. Activity and selected-run child details show the last durable statuses and aggregate bytes. An interrupted child can retain a running checkpoint after its parent has stopped; that records an attempted read, not a live task.

The controlled four-board fixture injects 80 ms request latency: the measured run took about **364 ms serial versus 182 ms with two children**, returning identical jobs. This establishes benefit for independent reads under simulated latency, not a guarantee for live providers. No additional dependency, model key, service account or runtime agent framework was added.

## Validation and remaining release work

`npm run test:unit` includes recurrence/DST, result fingerprints, child cancellation, aggregate quotas, recovery budgets and the controlled concurrency comparison. `npm run test:schedules` exercises real Electron encryption, SQLite migration, atomic dispatch rollback, restart/sleep, frozen scope, paused-run backpressure, quiet checks, access changes and paginated history. `npm run test:schedules:panel` exercises the bundled main/preload/React panel with a local provider fixture, including recurring consent, close/reopen, timer dispatch, private IPC, history and renewed access.

The existing document, Gmail and career runtime suites remain required regression checks. Windows package/startup and panel tests are run against the rebuilt composition. Live Gmail sign-in/verification and employer-form compatibility remain the earlier phases' release gates; fixtures do not exercise real accounts or submissions. Always-on execution is phase 6 and requires a separate choice about hosting and consented data transfer.

See [ADR 026](adr/026-schedules-and-delegation.md) and the [background-agent roadmap](background-agents-plan.md).
