# Guide mode grounds with UI Automation first

Status: Accepted for v1.2.

## Context

"Show me how" must put the kite on the exact control the user should click, across Office, Win32, WPF, UWP, and Chromium apps, at any scaling. It must also keep ADR 007's line: Kite does not drive the mouse or keyboard. Pixel coordinates from a vision model are imprecise and send the screen to a provider for every step.

## Options

- Vision-only coordinates on each step.
- Windows UI Automation (UIA) through a native Node addon.
- A .NET sidecar executable.
- A read-only UIA sidecar hosted by the inbox Windows PowerShell 5.1.

## Decision

Ground each step locally with UIA, then fall back to vision.

- **Sidecar.** A small C# class compiled at startup by the inbox Windows PowerShell 5.1. It speaks newline-delimited JSON over stdio and runs with per-monitor DPI awareness, so it reports physical pixels. Main converts them with `screen.screenToDipRect`.
- **What it reads.** Names, roles, rectangles, and selected/expanded state for interactive controls of the foreground window and its owned popups (menus, galleries). It has no code path that invokes patterns or sends input; a unit test enforces that for the script and the guide modules.
- **Matching.** Pure TypeScript scores label similarity, role compatibility, popups, and proximity to the previous step.
- **Vision fallback.** Used only when UIA misses. It asks the configured vision model for a normalized box, then snaps that box to the UIA control under it when there is one.
- **Plan and approval.** The model plans all steps up front in one `show_me_how` call (≤ 15 steps). The approval summary is deterministic (ADR 008), and the plan is visible on the card.
- **Progress.** A click (uiohook) inside the target advances the step. Other clicks and key presses trigger a quiet UIA re-check, which follows moved windows and notices progress made from the keyboard.

## Consequences

- No new binary dependency, and nothing new to sign or rebuild. The sidecar starts in about 1 s (a C# compile) and takes 25–80 ms per snapshot on the development machine. It idles out after two minutes.
- UIA element names never leave the machine. Screens leave only on a vision fallback, after the guide's approval (which says so), with the **Kite is looking** indicator, and within a budget of six fallbacks per guide.
- Apps with poor accessibility fall back to vision. Constrained Language Mode or a missing PowerShell disables UIA for the session after three failed starts, so vision alone remains.
- Plans come from the model's knowledge of the app. A wrong label is recovered by vision, by "skip", or by asking again.
- Mixed-DPI alignment relies on Electron's conversion and needs manual verification at 125% and 150%.
- Steps advance on clicks, not on outcomes. A click inside the target that the app ignores still advances; "back" undoes that.
