# Kite: Backlog, Fixes & Roadmap

_Last updated: 30 Sep 2026._

This file tracks everything not yet built across Phases 0–6, known issues to fix or verify, improvements to existing pieces, and new capabilities. The research section draws on heyclicky (the closest competitor), Microsoft Copilot Vision on Windows, and Wispr Flow.

**Priority:**

- **P0:** fix before or at the v1.0 ship.
- **P1:** next milestone.
- **P2:** later.
- **P3:** someday or experimental.

**Effort:** **S** under 1 day · **M** 1–3 days · **L** 1–2 weeks.

**Tags:** `[verify]` means test it first; it may not be a bug on your machine.

---

## 1. Competitive snapshot

### heyclicky (the product that inspired Kite)

**Basics**

- A Mac-only buddy that lives next to the cursor. Windows is a waitlist only.
- Plans: Free, Pro at $20/month, and Max at $100/month, all tied to an account.
- The pitch: press a hotkey, it sees your screen and talks you through whatever you're doing, draws on screen to point the way, or runs an agent to do the task.

**How it evolved (from its public changelog, Apr–Sep 2026):**

- **v1.0 (Apr):** a cursor-buddy teacher. Hotkey, screen, spoken answer, pointing.
- **Agents and computer use (Apr–May):** background agents came first. Computer use followed, openly described as early and sometimes broken. Later rebuilt so it never moves the user's real pointer.
- **Realtime voice (late May):** speech-to-speech with barge-in, an always-on mode restricted to headphones because of echo, and 70+ languages.
- **Draw-on-screen walkthroughs (Jun):** step-by-step guidance that detects when you click where it pointed, then advances. Later versions added "teaching skills" for 89 apps, hand-drawn (Excalidraw-style) shapes, and a step budget raised from 5 to 15.
- **Spatial context (Jun–Jul):** circle, point, or scribble while talking. This is the same idea as Kite's "circle to ask."
- **Memory:** a profile file for habits and preferences plus a "current project" file, both injected into every request.
- **Proactive agents:** launched, then removed after users felt watched. All local activity tracking was deleted.
- **Dictation (Jul):** hold-to-talk into any app with streaming and a cleanup model, an auto-learned dictionary from your edits, and a screen-aware mode ("type a reply to this email").
- **Model routing:** a fast model for quick questions, with a hand-off to a deeper model for complex or screen questions.
- **Clickys (Sep):** persistent named agents with their own memory, routines, custom MCP connectors, and daily suggestions. Approvals are "allow once / always / not now," scoped to one conversation.

**Bugs they hit that Kite will also hit (see section 3):**

- Bluetooth headsets clipping the start of replies.
- Wedged or disappearing mics.
- Replies playing into muted speakers.
- Paste breaking on non-QWERTY keyboard layouts.
- Clipboard managers archiving dictated text.
- Dictated newlines executing commands in terminals.
- High idle CPU from always-running animations.
- A cold-start race on the first voice turn.
- A stale sense of the current time.
- Regional blocks by AI providers.
- Deep answers cut off by short timeouts.

### Microsoft Copilot Vision on Windows

- You share one or two app windows, and Copilot talks with you about them.
- **Highlights:** ask "show me how" and it highlights where to click inside the shared app.
- Launched first in the US, tied to the Copilot app and Microsoft 365.
- **Lessons:** guided "show me where to click" is table stakes for any Windows teaching assistant. Sharing a single window, rather than the whole screen, is a privacy model users understand.

### Wispr Flow (dictation benchmark)

- AI cleanup: removes fillers, fixes grammar, and resolves "no wait, Friday" self-corrections.
- A personal dictionary that also learns automatically, plus voice snippets ("insert my calendar link").
- **Command Mode:** highlight text, speak an edit ("make this friendlier"), and the text is replaced.
- Also has whisper mode and per-app tone styles. Runs on Mac, Windows, and iOS.
- **Lesson:** dictation is the daily-habit feature that keeps a voice tool running all day.

### Where Kite stands

**Kite's advantages**

- It runs on Windows today, where heyclicky has only a waitlist.
- Bring-your-own-key for any provider, including free and cheap tiers, with no subscription.
- No account and no server: local-first. Heyclicky keeps text summaries server-side.
- Open source, with auditable, deterministic confirmations.
- A kite with physics-based personality.

**Gaps to close**

- Guided walkthroughs (section 5.1)
- Dictation (5.2)
- Command mode on selected text (5.3)
- Typed input (5.4)
- Memory (5.5)
- File drop (5.6)
- MCP connectors (5.7)
- Realtime speech-to-speech (5.10)

---

## 2. Pending items carried over from the build phases

### Phase 0–1: Overlay & kite character

- [ ] **P2 · S:** decide on kite eyes (the flag exists; try it on and off in the demo).
- [ ] **P2 · M:** a morph library, if you ever want shape changes beyond kite-consistent moods.
- [ ] **P3 · L:** a Rive port through the `KiteRenderer` boundary.
- [ ] **P1 · S:** final tuning pass on spring, damping, and wag values using the dev panel.

### Phase 2: Voice loop

- [ ] **P0 · S `[verify]`:** the tradeoff between a warm mic stream and per-press mic opening (see 3.2, the privacy indicator).
- [ ] **P1 · S:** a hard cap on recording length with a warning. Check Groq's per-request audio size limit.
- [ ] **P2 · M:** VAD auto-stop as an optional alternative interaction (not chosen for v1).

### Phase 3: Providers & voice

- [ ] **P1 · S:** keep model ids in `catalog.ts` fresh. Add a startup check that flags ids the provider no longer lists.
- [ ] **P1 · S:** make the fallback model logic cover mid-stream failures, not just failures before the first token.

### Phase 4: Actions

- [ ] **P0 · S `[verify]`:** clicking ✓ on the overlay must not steal focus from the app `type_text` will paste into.
- [ ] **P1 · S:** tiered trust ("allow once / always / not now"), and scope "always" to the current conversation first.
- [ ] **P2 · M:** a media control tool (play/pause, next, volume). It was dropped because it needs a reliable key or native path.
- [ ] **P2 · M:** window management (focus, minimize, snap) through a small native helper.
- [ ] **P2 · M:** active-window awareness (app name and title) as cheap context instead of screenshots.

### Phase 5: Vision

- [ ] **P0 · S `[verify]`:** test on 125% and 150% scaling, a second monitor with a negative origin, and mixed DPI across monitors.
- [ ] **P0 · S `[verify]`:** check how each provider accepts image tool results for `read_screen`, and confirm the fallback path works.
- [ ] **P2 · M:** OCR for "copy the text I circled" (see 4.6).
- [x] **P3 · L:** a computer-use agent (see 5.12). Done in v1.3.

### Phase 6: Ship

- [ ] **P0 · M:** the native-module packaging hook, plus a clean-VM smoke test.
- [ ] **P0 · S:** README, ADRs, demo video, and resume bullets with **measured** numbers.
- [ ] **P2 · M:** paid code signing once the project has real users.
- [ ] **P2 · M:** end-to-end tests with Playwright's Electron support, covering onboarding and settings only.
- [ ] **P3 · L:** a macOS port. Electron makes this realistic, and it would compete head-on with heyclicky.

---

## 3. Issues to fix or verify

### 3.1 Hotkeys & input hooks

- [ ] **P0 · S `[verify]` Start menu on release.**
  - Confirm that pressing and releasing `Ctrl+Win` never opens the Start menu.
  - If it does, change the default combo, or tap a harmless unused key while Win is held so Windows doesn't treat the release as a lone Win press. AutoHotkey uses this same trick.
- [ ] **P1 · S Collisions with system shortcuts.**
  - `Ctrl+Win+D`, `F4`, and the arrow keys (virtual desktops), `Ctrl+Win+Enter` (Narrator), `Ctrl+Win+O` (on-screen keyboard), and `Ctrl+Win+C` (color filters, if enabled) will still fire in Windows.
  - Kite's cancel-on-extra-key rule handles Kite's side. Document the rest in onboarding.
- [ ] **P0 · S Elevated (admin) windows.**
  - Windows isolates admin-level windows from normal apps. While an elevated window has focus (Task Manager, an admin terminal, installers), push-to-talk may not trigger, and pasting into that window will silently fail.
  - Detect and explain where possible, document it, and add a kite "I can't reach that window" reaction if a paste is confirmed but nothing changes.
- [ ] **P1 · M Silent hook removal.**
  - Windows silently removes low-level hooks whose callbacks take too long.
  - Keep the uiohook callbacks trivial (just push an event onto a queue). Add a health check that restarts the hook after resume, unlock, or display changes. Optionally, synthesize a rarely used key such as `F24` and confirm the hook sees it.
- [ ] **P1 · S Screen lock / secure desktop.** Pause push-to-talk and hide the kite on `lock-screen`, and resume on `unlock-screen`.
- [ ] **P0 · S `[verify]` Non-QWERTY layouts.** The paste action sends `Ctrl+V` through uiohook. On Dvorak or AZERTY, a physical-key code may produce a different shortcut. Test with at least one alternate layout and map by layout if needed.

### 3.2 Audio

- [ ] **P0 · S Mic privacy indicator.**
  - Keeping the mic stream warm shows Windows' "microphone in use" icon all the time, which looks like always-listening. It's a trust killer.
  - Better: open the mic on the **first** combo modifier going down (predictive), close it after about 3s if the combo never completes, and measure how much of the first syllable is lost.
- [ ] **P0 · S First-syllable clipping.**
  - Measure the delay from key-down to recording start.
  - If words are clipped, start the recorder on the first modifier press, as above, and keep a short pre-roll buffer.
- [ ] **P1 · M Bluetooth headsets.**
  - Opening the mic on Bluetooth headphones switches Windows to the hands-free profile. Output quality drops, and the start of TTS can be clipped.
  - Options:
    - Prefer a non-Bluetooth mic when output is Bluetooth (with a settings toggle).
    - Pre-roll a short silence before playback.
    - Wait for post-reply silence before switching back.
- [ ] **P1 · M Mic failure recovery.**
  - Handle the device being unplugged mid-recording, the default device changing, and a wedged stream that returns silence.
  - Fail over to the system default mic and tell the user through a kite reaction and bubble. Never go silently deaf.
- [ ] **P1 · S `[verify]` Pro audio interfaces.** Sample-format or sample-rate mismatches can capture silence. Resample, or pick a supported format.
- [ ] **P2 · M Muted output.** If system audio is muted, copy the answer to the clipboard and show a muted glyph with a hint. Detecting mute needs a small native call.
- [ ] **P1 · S Echo when not using headphones.** Only matters if hands-free mode is added (5.9). Require headphones or strong echo cancellation.

### 3.3 Clipboard & typing

- [ ] **P0 · S Newlines into terminals.**
  - `type_text` or dictation that contains line breaks can **execute commands** when pasted into a terminal.
  - Collapse newlines by default. Show "contains N line breaks" prominently in the approval summary, and require an explicit "paste as multi-line" confirmation.
- [ ] **P1 · M Clipboard history leak.**
  - Kite's paste-via-clipboard lands in Windows clipboard history (`Win+V`) and possibly the cloud clipboard.
  - Windows supports clipboard formats that tell history and cloud sync to skip an entry (`ExcludeClipboardContentFromMonitorProcessing`, `CanIncludeInClipboardHistory`, `CanUploadToCloudClipboard`). `[verify]` whether Electron's clipboard API can write those alongside the text in one operation, or whether this needs a tiny native helper.
- [ ] **P1 · S Clipboard restore race.**
  - Slow apps (Electron apps, remote desktops) can read the clipboard after Kite has already restored the old contents, pasting the user's old clipboard instead.
  - Increase the delay adaptively. Only restore if the clipboard still holds Kite's text. Log misses.
- [ ] **P2 · S Trailing spaces and CJK spacing** in pasted dictation.

### 3.4 Screen, overlay & multi-monitor

- [ ] **P1 · M Fullscreen apps and games.**
  - An always-on-top overlay over games and videos is annoying, and global hooks can worry anti-cheat systems.
  - Add auto-hide when a fullscreen app is in the foreground (needs a native check), a "Game mode" toggle, and a per-app disable list.
- [ ] **P1 · S Screen sharing and calls.** Kite is visible to meeting participants. Add a setting, "Hide Kite from screen shares and recordings," which keeps content protection on permanently. Default it off so demo recordings still work.
- [ ] **P1 · M `[verify]` Quiet during calls.**
  - Suppress unprompted speech, chimes, and reminder audio while another app is using the mic.
  - Candidate approach: Windows records microphone usage per app under the CapabilityAccessManager consent store in the registry. Check that an app with a "last stopped" value of 0 means "in use now."
- [ ] **P1 · S Display changes.** Handle rearranging monitors and hot-plugging. Heyclicky shipped a bug where the cursor landed on the wrong monitor after displays were rearranged. Recompute the overlay bounds and re-anchor the kite.
- [ ] **P2 · S Content-protected windows** (DRM video, some banking apps, password managers) appear black in captures. Tell the model that black regions may be protected content, so it doesn't hallucinate.
- [ ] **P1 · S Kite covering what you're reading or typing.** See improvement 4.7 ("get out of the way while typing").
- [ ] **P2 · S Screen readers.** Make sure the overlay is hidden from accessibility focus (`aria-hidden` on the kite layer) so Narrator never lands on it.

### 3.5 Network, providers & models

- [ ] **P0 · S Proxies.**
  - Node's built-in `fetch` in the main process ignores Windows system proxy settings, so corporate networks will fail.
  - Pass Electron's `net.fetch` as the `fetch` option to every AI SDK provider and to the Cartesia and Groq clients, so they follow system proxy and certificate settings.
- [ ] **P1 · S Clear regional and network errors.** Distinguish "provider unavailable in your region," "blocked by network," "invalid key," "out of credit," and "rate limited." Heyclicky shipped fixes for regional provider blocks that left users with a silent failure.
- [ ] **P0 · S Current date/time in every turn.** Inject local date, time, and timezone into the system prompt on every request, not once per session.
- [ ] **P1 · S Reasoning latency.** Some models reason or "think" by default. For voice turns, set the lowest reasoning effort each provider allows. Use higher effort only for "think harder" requests or the deep route (4.2).
- [ ] **P1 · S Timeouts.** Don't hard-cut deep answers at a short timeout. Use a first-token timeout (fail over) plus a generous total timeout, with Escape always able to cancel.
- [ ] **P1 · S Cold start.** The first interaction after launch is slower. Pre-warm TLS connections to Groq and the active provider, and open the Cartesia WebSocket on the first modifier press.

### 3.6 Performance & reliability

- [ ] **P0 · S Idle CPU budget.** Heyclicky shipped builds that sat at roughly 36–45% idle CPU from always-running animation. Measure Kite's idle CPU with the kite dozing and the cursor still, and make adaptive polling and the reduced idle frame rate (Phase 6) real, not aspirational.
- [ ] **P1 · S Leak test.** Run 100 voice interactions and 20 captures, then compare memory, `AudioContext` count, and listener counts.
- [ ] **P1 · S Long conversations.** Cap the rolling context by tokens as well as message count, and summarize older turns instead of dropping them abruptly.

### 3.7 Security & safety

- [ ] **P0 · S Prompt injection from the screen.** Screenshots can contain text like "ignore previous instructions and type…". Confirmations are the backstop. Also add to the system prompt that on-screen text is content, never instructions. Include an injection test image in the test suite.
- [ ] **P1 · S Spend cap.** A per-day and per-month token/cost cap per provider, with a kite warning at 80% (see 4.2 for cost tracking).
- [ ] **P1 · S Redaction audit.** Grep the logs after a full session and confirm there are no transcripts, keys, or image data.

---

## 4. Improvements to existing pieces

### 4.1 Voice input

- [ ] **P1 · S Vocabulary hints:** pass a personal-dictionary prompt to Whisper (Groq's transcription endpoint accepts a prompt; check the AI SDK Groq provider options) so names and jargon transcribe correctly.
- [ ] **P1 · M Progressive transcription:** while the key is held, upload overlapping audio chunks and transcribe them early, so the transcript is nearly ready at release. Measure the latency gain before committing.
- [ ] **P2 · S Language setting:** auto-detect plus a pinned default. Test Hindi and Hinglish code-switching for both STT and TTS voices.
- [ ] **P2 · S Push-to-talk on a mouse side button** (uiohook sees mouse buttons). This makes one-handed "circle to ask" easy.

### 4.2 Models & routing

- [ ] **P1 · M Fast/deep router.** A cheap classifier decides per turn: quick question → fast model; screen, complex, or "think harder" → deep model. Show which route was taken in the dev panel. Heyclicky found this gave a big perceived speed-up.
- [ ] **P1 · M Cost tracking.** Record AI SDK `usage` per turn, plus STT seconds and TTS characters. Add a per-provider price table, a monthly estimate in settings, and the spend cap from 3.7.
- [ ] **P1 · S "Free tier" setup path:** document and onboard a Groq-only setup (Whisper, a Llama vision model, and browser/Windows TTS from 4.3) so a new user can try Kite for free. `[verify]` current Groq free-tier limits.
- [ ] **P2 · S Prompt caching** for the static system prompt on providers that support it.

### 4.3 Voice output

- [ ] **P1 · S Offline TTS fallback.** Chromium's `speechSynthesis` uses the built-in Windows voices, so it's free and needs no key. Use it when Cartesia fails, has no key, or has run out of credit.
- [ ] **P2 · S Pronunciation dictionary** (for example "Kite" and project names) applied in `toSpeakable`.
- [ ] **P2 · S Speed range:** allow 0.5×–1.5× (heyclicky's range) instead of a narrow slider.

### 4.4 Bubble & conversation UI

- [ ] **P1 · S Clickable links** that open directly (after confirmation per policy), plus a copy button on code blocks.
- [ ] **P1 · S Pin bubble:** keep the answer on screen until dismissed.
- [ ] **P2 · M Expand into a mini chat panel** with scrollable history for the current conversation and an inline follow-up box.
- [ ] **P2 · S "Copy answer" and "Speak again"** buttons.

### 4.5 Actions

- [ ] **P1 · S Windows Settings deep links:** an `open_settings({ page })` tool mapped to an **allowlist** of `ms-settings:` URIs (bluetooth, display, sound, wifi, nightlight, and so on), opened with `shell.openExternal`. It's cheap, safe, and very Windows-native.
- [ ] **P1 · S Cancel window:** for actions the user has set to "always allow," wait about 3s with a visible countdown so a misheard command can be cancelled. Heyclicky added a similar 5-second cancel window for agents.
- [ ] **P2 · M `open_file({ query })`:** search Documents, Desktop, and Downloads by name, and ask when several files match.
- [ ] **P2 · S System info tool:** battery, network, time, and uptime. Read-only, no confirmation.

### 4.6 Vision

- [ ] **P1 · M "Look again" follow-ups:** keep the last capture in memory for about 60s so "and what about the button below it?" doesn't need a new capture. Clear it on timeout.
- [ ] **P2 · M Window-only capture mode:** share only the focused window, like Copilot Vision's privacy model, as a setting.
- [ ] **P2 · M OCR ("copy this text"):** circle text and say "copy this." Use the offline Windows OCR engine through a small sidecar or WinRT binding, with a WASM OCR library as a fallback. Also enable "translate what I circled."

### 4.7 Kite character

- [ ] **P1 · S Get out of the way while typing:** when uiohook sees sustained typing, the kite drifts a few px away and fades to about 40%, then returns after 2s idle.
- [ ] **P1 · S Dock mode:** the kite rests in a screen corner or on the taskbar edge instead of following the cursor. Toggle it from the tray or by voice ("go sit in the corner"). Heyclicky offers a similar dock option.
- [ ] **P2 · M Skins and colors:** a color picker and 2–3 kite variants (classic diamond, delta, box kite). Later, community skins as JSON and SVG.
- [ ] **P2 · S Time-of-day moods:** sleepier late at night, and a small "good morning" flourish on first use of the day. No notifications, just motion.

### 4.8 Settings, history & developer experience

- [ ] **P2 · S Import/export settings** (without keys).
- [ ] **P2 · S Per-app disable list** (hide the kite and disable push-to-talk in chosen apps).
- [ ] **P2 · M In-app "Report a problem"** that attaches redacted logs.
- [ ] **P2 · S Feature flags** in settings for experimental features (guide mode, hands-free).

---

## 5. New capabilities

### 5.1 Guide mode: "Show me how" · **P1 · L** (the flagship next feature)

**What:** "Kite, how do I add a footer in Word?" The kite **flies to the exact UI element and points at it**, says the step, and waits. When you click that element, it moves to the next step.

**Why:** this is the core of both heyclicky (walkthroughs) and Copilot Vision (Highlights). Kite has a unique twist: the kite itself is the pointer, so the physics you already built becomes the teaching tool.

**How:**

- **Grounding** means finding where the element is.
  1. Primary: the Windows UI Automation tree (element names, roles, and bounding boxes) through a small .NET or PowerShell sidecar.
  2. Fallback: ask a vision model for coordinates on a screenshot, then verify against UI Automation where possible.
- **Step loop:** a plan of up to about 15 steps. For each step, set the kite's spring target to the element and draw a hand-drawn ring. uiohook detects a click near the target to advance. Use a vision re-check if the UI changed.
- **Pause and resume:** keep the goal and completed steps when the user says "wait" or "continue."
- **Safety:** guide mode only points. It never clicks for you.

### 5.2 Dictation mode · **P1 · M**

**What:** hold a second combo (for example `Ctrl+Shift`) and speak, and cleaned-up text appears in whatever text field has focus. Double-tap the combo for hands-free.

**How:**

- Groq Whisper, then a **fast** cleanup pass: remove fillers, fix punctuation, resolve self-corrections, and never add words that weren't said.
- Then paste, following the newline and clipboard rules from section 3.3.
- **Personal dictionary:** used as the Whisper prompt plus post-replacement rules.
- **Snippets:** "insert my calendar link" expands to saved text.
- **Screen-aware reply (P2):** "write a reply to this" captures the screen and drafts into the focused box.

**Why:** dictation is the daily-habit feature (Wispr Flow's whole business, and a major heyclicky launch). It keeps Kite running all day.

### 5.3 Command mode on selected text · **P1 · M**

**What:** select text in any app, hold the combo, and say "make this friendlier," "translate to Hindi," or "summarize." The selection is replaced after a preview.

**How:** save the clipboard, send `Ctrl+C`, read the selection, restore the clipboard. Rewrite the text. Show a diff preview in the bubble, then paste on ✓. With no selection, treat it as a normal question.

### 5.4 Typed input mode · **P1 · S**

**What:** double-tap `Ctrl` (detected through uiohook) to open a small input box next to the kite, for quiet offices, meetings, or late nights. Answers can still be spoken, or text-only while muted.

### 5.5 Memory · **P1 · M**

**What:** Kite remembers stable facts and preferences ("I'm a full-stack dev," "keep answers short," "my project is called Kite").

**How:**

- A local `profile.md` plus `current.md`, injected into the system prompt, following the pattern heyclicky uses.
- Voice commands "remember that…" and "forget…".
- A settings view to read, edit, and delete entries.
- Never store keys, health data, or anything captured from screenshots without an explicit ask.

### 5.6 Drop files on the kite · **P1 · M**

**What:** drag a PDF, image, or text file onto the kite. It "catches" it (a physics reaction) and you can ask about it.

**How:** make the overlay interactive on `dragenter` near the kite. Extract PDF text with pdf.js, send images as image parts, and read the whole document rather than just what's visible.

### 5.7 MCP connectors · **P1 · L**

**What:** let users add MCP servers (local stdio command or remote URL). Their tools become available to Kite.

**How:**

- Use the AI SDK's MCP client.
- Every MCP tool goes through the **same** approval policy (default "always ask"), the audit log, and the step budget.
- Show connection status in settings and "test" the server on save.

**Why:** unlimited extensibility without bespoke integrations. It's also the strongest AI-engineering signal on your resume.

### 5.8 Focus & wellbeing buddy · **P2 · S**

Pomodoro timers, stretch and water reminders, and "you've been at this for two hours," all expressed through kite behaviour (a gentle tug on the string, a small bounce) rather than pop-ups. Built on the existing reminders system.

### 5.9 Hands-free mode & wake word · **P2 · L**

**What:** an opt-in continuous conversation with VAD and barge-in, plus an optional local wake word ("Hey Kite").

**How:**

- Run wake-word detection fully on-device and keep it off by default.
- Require headphones, or strong echo cancellation.
- Show a clear always-visible "listening" state on the kite.

**Caution:** heyclicky restricted its always-on mode to headphones after echo problems. Do the same.

### 5.10 Realtime speech-to-speech pipeline · **P2 · L**

**What:** an alternative pipeline using a realtime speech-to-speech model (OpenAI Realtime or Gemini Live) for the lowest latency and natural interruptions. The existing STT → LLM → TTS pipeline stays as the default and the model-agnostic path.

**How:** abstract a `VoiceSession` interface over both pipelines. Tools and approvals still flow through the same registry.

### 5.11 Local and offline models · **P2 · M**

An Ollama provider for chat (via an AI SDK community provider) and optional local Whisper. This gives a "nothing leaves my PC" mode, with honest latency expectations shown in settings.

### 5.12 Computer-use agent (v2) · **P3 · L**

**What:** Kite performs multi-step UI tasks itself.

**Rules learned from heyclicky:**

- Never move the user's real pointer. Prefer UI Automation actions over pixel clicks.
- Approvals are scoped per task: "allow once" or "this task."
- A visible stop button.
- A strict step budget.

**Recommendation:** only start this after guide mode (5.1), since it reuses the same grounding layer.

**Status: done (v1.3).** "Do it for me" tasks through a separate UI Automation + keyboard sidecar that never moves the pointer; "allow this task" or "step by step" approvals; deterministic risk checks that always ask; a card with Stop, Escape, and pause-on-takeover; a strict 15-step budget. See [docs/agent.md](agent.md) and [ADR 012](adr/012-computer-use.md).

### 5.15 Whiteboard explanations · **done (v1.3)**

**What:** Kite explains concepts end to end on an Excalidraw-style whiteboard: one model call plans a lesson of beats, and the kite draws each beat while narrating it. Follow-ups add to the same board; marks on the board name its elements. See [docs/whiteboard.md](whiteboard.md) and [ADR 013](adr/013-whiteboard.md).

### 5.13 Browser companion extension · **P3 · L**

A Chrome/Edge extension that gives Kite DOM-level page context (full page text, forms, selected elements) and reliable in-page actions. It's more accurate than pixels for web apps. It communicates with the desktop app over native messaging.

### 5.14 Skins & personality packs · **P3 · M**

Personality presets (calm, playful, sassy) that change both the system-prompt tone and the motion parameters. Also shareable skin files.

---

## 6. Deliberately not building (and why)

- **Always-on screen or activity tracking.** Heyclicky launched proactive agents and then removed them, along with all local tracking, after users felt watched. Windows Recall faced similar backlash. Kite only looks when asked, with a visible flash every time.
- **Stealth or "undetectable" features for interviews, exams, or monitored assessments.** The "hide from screen share" option exists for privacy from colleagues and viewers. Don't market or design it for concealment.
- **Moving the user's real cursor** for any automated action.
- **Accounts, a backend, or billing.** Local-first BYOK is Kite's positioning, not a missing feature.
- **A catalog of bespoke integrations** (Gmail, Notion, and so on). Use MCP (5.7) instead.

---

## 7. Suggested milestones

| Version  | Theme               | Contents                                                                                                                                                                                      |
| -------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **v1.0** | Ship                | Phase 6 plus every **P0** in sections 2–3                                                                                                                                                     |
| **v1.1** | Daily driver        | Typed mode (5.4), dictation (5.2), dock mode and get-out-of-the-way (4.7), proxy `net.fetch` (3.5), offline TTS fallback (4.3), cost tracking and spend cap (4.2, 3.7), clipboard fixes (3.3) |
| **v1.2** | Teacher             | Guide mode (5.1), `ms-settings` tool (4.5), "look again" (4.6), fast/deep router (4.2)                                                                                                        |
| **v1.3** | Extensible          | MCP connectors (5.7), memory (5.5), file drop (5.6), command mode (5.3)                                                                                                                       |
| **v2.0** | Hands-free & agents | Hands-free/wake word (5.9), realtime pipeline (5.10), computer-use agent (5.12), browser extension (5.13)                                                                                     |

**Portfolio tip:** after each milestone, record a 30-second clip and add a short "what I learned" section to the README. A visible, steady changelog is part of what makes heyclicky compelling, and it signals the same thing to recruiters.

---

## 8. Sources

- heyclicky homepage (features, pricing, FAQ, platform): https://www.heyclicky.com/
- heyclicky changelog (Apr–Sep 2026 releases, bugs, and lessons): https://www.heyclicky.com/changelog
- Copilot Vision Highlights, Windows Insider blog (May 2025): https://blogs.windows.com/windows-insider/2025/05/12/copilot-on-windows-windows-insiders-can-now-use-vision-with-2-apps-and-new-highlights-feature-with-1-app/
- Copilot Vision with Highlights, US availability (Jun 2025): https://blogs.windows.com/windowsexperience/2025/06/12/copilot-vision-on-windows-with-highlights-now-available-in-us/
- Wispr Flow features (Command Mode, dictionary, snippets, whisper mode): https://eesel.ai/blog/wispr-flow-overview and https://letterly.app/blog/wispr-flow-review/
- Electron `setContentProtection` behaviour on Windows: https://www.ioactive.com/signal-windows-desktop-contentprotection-bypass
