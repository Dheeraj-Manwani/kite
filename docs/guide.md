# Show me how (guide mode)

Ask "how do I add a footer in Word?" and Kite plans the clicks, shows the plan on its approval card, and, once approved, flies to each control and points at it with a hand-drawn ring. Click the control yourself and Kite moves on. **Kite never clicks, types, or changes anything.** Turn guide mode off in **Settings → Actions**.

## Using it

- **Start:** ask a "how do I…" or "show me how…" question with a tool-capable model. Approve by click or by saying "yes". The card lists every planned step.
- **Follow:** the kite points at the current control and speaks the step (when voice is on). The step card shows the instruction, the control's label, and progress.
- **Voice commands** (hold the shortcut and say):
  - "wait", "hold on" → pause. The kite returns to your cursor; the goal and completed steps are kept.
  - "continue", "I'm ready" → resume.
  - "next", "skip", "got it" → go to the next step.
  - "back", "previous" → go to the previous step.
  - "repeat", "where is it?" → say the step again and look for the control again.
  - "stop", "never mind" → end the guide.
- **Card buttons:** Back, Pause/Resume, Skip, and Stop do the same. Anything else you say goes to the model, which knows which step you're on and can start a different guide.
- **Other ways to finish a step:** if you complete a step with the keyboard (access keys, arrows), Kite notices on its next check. A tab that is already selected, or a menu that is already open, counts as done.
- **Ending:** after the last click Kite says "All done". An untouched guide ends after 10 minutes. Pausing Kite from the tray pauses the guide.

## How Kite finds a control

1. **Windows UI Automation, locally.** A read-only sidecar reads names, roles, rectangles, and selected/expanded state for controls in the active window and its menus and drop-downs. It retries briefly while menus animate open. Nothing from this step leaves your PC.
2. **Vision fallback.** Used only if UI Automation can't find the control. Kite captures that display (with the **Kite is looking** indicator), asks your vision model for a box around the control, and snaps the box to the real control underneath when there is one. At most six fallbacks per guide.

While a step is shown, Kite re-checks the window after your clicks and key presses and every 2.5 seconds, so the ring follows moved windows. If the control disappears twice, Kite looks again (with vision if needed). If it still can't find it, the card says so and keeps checking.

## Privacy and safety

- The approval card states the plan, and that Kite may look at your screen if it can't find a control.
- Control names and window titles stay on your PC. Screenshots taken for the vision fallback go only to your configured vision model; they are never saved, not even with "Keep screenshots in history" enabled.
- Vision only looks at the app being guided. It never captures because you switched to another app, and never while one of Kite's own windows is in front.
- The sidecar runs the inbox Windows PowerShell from `System32` with a script Kite writes to `userData/guide/`. It reads accessibility properties only. It cannot invoke controls or send input, and a unit test checks the script for input and invoke APIs.
- Click tracking reads mouse-down positions from the existing input hook. Clicks on Kite's own card or bubble, and while drawing, never count.

## Verification

- `npm test` (`tests/guide.test.cjs`): voice commands, label and role matching, popups, vision reply parsing and snapping, layout, ring determinism, the full session state machine (advance, lost, vision budget, pause/resume, next/back/repeat, keyboard progress, tracking, stale results), the tool's schema and summary, sidecar protocol and restarts, quiet announcements, and local command handling.
- `npm run test:uia`: a real WinForms window, the real sidecar, and a real session. It covers a tab switch, a button on the newly shown page, an item in a popup menu, a selected tab completing itself, hidden tab pages being ignored, and Kite's own process being excluded.
- `npm run test:renderer` (after a build): ring, card placement, the kite flying to point, and the card controls.
- In development, **Demo guide** in the dev panel (Ctrl + Shift + D) tours up to three menus or tabs of the active window without a model.

Still verify by hand: 125% and 150% scaling on mixed-DPI monitors; Office ribbons and galleries; Chromium apps; and live vision fallbacks with each provider.
