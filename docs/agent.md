# Do it for me (tasks)

Ask "write a shopping list in Notepad and save it as list.txt" or "turn on dark mode in Settings" and Kite does it: it opens the app if needed, then clicks, selects, and types through the app's accessibility controls and the keyboard. **It never moves your mouse pointer.** Turn it off in **Settings → Actions**.

## Using it

- **Start:** ask Kite to do something in an app with a tool-capable model. The approval card states the task and the app and offers:
  - **Allow this task:** ordinary steps run without asking.
  - **Step by step:** every step asks first (you can switch to "Allow the rest" at any step).
  - **Cancel.** Saying "yes" approves the task.
- **Watch:** a card shows the goal, "Step N of 15", what Kite is doing now, and the last few steps. The kite flies to each control and rings it just before using it.
- **Risky steps always ask,** even inside an approved task, and Kite asks out loud: anything that sends, deletes, buys, pays, submits, installs, or signs out; confirming a dialog about deleting or overwriting; typing in a terminal; typing into a password field or a card-like number; Enter in a messaging app; and shortcuts that close, print, or delete. Answer with the card buttons or by voice ("yes", "no", "stop").
- **Stop anytime:** press **Stop**, say "stop", or press **Escape**. Clicking or typing anywhere outside Kite pauses the task ("You took over"); say "continue" or press Resume. "wait" pauses too.
- **Questions:** if the task needs something you didn't say ("What should I name the file?"), Kite asks and waits. Just answer by voice.
- **Limits:** 15 steps per task, 8 minutes, and three failed actions in a row. Kite then stops and says where it got to.
- **Rate limits:** some provider tiers allow only a few requests a minute. When the model is rate-limited, the card says so and Kite waits (up to four times, backing off to 25 s) instead of giving up. A task on a 3-requests-a-minute account works, just slowly.

## How it works

1. **Find the app.** Kite picks the open window whose app name or title matches, or opens the app from your Start menu.
2. **Look.** A task sidecar (Windows PowerShell hosting C#, started only for approved tasks) lists the app's controls with UI Automation: names, roles, values, states, and what each supports. Only controls on screen are listed. Dialogs and menus come first. Vision-capable models may also ask to see a screenshot of that one window.
   In a browser, only the visible tab's page is listed. Edge and Chrome keep the page of every tab shown so far in the window's accessibility tree, oldest first; the sidecar drops a page whose name matches another tab in the tab strip, unless it is the page in the browser's render window. Frames inside the page and the browser's own popups stay. A page that loaded before anything asked for accessibility may have no tree yet: the sidecar asks the render window for it and looks again, waiting once at most 1.5 s.
3. **Decide.** Your model gets the goal, the steps so far and their results, and the current controls, and must choose exactly one action: click, type, press keys, scroll, wait, look, ask you, done, or give up. Kite validates it and refuses controls from an older look.
4. **Confirm and act.** Kite's code writes the step's description and decides whether it is risky. It points at the control, then acts through UI Automation (Invoke, Toggle, Select, Expand, set value, select text, scroll, focus) or the keyboard. Keys go only to the task's app: the sidecar brings it to the front, checks it is still in front before every key, and waits if you are holding a modifier.
5. **Repeat** until the model reports the task done (after checking the controls) or the budget runs out.

[ADR 012](adr/012-computer-use.md).

## Jobs (errands in a browser)

A task in a browser ("buy me 60 sachets of protein") is a **job** ([end-to-end-jobs.md](end-to-end-jobs.md)):

- **Plan.** One model call names the kind (store or form), the site and what to search for; code builds the phases: *Find it → Choose → Add to cart*, then *Check out* and *Pay*, which are yours. The card shows them as a checklist.
- **Stay on the site.** The site is the job's scope. A page anywhere else, or a `go_to` to anywhere else, asks you first.
- **Ask, don't guess.** Kite asks when the request leaves a choice open: the agent with a choice card (tap an option, or say "the first one", "the cheaper one", "neither"), and code itself before "Add to cart" when a pack size or flavour on the page was pre-selected rather than named by you.
- **Hand over at the cart.** A store job ends only when code can read the cart back from the page: "It's in your cart: …, ₹2,149. Check out whenever you're ready." Kite never checks out, pays, or types passwords, card numbers or OTPs.
- **In the background.** The site opens in a new tab, leaving your tab alone. Fields are filled and buttons clicked through UI Automation, which works while you use another app; only Enter and shortcuts need the browser in front.
- **Budgets.** About 12 steps to find, 6 to choose, 6 for the cart; past a phase's budget Kite asks "keep going?". At most 45 steps and 20 minutes.

## Privacy and safety

- Control names, values, and window titles of the task's app go to your configured model while the task runs. Password fields are never read. Screenshots, when your model asks for one, show only the task's window, appear with the **Kite is looking** indicator, and are never saved.
- App content is treated as untrusted data: the model is told never to follow instructions found in it, and every risky action still needs your OK.
- Every step is recorded in the tool audit (History and the dev panel) with its description and result.
- The guide's sidecar remains read-only. The task sidecar has no mouse code; a unit test checks it for pointer APIs, window messages, and process launching.

## Verification

- `npm test` (`tests/agent.test.cjs`): key parsing, the risk rules, commands, action descriptions, control listing (dialogs first, no password values), app matching, model output validation, and the task state machine (acting, setting and typing, approvals by scope, risky steps, strict budget, pause, takeover, questions, invalid and failed steps, a held modifier, screenshots), plus `do_task` approval scopes through the real broker.
- `npm run test:agent`: a real WinForms window operated through the real task sidecar (set value, invoke, toggle, stale refs, Unicode typing, select-all replace, key chords, line-break refusal) and an end-to-end task with a scripted decider. It checks that the mouse pointer never moved.
- `npm run test:renderer` (after a build): the approval choices, the task card, the ring, the kite pointing, and the card controls.
- `npm test` (`tests/job.test.cjs`): plans, scope, the cart read back, choices, the variant floor, and whole jobs through the session with a scripted decider. `npm run test:job -- [runs] [provider:model] [--ambiguous]`: live jobs on Kite Test Mart with a real model (needs its key in `.env`).
- `npm run measure:web`: opens Kite Test Mart (`tests/fixtures/shop`, a local fake store; `npm run shop` runs it alone) in Edge with a throwaway profile, and reads each page through the real sidecar and `formatSnapshot`. It reports element counts, snapshot time and what reaches the model, and checks that only the visible tab's page is listed. `npm run measure:web -- <url>` measures other pages, read-only. The shop's own flows are in `npm test` (`tests/shop.test.cjs`).

Still verify by hand with live models: Office, Chromium apps, and UWP apps; 125% and 150% scaling; elevated (administrator) windows, which Windows protects from other apps' input.
