# Making Kite easier and more pleasant to use

**UI/UX improvement plan · 10 October 2026**  
Reviewed against local commit **9d275bb**. The issue descriptions record that baseline. Implementation progress is tracked below.

## Start here

Kite should be easy to talk to, easy to read, and quiet when you are doing something else.

Today, the experience can feel restless. The kite keeps moving, answers move or disappear, permission cards demand attention, and follow-ups look like a fresh request. Opening a task can also feel like leaving your conversation and entering a settings app.

**The first goal: make one complete interaction feel good.**

> Ask a question → read a stable answer → ask a follow-up → approve an action if needed → see the result → return to your work.

This plan covers **22 issues**. Each issue explains the problem, the proposed fix, an example, and how to check whether it worked.

### Implementation progress — 11 October 2026

**Phases 1–3 are built. Phase 3 has passed conversation, capture-policy, and native focus checks; wider desktop review is still pending.**

- New installs use **Subtle** motion and **At screen edge** placement. Kite settles without an idle floating or breathing loop. **Still** uses steady signals; **Playful** keeps optional character movement. Older Calm / Lively preferences become Subtle / Playful.
- Answers stay in place when the pointer moves, including across displays. Text appears as soon as it arrives, without waiting for speech.
- Useful answers and errors do not disappear on a timer. **Minimize** leaves a small **Show answer** button; opening it restores the answer and its size.
- **Expand**, corner resizing, and **A− / A+** make reading easier. Answer text starts at 16 px. Copy and History stay visible while the answer scrolls.
- **Stop speech** stops the current audio and keeps the answer. It does not cancel the model or turn off speech for future questions. Closing the answer also stops its speech.
- A pending permission request or reminder stays visible and cannot be hidden with the reading controls.
- Earlier questions and answers stay together. Voice and typed follow-ups use the same conversation, with no reset just because you spend time reading.
- **Ask or follow up** stays below the messages. **Enter** sends; **Shift + Enter** adds a new line. You can prepare the next question while Kite works. Sending waits until the current request or permission decision is finished.
- Closing, minimizing, expanding, and switching saved conversations preserve the conversation and its draft during the current app session. Use the tray's **Open conversation** to return to it.
- **New conversation** starts fresh deliberately. **Continue conversation** in History brings back saved questions and answers. Earlier screenshots are not reattached, and earlier actions are not run again.
- A short, silent, or cancelled hold restores the previous answer. A failed question stays available with **Edit and retry**. Scrolling up or selecting text stops new text from pulling you back to the bottom.
- **Listening** appears as soon as the hold starts. Ordinary, silent, and cancelled holds take no screenshot, so they no longer hide Kite for capture.
- A deliberate click or mark during the hold captures the display where that hold began. The pointer stays normal until marking starts. Screen-reading tools still ask for approval.
- Marked answers show **Display**, **capture time**, and **View capture**. Earlier turns clearly say that their old capture is not attached to the follow-up; the model does not receive those old pixels again.
- Kite remembers the window you left when opening its textbox and returns to it when closing. An intentional switch to another app takes priority. Paste approval names the app and window, then checks that destination again before sending Ctrl + V. A changed or closed destination stops the paste.

**Checked:** 315 main tests, 35 unit tests, the full renderer interaction suite, native settings persistence, rebuilt-app startup, and native focus/paste fixtures. Visible capture exclusion passed on the available 100% display using synthetic content. Reading screenshots cover light, dark, and high contrast.

**Limits to understand:** Sent messages are saved in History. Unsent drafts survive view changes while Kite is running; they are not saved across an app restart. The panel can show older messages, but the model receives the most recent conversation context.

**Still to do:** Test actual corner dragging, keyboard navigation and input methods, display changes, and 125% / 150% Windows scaling on a real desktop. Marked captures still use the brief hiding fallback. Removing that fallback awaits mixed-display and recording checks; ordinary voice holds already avoid it. Permission wording and the agent screens belong to later phases.

### What to fix first

1. Let the kite rest without constantly floating.
2. Keep answers still and available until the user closes them.
3. Keep follow-ups in the same visible conversation.
4. Add a clear textbox for typing questions and replies.
5. Stop unnecessary screen captures and activation flicker.
6. Make permission requests simpler and easier to answer.
7. Keep tasks and results connected to the conversation.

### How to read this document

- **Fix first:** a problem that gets in the way of everyday use.
- **Fix next:** an improvement to make after the basic interaction works well.
- **Example:** a suggested interaction, not a claim that the new behavior already exists.
- **Done when:** the practical check required before calling the issue fixed.

The review combines your reported experience, inspection of Kite's code, and official product documentation. Competitor apps were not tested hands-on. Exact visual quality, focus failures, and timing still need checks on a real Windows screen.

### Jump to a section

- [Appearance, animation, and activation](#1-appearance-animation-and-activation)
- [Reading, typing, and follow-ups](#2-reading-typing-and-follow-ups)
- [Permissions, agents, and results](#3-permissions-agents-and-results)
- [Context, controls, and accessibility](#4-context-controls-and-accessibility)
- [Phase-wise implementation plan](#5-phase-wise-implementation-plan)
- [Product references and technical notes](#6-product-references-and-technical-notes)

## The experience we should build

Kite needs three clear places:

**1. A small companion.**  
Shows whether Kite is listening or working. It stays out of the way when idle.

**2. A conversation panel.**  
Holds answers, follow-ups, questions, permissions, and results. It stays in one place. The user can expand it for longer reading.

**3. A task library.**  
Holds running tasks, saved helpers, schedules, and previous results. Users open it deliberately when they need more detail.

Settings should be easy to find, but should not be the main doorway into conversations and tasks.

> **Example:** You say “Convert this file to PDF.” Kite asks you to choose the file in the conversation. A small task card then says “Converting…” and later “PDF ready.” You open the task library only if you want more details.

This follows the useful distinction between [Raycast's quick answers and full chat][S1], [HeyClicky's agent follow-ups][S3], and [Wispr Flow's compact status bar][S4]. We should adapt these ideas to Kite rather than copy another product's appearance.

## 1. Appearance, animation, and activation

### UX-R01 — The screens do not feel like one product

**Fix next.**

**What feels wrong:** Answers, task cards, forms, and settings have different layouts and levels of detail. Small text, badges, borders, and technical information compete with the useful content.

**What to change:**

- Use the same spacing, button styles, icons, and text sizes across Kite.
- Make answers larger and easier to read. Try 15–16 px text, with a zoom option.
- Give each screen one clear main action.
- Keep technical details behind “Details.”
- Test the current kite shape against a simpler version at its actual desktop size.

**Example:** A completed PDF should show **“PDF ready”** and **“Preview”** first. Worker details and attempt counts belong lower down.

**Done when:** Users can find the answer or next action without scanning every label.

**References:** [Raycast chat][S2], [Windows text guidance][S7], [Windows consistency guidance][S5].

### UX-R02 — The kite keeps floating while you are trying to work

**Fix first.**

**What feels wrong:** Both current motion settings keep some movement. Reducing animation speed does not make the kite still.

**What to change:**

- Let the kite settle, then stay still when idle.
- Stop decorative movement while the user reads, types, or approves something.
- Offer **Still / Subtle / Playful** animation settings. Subtle should have no constant idle floating.
- Offer **At screen edge / Follow pointer / Show when invoked** placement choices.

**Example:** You are reading an article for five minutes. Kite stays quietly at the edge. When you speak, it shows a small listening signal.

**Done when:** Users can concentrate without hiding Kite just to stop the movement.

**References:** [Wispr placement controls][S4], [Windows purposeful motion][S5], [W3C movement guidance][S8].

### UX-R03 — Too many animations happen during one request

**Fix next.**

**What feels wrong:** Kite reacts to listening, thinking, model changes, approvals, and tool execution. Several movements can happen before the user gets a result.

**What to change:**

- Use a few easy-to-understand signals: listening, working, waiting, finished, and failed.
- Give each event one clear signal.
- Keep celebrations short and occasional.
- Keep buttons and text still, even when the character animates.
- Cancel an old animation when the state changes.

**Example:** For a simple question, Kite briefly acknowledges listening, shows “Thinking,” and presents the answer. Switching to another model does not trigger another performance.

**Done when:** The user understands the state without being distracted by repeated movement.

**Reference:** [Windows motion principles][S5].

### UX-R04 — Kite disappears briefly when you activate it

**Fix first.**

**What feels wrong:** Activation can look like a glitch. The code deliberately hides much of the overlay during screen capture, which is a likely cause of the reported blink. Its exact duration still needs measurement.

**What to change:**

- Show “Listening” immediately and keep it visible.
- Avoid capturing the screen for ordinary voice questions.
- Test a way to leave Kite visible on screen while excluding it from screenshots.
- Keep the current hiding method as a fallback until that alternative works reliably.

**Example:** You hold the shortcut and say “What time is it?” Kite immediately shows listening and never vanishes.

**Done when:** Voice-only activation does not hide Kite. Visual capture does not include Kite in the screenshot and always restores its display after failure.

**References:** [Wispr capture exclusion][S4], [Windows responsive motion][S5].

### UX-R05 — A voice question unnecessarily starts screen capture

**Fix first.**

**What feels wrong:** Ordinary voice holds can start a capture before Kite knows whether you will draw anything. A question that needs no screen content can still trigger capture preparation.

**What to change:**

- Treat listening and screen selection as separate actions.
- Capture when the user intentionally marks something, attaches a screen image, or approves a screen read.
- Keep hold-and-circle convenient.
- Clearly show when screen content is attached.
- Test that starting capture later does not lose the beginning of a drawing.

**Example:** “What is 12 times 8?” uses voice only. Circling an error and saying “Explain this” adds the marked screen area.

**Done when:** Voice-only questions do not capture. Marked questions still identify the correct target.

**References:** [Raycast explicit attachments][S1], [Wispr recording states][S4].

## 2. Reading, typing, and follow-ups

### UX-R06 — The answer moves when you move the mouse

**Fix first.**

**What feels wrong:** The reading bubble follows the kite and can switch sides near a screen edge. Hovering helps, but you first have to reach the moving bubble.

**What to change:**

- Choose a sensible position when the answer opens, then keep it there.
- Let the user move, resize, expand, or dock the panel.
- Let the kite sit beside the panel.
- Keep the panel inside the usable screen area.

**Example:** You move the pointer from a spreadsheet to Kite's explanation. The explanation stays where it opened, so you can select a sentence.

**Done when:** Reading and selecting text never require chasing the panel.

**References:** [Raycast expanded chat][S1], [Wispr placement][S4].

### UX-R07 — The answer disappears before you finish reading

**Fix first.**

**What feels wrong:** Answers currently close after a timer unless the user hovers or pins them. Starting another hold also resets pinning.

**What to change:**

- Keep useful answers until the user closes or minimizes them.
- Allow short notices such as “Copied” to disappear automatically.
- Make minimized answers easy to reopen.
- Add “Continue conversation” to History.

**Example:** You ask a question, spend a minute checking the answer in another app, and return. The same answer is still available at the same scroll position.

**Done when:** Reading time is controlled by the user, not by a countdown.

**References:** [Raycast persistent chat][S2], [W3C timing guidance][S9].

### UX-R08 — You have to wait for the voice to catch up before reading

**Fix next.**

**What feels wrong:** Text appears in time with speech. Hovering reveals more text, but this behavior is hard to discover.

**What to change:**

- Show text as it is generated, independently of speech.
- Optionally highlight the word being spoken.
- Add “Stop speech” and “Read aloud.”
- Stop automatic scrolling when the user scrolls up.
- Improve headings, paragraph spacing, and code-copy buttons.

**Example:** Kite is speaking a long explanation. You scan ahead, stop the audio, and keep reading. The answer stays open.

**Done when:** Reading speed and listening speed are independent.

**References:** [Raycast streamed answers][S1], [Windows readable text][S7].

### UX-R09 — A follow-up feels like starting over

**Fix first.**

**What feels wrong:** Kite retains some conversation context, but each voice hold clears the visible answer. The screen looks new even when Kite still remembers the exchange.

**What to change:**

- Show questions and answers together in one conversation.
- Keep the previous answer visible during a new hold.
- Use the same conversation for typed and spoken replies.
- Make “New conversation” an explicit action.
- Preserve the conversation when expanding, minimizing, or reopening it.

**Example:**

> **You:** Explain this error.  
> **Kite:** Explains the error.  
> **You:** Give me the simplest fix.  
> **Kite:** Adds the fix below its explanation. The earlier exchange stays visible.

**Done when:** “Why?”, “shorter,” and “what about the second one?” clearly continue the same conversation.

**References:** [Raycast follow-ups][S1], [HeyClicky agent replies][S3].

### UX-R10 — It is unclear what each textbox is for

**Fix first for replies; fix next for task forms.**

**What feels wrong:** Answers have no inline reply textbox. Task forms mix names, descriptions, source content, and task settings. A helper's description can look like instructions, although it does not control execution.

**What to change:**

- Put **“Ask or follow up…”** below the conversation.
- Label each task field by its purpose.
- Show only fields needed for the chosen task.
- Suggest a task name instead of requiring naming first.
- Keep drafts when the user switches views.
- Use Enter to send and Shift+Enter for a new line.

**Example:** A PDF form says **“Content to put in the PDF.”** A helper description says **“Description for you — does not control the task.”**

**Done when:** Users know what they are typing and do not unexpectedly lose it.

**References:** [Raycast composer][S2], [Windows text controls][S7].

### UX-R11 — Typing and pasting depend on confusing focus rules

**Fix first.**

**What feels wrong:** It can be hard to predict whether keyboard input belongs to Kite or the app underneath. The code already has special focus and click-handling rules; individual failures need live reproduction.

**What to change:**

- Voice activation leaves the working app selected.
- Clicking Kite's reply box clearly moves typing into Kite.
- Closing that box returns to the previous app when possible.
- Before pasting, show and recheck the destination.
- Prevent background events from taking keyboard focus.

**Example:** Kite asks **“Paste into Budget notes.docx in Word?”** Clicking approval must not accidentally paste into Kite's own textbox.

**Done when:** Text always reaches the intended destination, including with different keyboard layouts and input methods.

**References:** [HeyClicky focus fixes][S3], [W3C focus guidance][S10].

## 3. Permissions, agents, and results

### UX-R12 — Permission cards contain too many choices

**Fix first.**

**What feels wrong:** Users can face Start, Hands-off, Step by step, Not now, a timer, explanations, and technical details at once.

**What to change:**

- State the action and destination in plain words.
- Show one main approval button and one refusal button.
- Put advanced permission choices behind “Permission options.”
- Use specific verbs such as “Paste,” “Save PDF,” or “Start conversion.”
- Ask again when the action, destination, account, or permission changes.

**Example:**

> **Paste this paragraph into Word?**  
> Destination: Budget notes.docx  
> **[Paste into Word] [Not now]**  
> Permission options

**Done when:** Users can explain what they approved after one quick read.

**References:** [Raycast approval cards][S6], [HeyClicky scoped permissions][S3], [Microsoft interruption guidance][S11].

### UX-R13 — The permission countdown makes users rush

**Fix first.**

**What feels wrong:** Approval normally expires after 30 seconds. A countdown and late animation can pressure someone who is still reading.

**What to change:**

- Remove the animated countdown from ordinary decisions.
- Offer “Decide later” and “Cancel.”
- Keep postponed work waiting safely.
- If permission expires, offer “Review again” using current information.
- Never treat silence or timeout as approval.

**Example:** You leave to check the destination document. When you return, Kite says **“Review this action again”** instead of making you start the whole request over.

**Done when:** Users can take time to understand an action without approving stale information.

**References:** [W3C timing guidance][S9], [Microsoft decisions][S11].

### UX-R14 — Asking about permission can cancel the original request

**Fix first.**

**What feels wrong:** The current approval parser accepts a small set of yes/no phrases. Other replies can be treated as a new request and abandon the original action.

**What to change:**

- Recognize approval, refusal, questions, changes, and new tasks separately.
- Keep the action waiting while the user asks a question.
- Show a new approval when the user changes the action.
- Ask for clarification when the reply is ambiguous.

**Example:**

> **Kite:** Save this PDF?  
> **You:** Where will you save it?  
> **Kite:** Shows the destination. The original action remains waiting.  
> **You:** Use my Documents folder instead.  
> **Kite:** Shows the revised destination for approval.

**Done when:** Asking “why?” neither cancels the action nor approves it.

**References:** [HeyClicky approval continuity][S3], [Raycast inline questions][S2].

### UX-R15 — Opening Agents feels like opening Settings

**Fix first.**

**What feels wrong:** Agents lives in the same window and navigation as Settings. A voice request may direct users there to supply missing input.

**What to change:**

- Keep a small task card in the conversation.
- Collect simple missing input there.
- Open the task library only when requested.
- “Open task” should select that exact task.
- Make Conversations, Tasks, Helpers, and Schedules easy to find.
- Keep Settings secondary.

**Example:** You say **“Convert this file.”** Kite shows **“Choose a file”** in the conversation. You choose it and keep working, without opening a large settings window.

**Done when:** Starting a task, providing input, and finding its result feel like one interaction.

**References:** [Raycast quick-to-full handoff][S1], [HeyClicky task cards][S3].

### UX-R16 — Task cards cover the app and show too much

**Fix next.**

**What feels wrong:** A task card can show step counts, phases, logs, messages, decisions, and controls. It moves when it overlaps the current target, but may still cover other useful content.

**What to change:**

- Start with a compact strip: task, current action, Pause, Stop.
- Keep the strip in a predictable place.
- Let users expand details when needed.
- Show meaningful stages rather than technical step counts.
- Avoid percentage progress unless completion can actually be estimated.

**Example:** Show **“Preparing your application · Filling contact details · Pause · Stop.”** Put individual clicks in Details.

**Done when:** Users can see their app and stop the task without chasing a button.

**References:** [HeyClicky's folding task display][S3], [Wispr placement][S4].

### UX-R17 — Results are harder to find than the technical details

**Fix next.**

**What feels wrong:** Outputs appear alongside logs, attempts, revisions, and other information. Answer links copy their address rather than opening the page.

**What to change:**

- Put the result and useful actions first.
- Keep activity and technical information under Details.
- Show honest states: queued, running, ready, partial, or uncertain.
- Let normal web links open on a deliberate click, with Copy link separate.
- Attach “Ask about this” to the specific result, where the capability is supported.

**Example:** Show **“PDF ready · 4.2 MB · Size target not met”**, then **Preview** and **Save a copy**. Do not claim compression succeeded when it did not.

**Done when:** Users can open the output without understanding how the task ran.

**References:** [HeyClicky file results][S3], [Raycast answer actions][S1].

## 4. Context, controls, and accessibility

### UX-R18 — It is unclear what you are replying to or which model is used

**Fix next.**

**What feels wrong:** A task, whiteboard, and conversation can be active together. They may use different models. A short reply such as “try again” needs a clear target.

**What to change:**

- Show a label above the reply box: **“This conversation”**, **“Task: Convert invoice”**, or **“Whiteboard: TCP handshake.”**
- Let the user choose when the target is unclear.
- Put model selection in a small menu near the conversation title.
- Preserve the conversation and draft when changing models.
- Explain fallback briefly; keep key setup in Settings.
- Label old screenshots and make refresh explicit.

**Example:** While viewing a finished conversion, “try again” refers to that task. Changing the chat model does not restart the conversion.

**Done when:** The user can tell what their reply will affect.

**References:** [Raycast model controls][S2], [HeyClicky contextual follow-ups][S3].

### UX-R19 — Stop, cancel, and pause mean different things but feel similar

**Fix first.**

**What feels wrong:** A new hold can interrupt speech and reset the visible answer. Tasks, guides, and boards have their own controls.

**What to change:**

- **Stop speech:** stops audio; keeps the answer.
- **Cancel reply:** stops generating the answer.
- **Pause task:** keeps progress and waits.
- **Stop task:** ends task execution.
- A short, silent, or cancelled hold returns to the previous answer.
- Failed questions keep their transcript for editing and retry.

**Example:** You stop a spoken explanation to read it yourself. The text stays open. A PDF conversion already running continues.

**Done when:** Users know what stopped and what is still running. Resuming does not repeat an external action.

**References:** [Raycast separate running-message controls][S2], [HeyClicky recovery fixes][S3].

### UX-R20 — Guides and whiteboards feel separate from the conversation

**Fix next.**

**What feels wrong:** A guide or whiteboard has its own panel and controls. Returning to the explanation or asking a question needs a clear route.

**What to change:**

- Show the guide or board as an item in the conversation.
- Offer Open, Resume, and Ask about this.
- Keep a short guide step beside the target; put longer explanations in the reading panel.
- Preserve the current step when the user asks a question.
- Show which board element a question refers to.

**Example:** Kite points to Word's Insert tab. You ask **“Why this tab?”** It explains, then returns to the same step.

**Done when:** A follow-up helps with the current lesson rather than starting it again.

**References:** [HeyClicky walkthrough continuity][S3], [Windows connected transitions][S5].

### UX-R21 — The experience must work without precise mouse use

**Fix first.**

**What feels wrong:** Moving cards, small text, hidden controls, and timers can make reading and navigation difficult. Kite already has accessibility features; the complete journey still needs testing.

**What to change:**

- Make important actions usable with the keyboard and clearly show focus.
- Support larger text, high contrast, screen readers, and motion off.
- Keep controls inside the usable screen area.
- Reposition safely when a monitor disconnects.
- Let users return to other apps while a normal answer panel stays open.
- Manage keyboard focus carefully for genuine blocking dialogs.

**Example:** At 200% text scaling, an approval still shows its action and buttons. A keyboard user can approve or refuse without finding a moving card.

**Done when:** Core tasks work with keyboard-only input, Narrator, and different monitor scaling.

**References:** [W3C focus][S10], [dialog behavior][S12], [movement controls][S8].

### UX-R22 — “Implemented” does not mean “pleasant to use”

**Fix next, and apply throughout the redesign.**

**What feels wrong:** The earlier design document marks work done while human and live-screen checks remain. Passing a test does not settle whether the interaction feels good.

**What to change:**

Track three separate checks:

1. **Built:** the change exists.
2. **Works:** it behaves correctly on Windows.
3. **Feels good:** users can comfortably complete the interaction.

Review each improvement on the user's actual setup. Update the main design document when a proposal is adopted.

**Example:** A card passes layout tests but moves away when someone tries to click it. It is built, but the experience is not accepted.

**Done when:** Issues close after real interaction checks, not just screenshots.

**Reference:** [HeyClicky's repeated usability fixes after shipping][S3].

## 5. Phase-wise implementation plan

Build these phases in order. Each phase should leave Kite usable and give the user something noticeably better. Checked boxes mean the change is built; the phase's real interaction review must also pass before calling the experience finished.

**The order in simple words:**

1. Make Kite calm and answers easy to read.
2. Make typing and follow-ups feel like one conversation.
3. Make activation and screen capture feel reliable.
4. Make permissions easy to understand and answer.
5. Make agents and results easy to use.
6. Connect conversations, tasks, guides, and models clearly.
7. Finish the shared look and check the whole experience.

Basic readability, keyboard access, and contrast belong in every phase. Phase 7 checks and finishes them across the whole app; it is not permission to postpone them.

### Phase 1 — Calm Kite and make answers comfortable to read

**Goal:** You should be able to leave Kite on screen without it distracting you.

**What we will build:**

- [x] Let the kite settle and stay still when idle.
- [x] Add Still / Subtle / Playful motion choices and clear placement choices.
- [x] Remove repeated decorative reactions during ordinary work.
- [x] Keep the answer panel in one place when the mouse moves.
- [x] Keep useful answers until the user closes or minimizes them.
- [x] Add expand/resize controls and improve text size and spacing.
- [x] Show available text independently of speech, with a separate Stop speech button.

**Status:** Built; automated checks passed. Real desktop review pending. Phase 2 also keeps earlier answers when a new question starts.

**What this fixes:** Constant levitation, moving text panels, answers disappearing too early, and waiting for the voice before reading. Covers UX-R02, R03, R06, R07, and R08, plus the reading parts of R01 and R19.

**What will feel better:** Kite will be quieter. Reading, selecting, and copying an answer will feel like using a normal document.

**Example:** You ask for an explanation, move your mouse to another app, and return a minute later. The answer is still in the same place. You stop the audio and keep reading.

**Ready to move on when:** The kite rests still; the panel does not move while reading; answers remain available; and stopping speech does not close the answer. Check these on a real screen.

### Phase 2 — Keep one conversation and add a useful reply box

**Goal:** A follow-up should feel like continuing the same conversation.

**What we will build:**

- [x] Show earlier questions and answers together instead of replacing the answer on every hold.
- [x] Add an Ask or follow up textbox below the conversation.
- [x] Use the same conversation for voice and typed replies.
- [x] Preserve drafts when minimizing or switching views during the current app session.
- [x] Add a clear New conversation action and Continue conversation in History.
- [x] Keep the conversation when expanding, closing, and reopening its panel.
- [x] Make a short, silent, or cancelled hold restore the previous answer.
- [x] Keep failed questions available to edit and retry.

**Status:** Built; automated checks and screenshot review passed. Real desktop focus and scaling review remain pending.

**What this fixes:** Follow-ups looking like separate requests, missing typed replies, lost drafts, and accidental holds wiping the visible answer. Covers UX-R09, the conversation parts of R10 and R19, and textbox focus from R11.

**What will feel better:** You can speak, type, correct yourself, and return later without rebuilding the conversation.

**Example:** Say “Explain this error,” then type “Give me the shortest fix.” Both exchanges stay visible. Minimize Kite, reopen it, and continue with “Why does that work?”

**Ready to move on when:** Voice and text share the same conversation, earlier turns stay visible, drafts survive supported view changes, and New conversation starts fresh deliberately. Long reading must not silently reset the open conversation.

### Phase 3 — Fix activation, screen capture, and input destination

**Goal:** Invoking Kite should feel immediate and predictable.

**What we will build:**

- [x] Show Listening as soon as activation is recognized.
- [x] Stop capturing the screen for ordinary voice-only questions.
- [x] Capture a screen when the user deliberately clicks or draws a mark during the hold.
- [x] Test capture exclusion with a visible synthetic overlay on the available 100% display.
- [x] Keep the current hiding fallback until the alternative is verified on the supported setups.
- [x] Clearly show which screen content is attached and whether it is an earlier capture.
- [x] Restore the correct app after closing Kite's textbox, while respecting a deliberate app switch.
- [x] Show and recheck the destination before approved paste.

**Status:** Built; automated checks and native focus/paste checks passed. Visible exclusion passed a synthetic Windows test at 100% scaling. The shipping capture path retains temporary hiding while mixed-display, 125% / 150%, and recording-app checks remain pending.

**What is deliberately still cautious:** The paste check covers the named top-level window, not a particular textbox within it. Keep the intended field selected. If the window title changes, ask again so the destination can be reviewed afresh.

**What this fixes:** Activation flicker, unnecessary captures, surprising screen-selection behavior, and uncertainty about where typing or paste will go. Covers UX-R04, R05, R11, and the screenshot part of R18.

**What will feel better:** Kite will acknowledge you immediately. You will know when it is looking at your screen and where text will be inserted.

**Example:** “What time is it?” shows Listening without a screenshot. Circling an error attaches that region. Later, an approved paste goes into the reviewed Word document.

**Ready to move on when:** Voice-only holds do not capture or hide Kite; marked questions still target correctly; capture failures restore the display; and text reaches the intended app. Test different monitor scaling and keyboard input methods.

### Phase 4 — Make permission requests calm and understandable

**Goal:** The user should understand the decision without feeling rushed.

**What we will build:**

- [ ] Put the action and destination first in one permission card.
- [ ] Use specific buttons such as Paste into Word or Start conversion.
- [ ] Move advanced permission choices into Permission options.
- [ ] Replace the animated countdown with Decide later, Cancel, and Review again where needed.
- [ ] Keep the pending action when the user asks a question about it.
- [ ] Ask for fresh approval when the action or destination changes.
- [ ] Keep approval replies connected to the original task.
- [ ] Give Pause task and Stop task clear, separate meanings.

**What this fixes:** Overloaded cards, permission pressure, questions cancelling the request, and confusing task controls. Covers UX-R12, R13, R14, and the task-control part of R19.

**What will feel better:** Permission will feel like a short, understandable decision within the conversation.

**Example:** Kite asks “Save this PDF?” You ask “Where?” and it shows the destination while keeping the action waiting. You choose another folder, review the updated action, and approve it.

**Ready to move on when:** Questions preserve the request; changes require renewed review; timeout never means approval; and postponed actions are checked again before running. Making the card simpler must not grant broader access.

### Phase 5 — Make agents, forms, and results part of the conversation

**Goal:** Starting a task should not feel like opening another application.

**What we will build:**

- [ ] Show a small task card in the current conversation.
- [ ] Collect simple missing input, such as a file or account choice, there.
- [ ] Make Open task select the exact task in the library.
- [ ] Put Tasks, Helpers, and Schedules ahead of Settings in work navigation.
- [ ] Show compact progress with Pause and Stop; keep logs under Details.
- [ ] Ask for the task type first, then show only the fields it needs.
- [ ] Use clear field labels and preserve form drafts.
- [ ] Put the output, preview, and save actions before technical information.
- [ ] Let safe web links open deliberately, with Copy link as a separate action.
- [ ] Correct outdated capability descriptions in the interface.

**What this fixes:** The awkward agent-window handoff, crowded task cards, confusing forms, and hard-to-find results. Covers UX-R15, R16, R17, and the task-form part of R10.

**What will feel better:** You can start work, provide input, keep using your computer, and return directly to the result.

**Example:** Say “Convert this file to PDF.” Choose the file in the conversation. The card changes from Converting to PDF ready, with Preview and Save a copy. Open task shows that conversion, not the general Settings page.

**Ready to move on when:** The complete start → input → progress → result journey works without visiting Settings. Closing the panel keeps accepted background work running, and no completion steals keyboard focus.

### Phase 6 — Make it clear what you are talking to

**Goal:** Conversations, tasks, guides, and whiteboards should stay connected without mixing up replies.

**What we will build:**

- [ ] Label the reply target: This conversation, a named task, or a named whiteboard.
- [ ] Offer a short target chooser when several tasks are active and the reply is unclear.
- [ ] Add a small model menu near the conversation title.
- [ ] Preserve the conversation and draft when changing models.
- [ ] Explain a fallback model in a short message.
- [ ] Add guide and whiteboard items to the conversation with Open, Resume, and Ask about this.
- [ ] Preserve the guide step or board selection during a follow-up.
- [ ] Offer task-result follow-ups only where Kite has the required capability.

**What this fixes:** Replies going to an unclear target, disruptive model changes, and lessons feeling separate from chat. Covers UX-R18 and R20, with the result-follow-up part of R17.

**What will feel better:** You will know what “this,” “try again,” or “why?” refers to, and you can move between explaining and doing without starting over.

**Example:** While Kite points to Word's Insert tab, ask “Why this tab?” It explains and returns to the same step. Choosing another chat model keeps your draft and does not restart a running task.

**Ready to move on when:** Replies affect the visible target; ambiguous replies ask for clarification; model changes preserve work; and guide or board follow-ups keep their place.

### Phase 7 — Finish the look and check the complete experience

**Goal:** All of Kite should look consistent and feel comfortable on the user's actual setup.

**What we will build and check:**

- [ ] Finish shared button, field, card, icon, spacing, and typography styles.
- [ ] Apply one consistent set of short transitions to the new surfaces.
- [ ] Compare the current kite shape with a simpler alternative at real desktop size.
- [ ] Check light mode, dark mode, high contrast, large text, and motion off.
- [ ] Test keyboard-only use, Narrator, different monitor scaling, and monitor removal.
- [ ] Compare the old and new experience with the user and a small group of other people.
- [ ] Recheck idle CPU, memory, and voice responsiveness.
- [ ] Record Built, Works, and Feels good separately, then update the main design document.

**What this fixes:** Inconsistent appearance, unreadable or unreachable controls, remaining animation roughness, and declaring a feature done before people can comfortably use it. Covers UX-R01, R21, and R22; accessibility and user review also apply in every earlier phase.

**What will feel better:** The whole app will feel like one thoughtfully designed companion, including when you use larger text or prefer the keyboard.

**Example:** Increase Windows text size, turn motion off, and complete a conversation plus a task using the keyboard. The answer stays readable and approval buttons remain reachable.

**Ready to call the redesign complete when:** The everyday journeys below work on the real setup, the user accepts the experience, and any remaining limitations are written down. Screenshots and automated tests alone are not enough.

### How we should review each phase

1. Build the planned changes for that phase without adding unrelated features.
2. Run the relevant existing tests and check the changed interaction on Windows.
3. Try the phase's example with the user.
4. Record what improved and what still feels wrong.
5. Fix the remaining problems in that journey before calling the phase complete.

The existing product and code references under each issue explain the reasoning behind these phases. The phase order is our proposed build order, not a schedule promised by another product.

### Everyday situations we should test

1. **Read without rushing:** Look away for a minute, then return to the same answer.
2. **Move the mouse:** Select text in the answer without making the panel move.
3. **Follow up:** Say “why?” and see the reply below the earlier answer.
4. **Ask about a screenshot:** Refer to the earlier image; a new screen capture happens only when requested.
5. **Ask about permission:** Say “where will you save it?” without losing the pending action.
6. **Keep a draft:** Type half a reply, switch views, and return.
7. **Interrupt audio:** Stop speech while preserving text and background work.
8. **Choose the right task:** With two tasks running, reply to the one visibly selected.
9. **Recover safely:** Pause, resume, cancel, or reopen without repeating an uncertain action.
10. **Use accessible controls:** Repeat the important paths with keyboard, Narrator, motion off, large text, and two differently scaled monitors.

### What success looks like

These are targets to test, not measurements we have already achieved.

- Listening feedback appears quickly. Start with a 100 ms target on the measured workstation.
- No unexpected movement while reading, typing, or approving.
- No useful answer disappears because of a timer.
- No supported view change loses a draft.
- Text reaches the intended destination.
- A follow-up preserves the visible conversation.
- Permission questions stay attached to the pending action.
- Opening a task shows the right task and its output.
- Idle CPU, memory, and voice responsiveness do not worsen.

Have at least five people compare the old and proposed interaction on the same tasks. Alternate which version they try first. Record wrong clicks, interruptions, ease of reading, and whether they want to hide Kite. Use this as useful feedback, not proof that everyone will prefer the design.

## 6. Product references and technical notes

### What the product research supports

These observations were checked in official documentation on **10 October 2026**. They support the direction; they do not prove the proposed Kite design will work.

- **[Raycast Quick AI][S1]:** quick questions can become longer conversations without losing history. It also documents follow-ups and explicit attachments.
- **[Raycast AI Chat][S2]:** a dedicated reading/chat window with typed and voice input, inline questions, and model controls.
- **[HeyClicky changelog][S3]:** agent-card follow-ups, folding task displays, scoped permission, and fixes to focus, approval, and walkthrough continuity.
- **[Wispr Flow Bar][S4]:** a compact status bar with placement, hiding, taskbar clearance, and conditional capture exclusion.
- **[Microsoft motion][S5]:** movement should connect states, respond to input, and keep playful moments brief.
- **[Raycast tool approvals][S6]:** decisions appear in the conversation; advanced permission settings remain available.
- **[Microsoft text controls][S7]:** readable text and editable fields need appropriate controls.
- **[W3C movement guidance][S8] and [timing guidance][S9]:** users need control over relevant movement and time limits.
- **[W3C focus visibility][S10] and [dialog focus][S12]:** keyboard focus must remain visible and behave predictably.
- **[Microsoft dialogs and flyouts][S11]:** reserve interruptions for decisions that actually require them.

The suggested text sizes, animation durations, defaults, and layouts are our proposals. Accessibility references guide the design; this document does not claim a legal assessment or accessibility certification.

### Important details for implementation

Keep these protections while simplifying the experience:

- **Capture:** do not remove overlay hiding until another method actually excludes Kite from screenshots on supported Windows setups. Keep a visible capture indicator and restore the display after failures.
- **Permissions:** making cards simpler must not broaden access. Approval still applies to the reviewed action and destination. Changed inputs need renewed review.
- **Decide later:** changing a timer in the UI is insufficient. The task must pause safely; expired or changed information needs fresh review.
- **Permission language:** “yes, but…” is not permission to run the unchanged action. Questions, changes, refusal, and approval need different handling.
- **Conversation:** visible history and model memory are different. Keep the conversation on screen without pretending the model remembers unlimited messages or retains old screenshots.
- **Drafts:** preserve them deliberately, with an appropriate storage and deletion policy for sensitive text.
- **Results:** a converter that created a PDF does not automatically understand its contents. Offer only supported follow-up actions.
- **Links:** open safe web links through the application's validated opening path; do not allow arbitrary navigation inside Kite.
- **Retry:** an operation with an uncertain external outcome must not be repeated automatically.
- **Focus:** test alternate keyboard layouts, language input, and clicks on Kite's own controls. These should not accidentally paste into another app or pause a task.

“Agent model opens” has been covered in two places: the agent/task window in UX-R15 and the AI model menu in UX-R18. The answer panel is not currently a blocking dialog, even if it feels intrusive.

### Where the current behavior was found

These links let developers check the reasoning without adding code details to every issue:

- **Look and forms:** [text/style defaults][C01], [base controls][C02], [Agents forms and results][C04], [task styling][C03].
- **Motion:** [idle moods][C05], [animation loop][C06], [default settings][C07], [motion choices][C08], [reactions][C10].
- **Reading and follow-ups:** [answer reset, speech reveal, expiry, and controls][C09], [bubble placement][C10], [reading styles][C16], [conversation context][C17], [History][C18].
- **Capture:** [voice activation][C11], [screen capture][C12], [hiding acknowledgement][C13], [hiding styles][C14], [capture setup][C15].
- **Approval:** [permission card][C21], [task decisions][C22], [30-second expiry and yes/no parsing][C23], [reply handling][C11].
- **Window and focus:** [overlay focus][C19], [click handling][C20], [shared navigation][C24], [window opening][C25], [window size defaults][C26].
- **Task handoff and context:** [background start][C27], [command routing][C15], [model picker][C29], [guide panel][C30], [answer links][C28].
- **Previous completion claims:** [existing design document][C31].

Two useful facts to keep in mind: the conversation currently keeps up to **ten messages** and starts fresh after **five minutes** of inactivity; the answer currently has a timed lifetime based on its word count. The follow-up redesign must address both what users see and what context the model receives.

### How to close an issue

For each change, keep a short record:

> **Issue:** UX-R06 — Moving answer  
> **Built:** The panel now stays in one place.  
> **Checked:** Selection, scrolling, keyboard use, and mixed monitor scaling.  
> **User review:** The user can read and copy without chasing the panel.  
> **Remaining:** Any specific problem still seen.

Run the relevant existing tests when implementation changes. Use harmless test documents and dedicated fixtures for paste, focus, and capture. Automated checks should not use private documents, real microphones, mailboxes, or real purchases.

[S1]: https://manual.raycast.com/ai/quick-ai
[S2]: https://manual.raycast.com/ai/ai-chat
[S3]: https://www.heyclicky.com/changelog
[S4]: https://docs.wisprflow.ai/articles/1790396454-move-and-dock-the-flow-bar-on-desktop
[S5]: https://learn.microsoft.com/en-us/windows/apps/design/signature-experiences/motion
[S6]: https://manual.raycast.com/ai/ai-extensions
[S7]: https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/text-controls
[S8]: https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html
[S9]: https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html
[S10]: https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html
[S11]: https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/dialogs-and-flyouts/
[S12]: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/

[C01]: /C:/Users/dheer/OneDrive/Desktop/100x/personal/kite/src/renderer/tokens.css
[C02]: /C:/Users/dheer/OneDrive/Desktop/100x/personal/kite/src/renderer/styles/base.css
[C03]: /C:/Users/dheer/OneDrive/Desktop/100x/personal/kite/src/renderer/styles/task.css
[C04]: /C:/Users/dheer/OneDrive/Desktop/100x/personal/kite/src/renderer/agents/AgentsView.tsx
[C05]: /C:/Users/dheer/OneDrive/Desktop/100x/personal/kite/src/renderer/kite/moods.ts
[C06]: /C:/Users/dheer/OneDrive/Desktop/100x/personal/kite/src/renderer/kite/useKiteLoop.ts
[C07]: /C:/Users/dheer/OneDrive/Desktop/100x/personal/kite/src/main/settings/preferences.ts
[C08]: /C:/Users/dheer/OneDrive/Desktop/100x/personal/kite/src/renderer/kite/config.ts
[C09]: /C:/Users/dheer/OneDrive/Desktop/100x/personal/kite/src/renderer/voice/SpeechBubble.tsx
[C10]: /C:/Users/dheer/OneDrive/Desktop/100x/personal/kite/src/renderer/voice/frame.ts
[C11]: /C:/Users/dheer/OneDrive/Desktop/100x/personal/kite/src/main/voice/controller.ts
[C12]: /C:/Users/dheer/OneDrive/Desktop/100x/personal/kite/src/main/vision/service.ts
[C13]: /C:/Users/dheer/OneDrive/Desktop/100x/personal/kite/src/renderer/vision/Annotation.tsx
[C14]: /C:/Users/dheer/OneDrive/Desktop/100x/personal/kite/src/renderer/styles/capture.css
[C15]: /C:/Users/dheer/OneDrive/Desktop/100x/personal/kite/src/main/voice/service.ts
[C16]: /C:/Users/dheer/OneDrive/Desktop/100x/personal/kite/src/renderer/styles/bubble.css
[C17]: /C:/Users/dheer/OneDrive/Desktop/100x/personal/kite/src/main/ai/conversation.ts
[C18]: /C:/Users/dheer/OneDrive/Desktop/100x/personal/kite/src/renderer/components/HistoryView.tsx
[C19]: /C:/Users/dheer/OneDrive/Desktop/100x/personal/kite/src/main/window/overlay.ts
[C20]: /C:/Users/dheer/OneDrive/Desktop/100x/personal/kite/src/main/ipc/overlay.ts
[C21]: /C:/Users/dheer/OneDrive/Desktop/100x/personal/kite/src/renderer/voice/ApprovalCard.tsx
[C22]: /C:/Users/dheer/OneDrive/Desktop/100x/personal/kite/src/renderer/agent/TaskLayer.tsx
[C23]: /C:/Users/dheer/OneDrive/Desktop/100x/personal/kite/src/main/tools/approval.ts
[C24]: /C:/Users/dheer/OneDrive/Desktop/100x/personal/kite/src/renderer/index.tsx
[C25]: /C:/Users/dheer/OneDrive/Desktop/100x/personal/kite/src/main/window/settings.ts
[C26]: /C:/Users/dheer/OneDrive/Desktop/100x/personal/kite/src/main/window/size.ts
[C27]: /C:/Users/dheer/OneDrive/Desktop/100x/personal/kite/src/main/tools/impl/start_background.ts
[C28]: /C:/Users/dheer/OneDrive/Desktop/100x/personal/kite/src/renderer/voice/MarkdownView.tsx
[C29]: /C:/Users/dheer/OneDrive/Desktop/100x/personal/kite/src/renderer/components/ModelPicker.tsx
[C30]: /C:/Users/dheer/OneDrive/Desktop/100x/personal/kite/src/renderer/guide/GuideLayer.tsx
[C31]: /C:/Users/dheer/OneDrive/Desktop/100x/personal/kite/docs/design.md
