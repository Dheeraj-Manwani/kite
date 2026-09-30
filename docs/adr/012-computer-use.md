# Tasks act through UI Automation and the keyboard, never the mouse

Status: Accepted for v1.3. Extends ADR 007 for explicitly approved tasks.

## Context

Users ask Kite to *do* things in apps ("write this in Notepad and save it"), not only to show them how. heyclicky's computer use taught three lessons: moving the user's real pointer is hostile, a running agent needs a visible stop, and approvals must be scoped. ADR 007 kept general automation out of v1 until a confirmed mode was designed. Guide mode (ADR 011) already grounds controls with UI Automation.

## Options

- Pixel clicks from a vision model through SendInput (moves the pointer, fragile at any scaling).
- Posting window messages at coordinates (no pointer movement, but Chromium and UWP ignore them).
- UI Automation control patterns plus keyboard input to the task's window.
- A plan-then-execute script approved up front.

## Decision

An observe-act loop over UI Automation patterns and keyboard input:

- **Separate sidecar.** The task agent has its own Windows PowerShell/C# sidecar (`src/main/agent/actScript.ts`), started only for an approved task. The guide's sidecar stays read-only and its test still forbids action APIs. The task sidecar acts only through Invoke, Toggle, SelectionItem, ExpandCollapse, Value, Text selection, Scroll, SetFocus, and keyboard `SendInput`. It contains no mouse code, and a unit test forbids pointer APIs, window messages, and process launching.
- **One action per step.** Each step snapshots the app (the task's window, or its front window, and its popups), asks the model for exactly one tool call, validates it with zod, and refuses refs from an older snapshot. Pausing abandons the step in flight; resuming starts from a fresh look.
- **Scoped approval.** `do_task` always asks (deterministic summary, ADR 008), with two choices: "Allow this task" or "Step by step" (every action asks). A deterministic risk check (`assessRisk`) makes these ask even inside an approved task: labels that send, delete, buy, submit, or install; confirming a dialog that mentions deleting or overwriting; terminals; password fields; card-like numbers; Enter in messaging apps; and closing, printing, or deleting shortcuts. Risky steps are asked aloud and offer no blanket approval.
- **Visible and stoppable.** A task card shows the goal, the step budget, the action about to happen, and a Stop button. The kite flies to each control and rings it before acting. Stop by button, by voice ("stop"), or with Escape. Any click or key press outside Kite pauses the task.
- **Budget.** At most 15 model decisions per task, 8 minutes of wall time, and three failed actions in a row.
- **Keyboard safety.** Before every keyboard item, the sidecar checks that the task's app is in front and refuses if the user holds a modifier (the push-to-talk shortcut). Text never contains line breaks; Enter is its own, separately assessed action. Requests are ASCII-escaped so any Unicode text arrives intact.

## Consequences

- Kite never moves the pointer, and the user can keep watching. Controls without any pattern cannot be clicked; the model is told and can use the keyboard instead.
- Apps with poor accessibility work less well. Vision-capable models may request a screenshot of the task's window (with the Kite is looking indicator); it is cropped to that window and never saved.
- Keyboard steps bring the task's window to the front. Typing never goes to another app: a switch mid-type stops the step.
- The risk list is keyword-based and cautious. It will sometimes ask when a step was harmless, and it cannot know every app's destructive actions; the per-task and per-step approvals remain the backstop.
- A second sidecar process costs about 0.5 s to start and 75–150 ms per snapshot on the development machine.
