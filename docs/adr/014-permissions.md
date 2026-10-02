# Permission categories and modes for tasks and jobs

Status: Accepted, 1 October 2026. Amends ADR 008 and ADR 012 for steps inside an approved task.

## Context

ADR 012 gave a task one bit per step: risky steps (`assessRisk`) asked, and everything else ran. Jobs (docs/end-to-end-jobs.md) need more than that. The checkout question ("check out yourself, or should I?") is a permission, a repeat order should take one question, and some people want Kite to do a whole errand while others want to see every step. Web pages are untrusted text the model reads, so a mode that removes every check would let a product listing steer Kite.

## Options

- Keep one risky bit and add more keywords.
- Let users mark raw actions (click, type) Allow / Ask.
- Classify each step into a few categories of *effect*, and let users mark the categories, with presets and rules per site or app.

## Decision

Categories of effect, decided by code (`classifyStep` in `src/shared/agent.ts`), resolved by code (`resolve` in `src/shared/permissions.ts`):

- **Nine categories:** Look around, Fill in, Add or save, Use saved info, Submit, Send as you, Spend money, Delete or overwrite, Accounts and system. Inputs are the action, the control's name, help text and automation id, dialog text, the app's process, the page URL, and the job phase. "Continue" on a `/checkout` or `/payment` URL, or in the checkout or pay phase, is Spend money. When unsure the classifier takes the safer category; a mistake costs one extra question.
- **Three states and four modes.** Each category is Allow, Ask or Don't allow. *Ask every time*, *Balanced* (the default: Look, Fill, Add and Saved info allowed, the rest ask) and *Hands-off* (all allowed) are presets; changing a row makes *Custom*.
- **Rules per place.** "Always" and "Never" on the task card, or said aloud, save a rule for the page's host (subdomains included) or the app ("app:notepad"), or change the category everywhere. The most specific rule wins.
- **The start choice.** Starting a task always asks (ADR 008). The card offers *Start* (the user's settings), *Hands-off for this job* and *Step by step*. The job's choice changes Ask to Allow or Allow to Ask, but never overrides Don't allow.
- **The floor asks in every mode:** money above the spend limit (default ₹0, so every payment asks) or of an amount code can't read from the page; a category outside the job's kind (sending during a shopping job); running commands (terminals, Run). "Always" isn't offered for a floor question, since it couldn't stop it.
- **Never, in any mode:** typing into password fields, card-like numbers, and fields for one-time codes, CVVs and PINs. Nothing runs, and the agent is told to have the user type it.
- **Don't allow** never asks: nothing runs, the audit records a denial, and the agent is told to stop before the step and hand over. The system prompt lists what is disallowed so the agent plans around it.
- Leaving the job's site keeps asking as before (phase 1).

## Consequences

- One mechanism covers the checkout handoff, Hands-off jobs and repeat orders. Phase 4's "I'll do it / You do it" question is the Spend money row.
- Keyword classification still misses things. The URL and the phase cover the dangerous "Continue" on payment pages. A corpus of checkout buttons from five stores is a test: none may resolve to Allow with the default limit.
- The spend limit trusts a total read from the page. A page that hides its total always asks.
- Hands-off as a lasting mode needs a confirmation in Settings, and the kite wears a ring on its tail while it is on (or while a job runs hands-off).
- Passwords and card-like numbers used to ask; now they are never typed, as the plan's "never" list says.
- Chat tools (open an app, search the web…) keep their own "Ask before I…" switches in Settings → Actions. Typing, the clipboard, screen reads, guides and starting a task always ask, as before. Nothing in the old `toolApprovals` maps onto categories, so every user starts on Balanced, which behaves like ADR 012's risk rule.
- Per-site spend limits and the "stop asking?" nudge are left for phase 5.
