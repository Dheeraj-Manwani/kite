# Kite: design

Review date: **30 September 2026**, code baseline `906a434` on `guide-mode`. Work ran from 30 September to 1 October 2026; finished items say so.

This is one document for how Kite looks, moves, and talks. It merges two earlier documents:

- **Part 1, the kite:** its shape and colors, the logo and icons, its personality and voice, its motion, where it flies, its part in onboarding, its sound, and its accessibility. Items are **K-xx**, and sections are **§K1–§K6**.
- **Part 2, everything around it:** the UI palette and type, the bubble and pills, the approval and guide cards, capture, Settings, onboarding, History, the tray menu, and the accessibility of those surfaces. Items are **UX-xx**, and sections are **§U0–§U10**.

Source comments cite this file by item (`docs/design.md K-09`, `UX-57`) or section (`§K5.4`, `§U0`).

## What's left for you

Every item that code could finish is done (see the status below). What remains needs a person, a real screen, or a decision.

**Tests with people**

- [ ] **K-13, sound cues.** Turn on Settings → Voice → **Sound cues**. Try it with at least three people for annoyance. On speakers, check that the start chirp doesn't get into the recording. They ship off by default until this is done.
- [ ] **"Which one is your cursor?"** Ask five people who have never seen Kite (§K2, risks).
- [ ] **K-04, listening.** Can five people tell "hearing me" from "not hearing me" without reading?
- [ ] **K-05, poses.** Can people name each state (listening, thinking, talking, waiting for approval, lost) from a 2 s clip seen out of the corner of the eye?

**Checks on a real screen.** My checks ran in off-screen windows on a single 100% display, so these were never seen live.

- [ ] **Mica (UX-57).** Open Settings on Windows 11. The sidebar and page should show the system backdrop; a black or flat page means it needs a fix.
- [ ] **"Let's fly" (K-07).** From the tray, choose **Replay tutorial**, then **Let's fly**. The window should close, and the kite should loop from where it was to your cursor. Try it once across two monitors with different scaling.
- [ ] **Guide placement on Word's real ribbon (K-08).** Ask "how do I add a footer in Word?". The kite should sit above or below the **Insert** tab, never over **Home** or **Draw**. `npm run test:uia` wasn't run because it opens windows on your desktop.
- [ ] **Pause and resume (K-09, UX-18).** Pause from the tray: Kite says goodbye, then reels out upward. Resume: it drifts back down and says "Welcome back." When an update is ready, the notice's **Restart** button should restart into it.
- [ ] **Screen reader (K-16, UX-91).** With Narrator on, the kite should announce its state ("Kite, listening", "Kite, thinking"), and the bubble should announce "Answer ready".
- [ ] **Mixed DPI.** At 125% and 150%, and with two displays at different scales, check the kite, the bubble's placement, and the guide ring.
- [ ] **`npm run perf` on screen.** It should show about 0.66% idle CPU and 60 fps while moving. From my session it reads 0 fps.

**Housekeeping**

- [ ] Commit `docs/design.md`. It replaces `docs/personality.md` and `docs/ui-ux-improvements.md`, which were untracked; copies are kept outside the repo. Source comments now point here.

## Status (1 October 2026)

Each item carries a **Done** or **Partly done** note with its date. The kite's rollout table is §K6.

**Done**

- Foundations: UX-01 to UX-08.
- Overlay: UX-10 to UX-18.
- Approval: UX-20 to UX-23.
- Guide: UX-30 to UX-32.
- Capture: UX-40 and UX-41.
- Settings: UX-50 to UX-57.
- Onboarding: UX-60 to UX-65.
- History: UX-70 to UX-74.
- Tray: UX-80.
- Accessibility: UX-90 and UX-91.
- The kite: K-00 to K-12, and K-14 to K-16.

**Partly done:** K-13, the sound cues. They're built and off by default; the test with people is left (see above).

**Not started:** nothing.

**How we work**

- The user reviews and commits each batch. Don't commit or stage.
- When a batch is finished:
  - Mark its items **Done, <date>.** in this document. If something is left, use **Partly done** and name what's left.
  - Record any measurements in the item's note.
  - Update this section.
- The pink budget (§U0) and the two registers apply to every change.
- Never launch or close Notepad as a test fixture. Never open the real microphone in tests.

**How to check a batch**

- Run `npm run typecheck`, `npm run lint`, `npm test` (161 tests on 1 Oct 2026), and `npm run test:unit`.
- Renderer smoke test:
  - Build the renderer alone, which takes about a second: `npx vite build -c vite.renderer.config.ts --outDir .vite/renderer/main_window --base ./ --emptyOutDir`.
  - Then run `npm run test:renderer`, once in light and once in dark. This machine's theme is dark, so to get light, wrap the test in a script that sets `nativeTheme.themeSource` first.
  - `npm start` empties `.vite`, so rebuild the renderer after it.
- Screenshots of every surface the batch touched, in light, dark, and High Contrast. For High Contrast, emulate forced colors with the DevTools protocol's `Emulation.setEmulatedMedia`.
- Kite motion, measured offscreen: about 0.17–0.19 ms of frame work, 60 fps while moving, and 20 fps while dozing. `npm run perf` reads 0 fps when started from a tool session.
- Main-process changes: `npm run test:native`.
- Packaging changes: `npm run package`, then `npm run test:startup` and `npm run test:packaged`.

## Decisions

> **Decision (30 September 2026): Kite is the pink, cursor-like sail.** The original delta-kite silhouette returns as both the character and the logo, in sail pink (a rose, `#ff426f`). The teal diamond is retired. See §K2.
>
> **Decision (30 September 2026): quiet windows, one pink kite.** The windows are neutral and native: cool slate neutrals, ink controls, and Windows 11 radii. Pink appears in five places only (§U0). The kite, its motion, its voice, and the onboarding stage carry the personality. See §U0 and UX-01.

---

# Part 1: The kite

## K1. What changed in the kite's design

The kite in `kite.webp` is Kite's **first character**. It was in the renderer from the first overlay commits (`57255ce`, `a81f34e`, `5ff1107`).

On **29 September 2026**, commit `73f3f69` ("feat: add runtime module copying and brand asset generation") replaced it:

- That commit added `scripts/brand.py`, which generates a classic diamond kite for the icon, the README, and the GIFs.
- At the same time, the on-screen kite was redrawn to match that artwork.
- The motion system (springs, moods, reactions) was not changed. It is still tuned for the old, smaller shape.

| | Before: the "sail" (in `kite.webp`) | Now: the "diamond" |
|---|---|---|
| **Silhouette** | One curved shape: a delta, or stunt, kite. It has a pointed nose, outward-curving leading edges, and a scalloped, inward-curving trailing edge. It reads like a soft mouse-pointer arrowhead. | A symmetric diamond with vertical and horizontal spars and a gold top-right quarter. It's the textbook drawing of a kite. |
| **Path** | `M-5 -16 Q12 -7 20 9 Q4 7 -1 16 Q-10 11 -19 17 Q-17 -1 -5 -16 Z`, scaled ×0.67 | `M0 -22 L19 -3 L0 24 L-19 -3 Z`, plus spars, panel, string, and bows |
| **Size on screen** | About 26 × 22 px body; about 26 × 30 px with the tail | About 38 × 46 px body; about 38 × 78 px with the tail, roughly 4× the area |
| **Tail** | Two small rotated squares (2.3 px and 1.8 px) trailing down and to the right (`config.tailDots`) | A curved string with two bow ties (four triangles) |
| **Color** | A pink gradient, `#ff426f` to `#e92c59`. No outline. | A teal gradient, `#147d80` to `#0b5965`, with a gold panel and a 1.5 px navy outline. Lighter variant in dark mode. |
| **Depth** | Flat | A soft drop shadow (`styles.css:94`) |
| **Visual parts** | One shape and two dots | A body, two spars, a panel, a string, four bow triangles, and an outline |
| **Pose at rest** | The nose points up and slightly left, back toward the real cursor (32 px left and 28 px up). It looks tethered to the pointer and seems to be "looking" at it. | Upright and symmetric, with no natural facing direction |

**Leftovers from the first kite in the kite's code:**

- The pink variables at `styles.css:6`. They are overridden at `styles.css:92`, not removed.
- The gradient id `kite-pink`.
- The unused `config.tailDots`, `bodyWidth`, and `bodyHeight`.

The surfaces around the kite also still use pink-era colors. Cleaning those up is UX-01.

To recover the original shape exactly, run `git show 57255ce:src/renderer/kite/KiteRenderer.tsx`.

---

## K2. The two designs, and the decision

### The diamond (today)

**What works**

- It says "kite" instantly to anyone, which makes it a good illustration.
- The teal-and-gold palette is calm and distinctive.
- At 256 px, on the app icon and in the README, it looks clean and friendly.

**What doesn't work for a companion**

- **It's a picture of a kite, not a character.** It is symmetric and static, so it has no nose, no gaze, and no direction. Every emotion has to come from rotating or moving the whole object.
- **Pointing is ambiguous.** In guide mode, the kite rotates so its top corner faces the control. On a symmetric diamond, "top" isn't obvious, so the gesture relies on the tail to show which way is forward.
- **It has too much detail at 40 px.** About nine visual parts sit in a 38 × 78 px box right beside the cursor. On busy interfaces such as ribbons and IDEs, it reads as clutter. It also covers about four times the area of the old kite.
- **It lost the core metaphor.** Kite is "a little company beside your cursor". The old shape rhymed with the cursor. The diamond doesn't.
- **The bow ties turn to noise at small sizes.** You can see this in today's 16 px tray icon (§K2, "The kite as a mark").

### The sail (original)

**What works**

- **It rhymes with the cursor.** It's a soft, friendly second pointer, which is the whole product idea in one shape: "I'm here with your pointer, and I point too." It suits guide mode (the nose is the pointer), circle to ask (the nose is a pen nib), and simply following you around.
- **It has a face without having a face.** The nose is the gaze. Tilting it reads as attention, curiosity, or doubt, the way the Pixar lamp emotes with its head.
- **It's a real kind of kite.** Delta and stunt kites are the agile ones that do loops and dives. That gives an authentic source for personality: loops for joy, dives for "follow me", and a tug on the string for "hey".
- **One silhouette reads at any size.** It works at 16 px in the tray, at 26 px beside the cursor, and at 512 px as an app icon. It's also a single path, which makes it easy to morph: billow, slacken, stretch (§K5).
- **It's small.** It covers less of the user's work.

**Risks, and how to handle them**

| Risk | Mitigation |
|---|---|
| **It could be mistaken for the cursor.** | Never use cursor colors (white or black). Keep the nose slightly rounded, since real cursors are sharp. Keep the tail dots, the constant offset, and the gentle living motion. Test it by asking five people, "Which one is your mouse?" |
| **Without the tail, it's less obviously a kite.** | The tail dots and the signature moves (loops, tugging) carry the kite idea, and so does the name. It doesn't need spars. |
| **With no outline, it can vanish on backgrounds of the same color.** | Add a 1 px halo or a tight 1–2 px shadow instead of a hard outline. |

### Decision

> **Kite is the pink, cursor-like sail.** The original delta-kite silhouette returns as both the character and the logo, in sail pink. The teal diamond is retired.
>
> Decided 30 September 2026.

#### Shape

Use one silhouette everywhere: the kite on screen, the UI mark, the tray icon, the app icon, the installer, and the README art. Start from the original path (`57255ce`), with three refinements:

| Refinement | Why |
|---|---|
| **Round the nose slightly** (about a 1.5 px radius at 26 px) | Real cursors have a sharp point. A soft nose keeps the kite from being mistaken for the pointer. |
| **Use a 1 px halo instead of an outline:** ink on light desktops, a faint light rim on dark ones | It keeps the kite visible on pink and red backgrounds without the heavy outline of the diamond. |
| **Use three tail dots instead of two,** each on a lagging spring | The tail becomes the listening meter and the "…" thinking pulse (§K5). |

Keep these from the original:

- **Size:** about 26 × 30 px with the tail.
- **Position:** offset 32 × 28 px from the cursor.
- **Resting pose:** the nose points back toward the cursor. The sail leans −35° (`config.baseAngle`), and the mark and icons use the same angle, so the tail streams diagonally away from the cursor. The original leaned only about −11°. At large sizes that read as an umbrella: the fold, the scalloped hem, and a tail hanging straight down like a handle.

#### Size

Offer three sizes: **Standard** (1×, the default), **Large** (1.3×), and **Extra large** (1.6×). They map to the existing `config.scale`. A 26 px companion can be too small on 4K displays and for users with low vision. The setting's control appears in Settings → General (UX-50).

**Status, 1 Oct 2026 (K-14).** Done: **Kite size** in Settings → General (`kiteSize`, `kiteSizes` in `shared/release.ts`).
- **What scales.** It sets `config.scale` live. The kite, its offset from the cursor, the tail, the shutter ring, and the success loop all scale.
- **The bubble.** Its gap from the kite grows (`11 + 13 × scale`, 24 px at Standard), so it stays clear of the wings.
- **Guide placement.** It keeps a bigger kite further from the target.
- **Not included.** The onboarding stage keeps its own sizes.

#### Color

**Sail pink** is the kite's color. A companion's first job is to be findable at a glance. Warm pink is rare in Windows app chrome, which is mostly blue, grey, white, and dark. Teal sits close to many app accents and blends in. The UI around the kite uses cool slate neutrals (UX-01), so the kite is the one warm thing on screen.

Sail pink is a **rose**, at a hue of 346°. It is not a coral. Coral sits at about 16°, on the far side of the error red (5°), so moving the kite toward coral would take it straight through the error color.

| Kite token | Value | Used for | Contrast |
|---|---|---|---|
| `--kite-body` → `--kite-shade` | `#ff426f` → `#e92c59` (the original gradient) | The sail, in both themes | 3.4:1 on white; 3.1:1 on the light window background (`#f4f5f7`); 4.9:1 on the dark one (`#1c1f24`); 4.8:1 and 5.5:1 on the onboarding stage. Graphics need 3:1. |
| `--kite-tail` | `--kite-shade` | The three dots | Same as above |
| `--kite-halo` | Ink `#1b212a` on light desktops; a faint light rim on dark desktops and on the onboarding stage | A 1 px edge that keeps the kite legible on any background. It's required on light backgrounds, where the sail is only just above 3:1. | — |

**Guardrails**

- **Rose, never red or coral.** Errors use a separate red (`--danger` in the UI). In dark mode that red leans orange (`#ff7a64`, 9°), so it never meets the kite's hue. The kite never reads as an alert.
- **The kite is the only large pink thing on screen.** Apart from the kite, the UI uses pink in only four small places: the sail mark, the focus ring, the selected-item pill, and the current progress step (§U0).
- **Color skins stay possible.** The color is a token, so teal or other skins can come later without redesigning anything (K-15).

**Status, 1 Oct 2026 (K-15).** Done: **Kite color** in Settings → General, with a live preview.
- **What changes.** The skins (`kiteSkins`, `[data-skin]` in `kite.css`) set only `--kite-body`, `--kite-shade`, and the tail. The companion, the onboarding stage, and the "Kite is looking" dot follow them.
- **What doesn't.** The logo stays rose everywhere (`--brand-*`): the sail mark, the tray, and app icons. High Contrast still draws the kite in system colors.

| Skin | Body → shade | Hue | Worst contrast on white, the window backgrounds, and the stage |
|---|---|---|---|
| Rose (default) | `#ff426f` → `#e92c59` | 346° | 3.07:1 |
| Teal | `#0e9a91` → `#0a8279` | 176° | 3.18:1 |
| Violet | `#9a6bff` → `#8452f5` | 259° | 3.25:1 |
| Sky | `#2a8fdf` → `#1d79c4` | 206° | 3.16:1 |

All keep clear of the error red, the gold "look here" color, and success green. Sky sits near the Windows accent blue, so it's the least findable of the four; rose stays the default for that reason.

#### The kite as a mark

The sail is the logo at every size. These items came over from the UI review, because the icons *are* the kite.

| Where | Size | Design | Today |
|---|---|---|---|
| **UI mark** (nav, card headers, History avatar) | 16–20 px inline SVG | Sail plus one dot | A Unicode ◇ glyph |
| **Tray icon** | Hand-drawn at 16, 20, 24, and 32 px, pixel-snapped | Sail plus one or two dots. At 16 px, the sail alone may read better. | PNGs downscaled from a 128 px drawing. At 16 px, the tail and bow ties turn to noise. |
| **Tray states** | Same | **Paused:** outlined or dimmed. **Update ready:** a small corner dot. | No paused variant. The update badge covers a quarter of the icon. |
| **App icon** (`kite.ico`, taskbar, Start menu, installer) | 16–256 px | Transparent background, with the sail filling about 80% of the canvas and a subtle two-tone depth. 16 and 24 px are checked by hand. | `icon()` in `brand.py` paints an opaque cream square behind the kite, so it shows as a pale tile among Windows 11 icons. |
| **README hero, social preview, installer GIF, feature GIFs** | — | Regenerated from the same source, keeping the "interface illustration" labels | Diamond artwork |

#### What this retires

- The diamond in `KiteRenderer.tsx`.
- The diamond artwork generated by `scripts/brand.py`: the icon, tray icons, social preview, and GIFs.
- The teal `--kite-*` overrides at `styles.css:92-93`.

These are replaced by K-02, K-11, and K-12 in §K6.

---

## K3. Current personality: what Kite does today

This section describes today's behaviour, taken from the code, so you can see the starting point.

### K3.1 The character in words

The copy is first-person, warm, modest, and slightly playful:

- "Hello, I'm Kite", "Let me hear you", "Nice — I felt that! ✦", "Let's fly"
- "Paused — see you soon.", "Welcome back.", "On it…", "Okay, cancelled."
- "All done — nice work!", "I only point; you click.", and in the installer, "Kite is landing…"

**Implied traits:** attentive, helpful, humble about control (it asks, points, and never clicks), and a little whimsical.

### K3.2 Always-on behaviour: following the cursor

- **Follow.** The kite rides a spring (stiffness 420, damping 38) to a point 32 px right of and 28 px below the cursor, so it always sits at the pointer's lower right.
- **Bank.** It tilts into horizontal movement, by up to 3°.
- **Stretch.** It can stretch along its direction of travel, but this is currently disabled (`stretchGain: 0`, `maxStretch: 1`).
- **Blend.** Moods blend in over about 0.25 s, so there are no snaps.
- **Display changes.** When the display layout changes (a monitor is added or removed, or scaling changes), the kite re-centres instantly at the cursor.
- **Performance.** When the cursor is still and the kite is dozing, frames drop to about 20 fps. Cursor polling slows to 100 ms after 2 s without movement.

### K3.3 Moods: the main states

`KiteMood` has four values. The table shows how large each motion actually is on screen, after the global `personalityAmount = 0.12` scaling (`config.ts:11`).

| Mood | When | What changes | Visible? |
|---|---|---|---|
| **idle** | Default | Bobs about **0.26 px**. Tail wags about **0.15 px**. | Effectively still |
| **listening** | Hotkey held | Slightly stiffer follow (×1.07). Tail wags at 10 Hz by 0.2 px plus mic level × 1.6 px, so **up to 1.8 px**. | Barely. The bubble's "Listening…" does the work. |
| **thinking** | After release, until the first token | Sways with a tilt of about **2°**. After 3 s ("working hard"), the tail wags at 5 Hz, about 0.9 px. If you marked something, the kite drifts up to about 17 px toward the mark and squashes to 0.78 (peering). | Only the peering is clearly visible |
| **talking** | While the answer streams or plays | Bobs up to about 0.5 px and lifts up to 2 px with the speech level. The tail stays at 0.35 px or less. | Barely |

### K3.4 Idle sub-behaviours

These come from `behaviors/index.ts`.

| Behaviour | Trigger | Motion | Status |
|---|---|---|---|
| content | Normal movement | None | On |
| excited | Cursor faster than 1,100 px/s | More tail wag, capped at 0.35 px | On, but invisible |
| bored | 8 s without movement | Drifts 0.7 px and tilts 1.4° | On, but nearly invisible |
| dozing | 30 s without movement | Opacity 97%, slower bob, 0.6 px droop, lower frame rate | On, but nearly invisible (the frame-rate saving is real) |
| wake hop | Movement after bored or dozing | Squash, then stretch. The 7 px hop is also scaled by 0.12, so it's under 1 px. | **Off** (`automaticOneShots: false`) |
| gust | Random, every 6–15 s | A flurry of wind | **Off** |
| dizzy | Shaking the mouse | A 360° spin | **Off.** It fires only from the dev panel. |

### K3.5 Reactions: one-shot gestures of about 1.2 s

These are defined in `voice/frame.ts`. Reactions are **not** scaled down by `personalityAmount`, so they are the gestures users actually notice.

| Reaction | Fired by | Motion |
|---|---|---|
| perk | Hotkey pressed; a new guide starts | Squashes to 0.88, then stretches to 1.1 |
| aha | First answer token | 3 px hop |
| happy | Every completed answer; resume after pause | A 1 px bounce and a slightly livelier tail. The gold sparkle never shows for *happy*: its opacity is tied to `flash`, which only *success* and *costume* set. |
| puzzled | Tap too short, or silence; guide can't find the control | 9° head tilt and a droop |
| tangled | Model error; failed tool; app fault | Fast ±6° shake |
| flinch | Cancel or Escape | 2 px hop |
| phew | Fell back to the backup model | ±8° wobble |
| costume | Model changed; vision model used (half strength); update ready (half strength) | **A full 360° spin** and a flash. At half strength, the spin is scaled to **180°**, so the kite hangs upside down until the reaction ends at 1.2 s, then snaps upright. A screenshot taken 0.3 s after "update ready" caught it at about 160°. |
| proposing | Approval card shown (held until you decide) | Leans about 8° toward the bubble and hovers |
| approved | You approved; guide step completed | 8 px hop and stretch |
| denied | You declined, or it timed out | Droop and head-shake |
| executing | Tool running | Fast ±4° jitter |
| success | Tool succeeded; guide finished | **A full 360° spin**, a 5 px hop, a flash, and a sparkle |
| alarm | Reminder fires | Bounces 7 px, wiggles ±9°, and the tail swings 4 px, **for 10 s** |

### K3.6 Special poses

| Situation | What the kite does |
|---|---|
| Drawing (circle to ask) | Flies to the pen tip on a four-times-stiffer spring and squashes to 0.88, as if it's holding the pen |
| Screen capture | Flashes at `brightness(2.5)` and squashes to 0.65 for 180 ms, like a camera blink |
| Guide mode | Flies on a soft, slightly bouncy spring to a spot beside the control, turns its top corner to aim at it, and pokes 5 px toward it every 1.8 s. It returns upright the short way round. |
| Paused | Flies up and off the screen (`translateY(-120vh) rotate(-12deg)`). On resume, it reappears at once, because the transition only exists on the way out, and plays *happy*. |
| Muted | A 🔇 emoji appears beside the kite for 1.5 s |
| Eyes | Two dots, a blink cycle, and look-at logic all exist, but they're **hidden** (`eyes: false`) |
| Reduced motion | Tail wag, bank, tilt, spins, and gusts are removed, bob is reduced to 25%, and damping is raised |

### K3.7 My read of the current personality

1. **Most of the personality is invisible.** Moods and idle behaviours are scaled to 12%, and the tail moves less than a pixel. What users actually see is the follow, plus the reactions.
2. **The biggest gesture means three things.** The 360° spin plays for success, for a model change ("costume"), and for "update ready". A signature move should have one meaning.
3. **Listening and thinking can't be read on the kite itself.** In a push-to-talk app, "I'm hearing you" is the most important feedback there is, and today only the bubble's text carries it.
4. **The idle state is calm, which is good, but also inert.** The wake hop and gusts are coded but switched off. Off is the right default, but it leaves no small moments of life.
5. **Some cues break the style.** The 🔇 emoji and the washed-out capture flash don't match a vector character.
6. **A half-strength spin leaves the kite upside down.** `costume` at intensity 0.5 (vision routing, update ready) scales the spin to 180°, holds it there, then snaps back when the reaction expires. This is a defect, not a style choice.
7. **Finishing an answer shows nothing.** *happy* is a 1 px bounce, and its sparkle never renders, so the most common moment of all ("here's your answer") has no expression.
8. **In guide mode, the kite can cover the next control.** `layoutGuide` tries the right side of the target first (`shared/guide.ts:59-64`). On ribbons and toolbars, neighbouring controls sit to the left and right, so the kite lands on the next label. The fixture screenshot showed it sitting over the neighbouring tab.

The foundation is excellent: a spring rig, blendable moods, a reaction envelope, and audio and speech levels already wired into the loop. The work ahead is expression design, not engineering.

---

## K4. The personality to aim for

### Character brief

> **Kite is a small delta kite on your cursor's string. It is attentive, light, and honest. It points; it never grabs.**

| Trait | Looks like | Never |
|---|---|---|
| **Attentive** | Perks when you press the hotkey, its tail answers your voice, and it looks at what you marked | Ignores you, or hides that it is listening |
| **Light** | Small, airy motion with wind in it; gets out of the way while you read | A bouncing mascot, confetti, or constant idle tricks |
| **Honest** | Says what it's doing and what leaves your PC, and admits when it's lost | Fakes certainty, or acts without asking |
| **Playful, sparingly** | One kite trick at a real moment of success | Tricks that distract you from your work |

### Three motion principles from the kite metaphor

1. **The wind.** Everything has a little secondary motion: the trailing edge flutters and the tail lags behind. This is what makes the kite feel alive when nothing is happening. Keep it small (1–2 px), slow, and visible, instead of today's sub-pixel motion.
2. **The string.** You hold the string, so you're always in control. The kite stays tethered to your cursor, leaves only to point at something, and always comes back. In guide mode, a faint dotted "string" from your cursor to the kite could show that connection and lead your eye to the target.
3. **The nose.** The nose always means "look here". It shows attention (tilting up toward you while listening), curiosity (turning toward your mark), and instruction (pointing at the control). It is also the pen nib when you draw.

### Rules

- **Readable without text.** Every state (listening, thinking, talking, waiting for approval, lost) must be recognizable from the corner of your eye, without reading anything.
- **Expression in proportion.** Small events get a small gesture. The big tricks are saved for a few moments.
- **One gesture per event.** Don't stack a sparkle, a spin, and a hop.
- **Calm while you read.** While an answer is on screen, the kite holds still apart from its breathing.
- **Reduced motion keeps meaning.** Under reduced motion, states show through pose, shape, and opacity, not movement.

### Voice: how Kite talks

These rules apply to everything Kite says: spoken replies it scripts itself, bubbles, pills, notices, onboarding, and approval wording. The UI document uses them for all of its copy.

- **First person, talking to "you."** For example, "I can't hear you." The one exception is the system privacy indicator, "Kite is looking", which is a statement about the app.
- **Short, one idea per sentence.** Status text fits on one line.
- **Say what happened, then what to do.** For example, "I can't spot 'Insert' yet. Bring Word to the front and I'll keep looking."
- **Honest about limits.** Never "Something went wrong" without a next step.
- **Playful only at warm moments** such as welcome, success, and finishing onboarding. For example, "Let's fly", "All done — nice work!". Never in errors or permission requests.
- **Plain words for permissions.** Use the action as the question and the button: "Open Spotify?" with the buttons "Open Spotify" and "Not now".
- **No internal names.** No tool ids (`open_app`) or mark types (`enclosure`).
- **No decorative glyphs or emoji in text** (✦, ◇, 🔇). Put the expression in the kite instead.

| Today | Better |
|---|---|
| "Your permission" / "✓ Do it" / "✗ Cancel" | "Open Spotify?" / **Open Spotify** / **Not now** |
| "(answered by Claude Sonnet 5)" | A model chip that reads "Claude Sonnet 5" |
| "Nice — I felt that! ✦" | "Nice — I felt that!" (the kite perks instead of a glyph) |
| "?" (a tap that was too short) | "Hold a bit longer while you speak." |
| "Marked: enclosure" | "Circled" |

### Sound (optional, free)

Short **earcons generated with WebAudio oscillators**:

- a rising two-note chirp when listening starts
- a soft falling note on release
- a gentle chime when approval is needed

They need no audio files or licenses and take only a few lines of code. Earcons confirm capture without looking at the screen, which is standard for push-to-talk. Ship them either off by default, or at low volume with a toggle in Settings → Voice. Test with users before deciding.

**Status, 1 Oct 2026 (K-13).** Built in `voice/earcons.ts` and off by default, behind **Sound cues** in Settings → Voice. Turning it on plays the chirp and the release note as a preview.
- **The cues.** Listening starts with a 660 → 880 Hz chirp. Release is a 620 → 440 Hz glide. Approval is an 880 Hz chime with 1320 Hz layered on it.
- **Level.** All three are sine tones with soft edges, at a peak gain of 0.05.
- **Still to do.**
  - The test with at least three people for annoyance.
  - A check of whether the start chirp, which plays as the microphone opens, gets into the recording on speakers.

---

## K5. Animating the sail, for free

"Free" here means three things:

- **No paid tools or licenses.**
- **No new runtime dependency.**
- **No measurable CPU cost** beyond today's single animation loop.

The plan below achieves all three.

### K5.1 Approach: a parametric sail in the existing loop

Today the renderer writes transforms to fixed SVG paths. The change is to make the sail's **shape** a handful of spring-driven parameters, and rebuild one `d` attribute per frame. The original path has four vertices and four control points, so it maps naturally to these parameters:

| Parameter | Effect |
|---|---|
| `nose` | How far the tip extends and how sharp it is. Extended reads as alert; rounded reads as relaxed. |
| `spread` | How far apart the wingtips are. Wide reads as open or confident; narrow as tucked in or shy. |
| `billow` | How much the leading edges curve outward. Full reads as breathing in or listening; flat as slack. |
| `slack` | How deep the scallops in the trailing edge are. Deep reads as floppy or sleepy; shallow as taut. |
| `flutter` | A small ripple that travels along the trailing edge. This is the wind, and the voice. |

Each state sets target values, and the existing `stepSpring` moves toward them. The tail becomes **three dots, each on its own lagging spring** behind the body. That alone makes the motion read like a real kite tail. The tail's rhythm (dot spacing and the "…" timing) is one shared constant, which the UI's loading motif reuses (UX-06).

**Why this is the right kind of free**

- **No new dependency.** It reuses `physics/spring.ts` and the one animation loop, and the dozing frame-skip still applies.
- **Low cost.** Building a four-segment path string per frame is negligible next to today's transform writes.
- **Live input.** It reacts to values that already exist: `runtime.audioLevel` (mic), `runtime.speechLevel` (playback), and word timestamps. A pre-rendered animation (Lottie, GIF) can't respond to your voice like this.
- **Tuning tool included.** The dev panel (Ctrl + Shift + D) already has sliders. Add one slider per shape parameter and one button per state.

**Designing the key poses, also free**

- Draw 6–8 poses (rest, listen, think, talk, proud, droop, point, sleep) in **Inkscape** or **Penpot** (both open source), or in **Figma's free plan**. Keep **the same number of points and commands** in every pose, so the loop can interpolate between them.
- Copy the numbers into a small `poses.ts`. The parameters in the table above are the named dials between those poses.

**What not to add**

- **Lottie:** its timelines can't follow live mic levels, and the runtime is heavy for this job.
- **A tween library:** springs do this job better for a physical character.
- **Rive:** the README mentions a future Rive renderer. Its runtime is open source, but check the editor's current plan terms before depending on it. This plan doesn't need it.

### K5.2 Listening: the most important animation

Push-to-talk depends on this moment. It's split into four beats, and each beat answers a question the user has.

| Beat | User's question | Sail | Tail dots |
|---|---|---|---|
| **1. Press** (0–150 ms) | "Did it register?" | Anticipation: a quick squash to about 0.88, then it perks up. The nose lifts and turns about 10° toward the cursor, and `billow` rises. | Gather close under the body |
| **2. Hold, voice present** | "Is it hearing me?" | Stays inflated and attentive, with a tiny `flutter` that follows your voice | **A live level meter.** Each dot grows and shifts with the mic level. Dots 2 and 3 lag slightly, so your voice visibly flows down the tail. |
| **3. Hold, no voice for about 1.5 s** | "Is my mic working?" | The nose drops slightly. After about 3 s, a small puzzled tilt. | Dim and settle. The listening pill shows "I can't hear you" (UX-12). |
| **4. Release** | "Did it send?" | A small nod | Zip up into the sail (swallowed), then thinking starts |

Beat 3 is new behaviour, and it's valuable: silent or stuck microphones are a known problem for this kind of app (see [roadmap-and-pending-1.md](roadmap-and-pending-1.md)).

**Reduced motion:** use a static listening pose, with the nose up and the dots lit. The level shows as dot brightness only. There's no flutter, bob, or squash.

### K5.3 The other states

| State | Sail pose | Tail dots | Body motion | Reduced motion |
|---|---|---|---|---|
| **Idle** | Rest pose, with slow breathing: `billow` ±2% at about 0.2 Hz | Hang, and lag behind movement | Follows and banks, as today | Rest pose, no breathing |
| **Thinking** | Slightly narrowed; nose tilted about 10° | A "…" wave that runs through the dots in sequence (1.2 s loop), which everyone reads as thinking | Slow sway. If you marked something, the nose turns to the mark (the existing look logic). | Static dots, with the middle one lit |
| **Working hard** (over 3 s) | Taut, with `slack` reduced | The wave speeds up | Short gusts flutter the trailing edge | Unchanged |
| **Talking** | `flutter` follows the speech level, with small nods of the nose on word boundaries (timestamps exist) | Bounce with syllables | A tiny lift with loudness, as today | Pose only |
| **Waiting for approval** | Nose points at the approval card, like today's lean | A gentle tick-tock | Hovers, with one soft nudge in the last 5 s of the countdown | Pose only |
| **Approved** | The sail snaps taut | Flick up | A short hop, as today | The snap only |
| **Declined** | The sail deflates (`billow` down, `slack` up) | Drop | A small droop | Pose only |
| **Lost (guide) / puzzled** | Nose tilts sideways | One dot pops up like a question mark | A small head tilt | Pose only |
| **Error (tangled)** | Crumpled pose | Cross over each other, tangled | A short shake | Pose only |
| **Drawing** | The nose becomes the pen nib, and the ink comes from the tip | Trail the pen | Flies to the pen, as today | Unchanged |
| **Capture** | A shutter blink: a quick squash, plus one thin gold ring that flashes around the kite. This replaces today's `brightness(2.5)` white-out, which washes the kite to near-white. | A quick blink | None | The ring only |
| **Guide pointing** | Nose on the control. The sail finally makes this unambiguous. | A faint dotted string back toward the cursor (optional) | A poke every 1.8 s, as today. See §K5.6 for where the kite sits. | No poke |
| **Muted** | Unchanged | Dots grey out, with a small slash across the tail (replaces 🔇) | None | Same |
| **Dozing** | Slack pose, nose drooping | Rest | Slow and low, and the frame rate drops, as today | Slack pose |
| **Waking** | Stretches, then goes taut | Shake out | The existing hop, turned on but at most once a minute | None |
| **Paused / resumed** | Reels out upward on pause, then drifts back down on resume | The tail trails behind | Like today, but as a flight path rather than a slide, in both directions | Fade |
| **Reminder** | A **tug**: it keeps pulling toward the bubble, like a kite pulling on its string | Swing | A shorter version of today's 10 s alarm: 3–4 s, then it settles | A steady pulse on the dots |

**Status, 1 Oct 2026 (K-04, K-05).** The pose table is `src/renderer/kite/poses.ts`. The loop picks the pose: a brief reaction wins for about a second, then tools, then the mood. The sail's four shape dials, the nose turn, and the lift ease toward the pose on springs, and each tail dot takes an offset, a size, and an opacity from it. The "…" wave uses `--rhythm-beat` from `tokens.css`, the same beat as the UI's dots. Release plays a new `nod` reaction. After 3 s of silence the kite gives one puzzled tilt. While talking, the nose dips briefly as each word starts, using the TTS word timings; providers without timings get flutter only. When an approval enters its last 5 s, the kite gives one soft nudge toward the card. The pause flight and the reminder tug came with K-09 (§K5.4).

**Status, 1 Oct 2026 (K-10).** Nothing filters the kite any more, and it carries no emoji.
- **Capture.** A capture squashes the kite to 0.65 and dims its tail for 180 ms. One thin gold ring (`.kite-shutter`) opens from 14 to 22 px around it and fades over 400 ms. Under reduced motion only the ring shows, at a fixed size.
- **Muted.** The dots turn slate (`--kite-muted`), and a haloed "/" strikes through the middle dot for 1.5 s. The slash crosses the tail almost at right angles. Slashes at 60° and 35° to the tail read as a dagger or as part of the tail.
- **Flash.** The flash of *success* and *costume* used to be a `brightness()` filter. K-09 replaced both reactions. The glint that stood in for the flash (the sail's own gradient mixing up to 35% toward white, `--kite-glint`) now serves only as the colour ripple under reduced motion.
- **High Contrast.** The ring is Highlight; the muted dots and slash are GrayText.
- **Cost.** Frame work is unchanged within noise: 0.20 ms idle and 0.17 ms moving, at 60 fps.

Frame work is 0.17–0.19 ms (it was 0.14 ms before the tail and poses), at 60 fps while moving and 20 fps while dozing.

### K5.4 Signature moves: rare, real kite tricks with one meaning each

**Status, 1 Oct 2026 (K-09).** All five moves are built, one meaning each. Nothing spins in place, flashes, or sparkles any more. The paths are in `kite/flight.ts`, and the overlay loop plays them.
- **Loop-de-loop.**
  - *Success* (a tool, a guide, a task, or a whiteboard finishing): a 28 px loop in place over 1 s. It climbs first, then swings round on the side away from the bubble, and the bubble holds still meanwhile.
  - "Let's fly" flies the long version.
- **Dive and swoop.** Reaching each guide step dips below the straight line and swoops up into the control, over 0.6–1.1 s.
- **Tug.** A reminder pulls toward its bubble for 3.5 s (it was a 10 s wiggle), easing off at the end.
- **Colour ripple.** *Costume* (a model change, a vision model, or an update) is a white band that sweeps across the sail in 0.8 s, replacing the spin.
- **Flutter hello.** It plays on a finished answer (replacing the invisible *happy*), on resume, and as onboarding's welcome.
- **Paused.**
  - On pause, the kite says goodbye, then reels out up and off the screen, gathering speed. It renders at 4 fps while away.
  - On resume, it drifts back down from above on a soft spring, then flutters and says "Welcome back."
- **Reduced motion.** No flights. *Success* shows no move, the ripple becomes a glint of the sail's own colour, the tug becomes a pulse on the dots, and pause fades out and in.
- **Cost.** An interleaved A/B against the last commit shows no added frame cost: 0.187 against 0.218 ms idle, and 0.245 against 0.286 ms moving.

| Move | Meaning | Replaces |
|---|---|---|
| **Loop-de-loop.** A small circular flight path (moving while rotating), not an in-place spin. | Something finished well: a tool succeeded, a guide was completed, or onboarding's "Let's fly" | Today's *success* spin |
| **Dive and swoop** | "Follow me": moving to the next guide step | A plain spring flight |
| **Tug** | "Hey, look": a reminder | The 10 s alarm wiggle |
| **Colour ripple.** A sheen crosses the sail. | "Something changed about me": a model change, a vision model, or an update | The *costume* spin, including its upside-down half-spin |
| **Flutter hello** | Welcome, resume, and a quiet "here's your answer": one visible flutter of the edge and a flick of the tail | Today's invisible *happy*, and the resume that snaps back into place |

### K5.5 Retuning the dials

- Replace the single `personalityAmount = 0.12` with three separate amounts:
  - `follow`: how the kite follows the cursor.
  - `expression`: the moods.
  - `ambient`: breathing and flutter.

  Today one dial hides the moods, and the same dial also controls how the follow feels.
- Keep ambient motion **visible but small**: at least 1 px of movement in the tail and edge, and slow.
- Keep mood poses clearly distinct: the differences in nose angle and billow should be visible at 26 px.
- Offer a **Liveliness** setting (Calm / Lively) that maps to these amounts.

  **Status, 1 Oct 2026 (K-15).** Done: **Liveliness** in Settings → General (`livelinessMotion` and `applyKitePreferences` in `kite/config.ts`).
  - **Lively** is the default and keeps the tuning above.
  - **Calm** (follow 0.4, expression 0.2, ambient 0.25) halves the idle motion. Measured offscreen, the bob drops from 2.18 to 1.09 px peak to peak, and the last tail dot's sway from 3.48 to 1.74 px. It stays at about the one-pixel floor, and every pose and gesture still reads.
  - It applies live, and to the onboarding stage too. It isn't reduced motion, which stays its own switch.

**Status, 1 Oct 2026.** The three amounts are `config.motion` (follow 0.5, expression 0.45, ambient 0.5), with sliders in the dev panel. Measured offscreen: the idle body breathes about 2.2 px peak to peak (it was about 0.5 px), and the last tail dot sways about 3 px. With an answer on screen, idle drifting and swaying stop. The tail dots trail on springs, but each can stray only 3, 6, or 9 px from its anchor. A fast sweep once left the last dot 51 px behind, which looked detached; it now trails about 8 px. Frame work went from 0.14 to 0.165 ms, still 60 fps while moving and 20 fps while dozing. The shared rhythm is `--rhythm-beat` and `--rhythm-stagger` in `tokens.css`. Offering the choice is itself part of the character. The control lives in Settings → General.

### K5.6 Where the kite goes

| Situation | Where it sits | Rule |
|---|---|---|
| **Following** | 32 × 28 px to the lower right of the cursor, nose pointing back at the pointer | Never cover the cursor's hotspot |
| **Answer on screen** | Beside the bubble, which grows out of it (UX-16) | Calm while you read (§K4) |
| **Approval** | Leans toward the approval card | Never covers the card's buttons |
| **Drawing** | At the pen tip | The nose is the nib |
| **Guide pointing** | Beside the ring, nose on the control | See below |

**Guide placement fix.** This moves over from the UI review. `layoutGuide` tries the right of the ring first (`shared/guide.ts:59-64`), which covers the next control on ribbons and toolbars. Instead:

- For **wide, short targets**, try positions below the ring first, then above.
- For **tall, narrow targets**, try left and right.
- Drop the kite to 85% opacity when its box overlaps other text.

The pointer-shaped sail helps here: pointing up at a tab from below reads naturally. Guide mode exists to reveal the interface, and the pointer shouldn't hide the thing the user checks next.

**Status, 1 Oct 2026 (K-08).** Done.
- **Neighbours.** The guide now passes the target's named neighbours from the UI Automation snapshot (`neighbours` in `grounding.ts`, carried as `nearby` on the view). They're the controls within 90 px, leaving out the target's containers and its own parts.
- **Spot order.** `layoutGuide` orders the kite's spots by the target's shape: below, then above, for wide, short targets; the sides for tall, narrow ones. It takes the first spot clear of the neighbours.
- **Then the card.** It goes below the ring, or below the ring and the kite, then above, then beside, never over either.
- **Dimming.** The kite dims to 85% only when no clear spot exists.
- **The fixture.** On a ribbon fixture (quick access buttons, title, tabs, and a ribbon of commands), the kite pointing at **Insert** sits above it, clear of every label.
- **Not covered.**
  - The real Word ribbon. Only the fixture and an off-screen render were checked.
  - Vision-found targets. They get neighbours only when a UI Automation snapshot exists.

### K5.7 The kite in onboarding

Onboarding is where the user meets the character. The UI reserves a stage at the top of each step (UX-60), and the kite lives there. It's the same SVG and motion loop, rendered in a small canvas.

The stage is the one branded surface in the windows: a deep-ink panel in both themes. On it, the kite uses its light halo, and a faint dotted string runs from the lower-left corner to the kite (the string principle, §K4). The stage is tallest on Welcome and "Let's fly", where the character is the point, and shortest on the Keys step, where the form leads.

| Step | What the kite does |
|---|---|
| Welcome | Flutters hello |
| Microphone | Listens. Its tail dots are the level meter (the §K5.2 beats), so the user learns the listening visual on day one. |
| Keys | Rests and breathes, without distracting from the form |
| Hotkey | Perks each time a key registers, and gives a small flutter when the full chord lands |
| First question | Goes through listening, thinking, and talking for real |
| Circle to ask | Flies to the practice ink and "draws" with its nose |
| Done: "Let's fly" | The window closes, and the kite does a loop-de-loop from where the window was over to the cursor |

**Status, 1 Oct 2026 (K-07).** The stage holds the live kite.

- **Its own loop.** `kite/stageLoop.ts` drives the overlay's sail (`sailPath`), tail (`stepTail`), poses (`poseFor`), and one-shot shapes (`reactionShape`) with springs, but has no cursor. It draws in one fixed layer over the window, so the kite can leave the stage. The string is clipped to the stage and fades while the kite is away.
- **Each step.**
  - Welcome: the kite flies in up its string, then flutters hello.
  - Microphone: it runs the listening beats on the live level, including the "is my mic working?" droop until it first hears you. A blocked microphone gets the puzzled pose.
  - Hotkey: it perks for each key and flutters when the chord lands.
  - First question: it follows the real voice events. Each streamed piece of the reply pulses the tail.
  - Circle to ask: it flies to the pen and perches up and to the right of the nib, nose on the ink, then flies home.
  - Finish: it holds the proud, taut pose.
- **Size.** It is 2.8×, 2.1×, or 1.3× by stage height, and 1.5× while drawing.
- **"Let's fly".** The window sends the kite's position and scale to main (`onboarding:fly`), which closes the window and tells the overlay (`onboarding:done`). The overlay flies a loop-de-loop route (`kite/flight.ts`) from there to the cursor, shrinking to 1× on the way, with the nose following the route.
- **Reduced motion.** Each step shows its pose with no fly-in, no flight to the pen, and no loop.
- **Cost.** Measured offscreen by wrapping every rAF callback, the stage loop costs 0.187 ms a frame at 60 fps. The overlay costs 0.215 ms idle, 0.182 ms moving, and 0.137 ms during the loop, all at 60 fps.
- **Not checked.** The real IPC hand-over (the smoke test mocks the preload), and the loop across displays with different scaling.

### K5.8 The kite's accessibility

- **Reduced motion:** every state keeps a distinct *pose* (§K5.2–5.3), so meaning survives without movement. This follows both Windows' setting and Kite's own override.
- **High Contrast (forced colors):** draw the sail in `CanvasText` with a `Highlight` halo, and the tail dots in `CanvasText`, so the kite stays visible under any system theme.
- **Accessible name:** give the kite SVG a state-aware label, such as "Kite, listening" or "Kite, thinking". Today it is always "Kite companion".
- **Size:** the Large and Extra large options (§K2) help users with low vision and those on 4K displays.

### K5.9 What to avoid

- **Eyes or a face.** At 26 px, eyes are 1–2 px dots, and they come across as either cute or uncanny. The nose and posture already carry emotion, as with the Pixar lamp. Keep `eyes: false`, or try it only as a clearly labelled experiment.
- **Idle tricks while the user types or reads.** No gusts or loops while the bubble is open or while the user is actively typing.
- **Stacked celebrations.** No confetti, and no sparkle, spin, and hop together.

---

## K6. Rollout plan

Priorities and sizes use the conventions from [roadmap-and-pending.md](roadmap-and-pending.md). UI counterparts are listed where the work meets a surface.

| # | Item | Priority · size | Done when | UI counterpart |
|---|---|---|---|---|
| K-00 | **Done, 1 Oct 2026.** Fix the half-strength spin that leaves the kite upside down (`voice/frame.ts`, `costume`). Scale the duration instead of the angle, or always complete whole turns. | P0 · S | Vision routing and "update ready" never show an upside-down kite | — |
| K-01 | ~~Decide the silhouette and the kite's color~~ **Done, 30 Sep 2026:** the pink, cursor-like sail (§K2) | P0 · S | Decided | — |
| K-02 | **Done, 30 Sep 2026.** Replace the diamond with the sail as a **parametric shape** behind `KiteRenderer`, with the §K2 refinements (rounded nose, halo, three dots) and the `--kite-*` tokens. Remove the teal overrides. | P0 · M | Only the sail renders, in light and dark mode. Performance stays near about 0.66% idle CPU and 60 fps while moving (`npm run perf`). | UX-01 (UI palette) |
| K-03 | **Done, 1 Oct 2026.** A tail-dots system: three dots, each on a lagging spring, with a shared rhythm constant | P1 · S | The dots trail visibly during movement and don't overlap the body at rest | UX-06 (three-dot motif) |
| K-04 | **Done, 1 Oct 2026.** **Listening** in four beats, including silent-mic detection | P1 · M | Five people can tell "hearing me" from "not hearing me" without reading | UX-12 (pills) |
| K-05 | **Done, 1 Oct 2026.** Poses for thinking, talking, approval, declined, lost, and error | P1 · M | Each state can be named from a 2 s clip watched out of the corner of the eye | UX-10, UX-15 |
| K-06 | **Done, 1 Oct 2026.** Separate the dials (`follow` / `expression` / `ambient`) and retune | P1 · S | No sub-pixel motion remains, and reading an answer is undisturbed | — |
| K-07 | **Done, 1 Oct 2026.** The kite on the onboarding stage (§K5.7) | P1 · M | Each step shows its reaction, and "Let's fly" ends with the loop | UX-60 to UX-65 |
| K-08 | **Done, 1 Oct 2026.** Guide placement that keeps the kite off neighbouring controls (§K5.6) | P2 · M | On a ribbon fixture, the kite never overlaps the next control's label | UX-30 to UX-32 |
| K-09 | **Done, 1 Oct 2026.** Signature moves (loop, dive, tug, colour ripple, flutter hello), one meaning each | P2 · M | No gesture has two meanings, and finishing an answer is visible but quiet | UX-18 (notices) |
| K-10 | **Done, 1 Oct 2026.** Replace the 🔇 emoji and the capture white-out with sail-native cues | P2 · S | No emoji or filter effects on the kite | UX-40 (looking pill) |
| K-11 | **Done, 30 Sep 2026.** **The mark:** the UI glyph, hand-drawn tray icons at 16–32 px with paused and update-ready variants, and a transparent app icon (§K2, "The kite as a mark") | P1 · S | The icons read clearly at 16 px on light and dark taskbars. Paused is visibly different. | UX-05, UX-70, UX-80 |
| K-12 | **Done, 30 Sep 2026.** Regenerate the README hero, social preview, installer GIF, and feature GIFs from the sail | P2 · S | No diamond artwork remains | — |
| K-13 | **Partly done, 1 Oct 2026:** built, off by default; the people test is left. Earcons, behind a setting (§K4) | P2 · S | Tested with at least three people for annoyance | UX-50 (Voice section) |
| K-14 | **Done, 1 Oct 2026.** Kite size: Standard, Large, and Extra large (§K2) | P2 · S | The setting scales the kite and its bubble offset correctly at every size | UX-50 (General section) |
| K-15 | **Done, 1 Oct 2026.** The Liveliness setting and kite color skins | P3 · S | Both are exposed in Settings → General | UX-50 |
| K-16 | **Done, 1 Oct 2026.** The kite's accessibility (§K5.8): forced-colors rendering and a state-aware accessible name | P1 · S | The kite is visible in High Contrast, and a screen reader announces its state | UX-90, UX-91 |

**Status, 1 Oct 2026.** K-00 to K-12 and K-14 to K-16 are done. K-13 is built and waits on its test with people. The status section at the top has the merged order with the UI items, and says how to check a batch.

**Where the kite's code lives**

- `src/renderer/kite/sail.ts`: the parametric sail (`sailPath`, `restSail`).
- `config.ts`: the resting angle (−35°), the tail dots, and the three motion dials.
- `tail.ts`: the tail's springs and how far each dot can stray.
- `poses.ts`: the pose for every state (K-04, K-05).
- `useKiteLoop.ts`: the overlay's animation loop. It handles following, choosing the pose, the springs, the accessible name, and the "Let's fly" landing.
- `stageLoop.ts`: the onboarding stage's loop (K-07), with no cursor.
- `flight.ts`: the signature flights: the loop-de-loop, the dive and swoop, and reeling out.
- `src/renderer/voice/frame.ts` and `runtime.ts`: one-shot reactions (`reactionShape`, shared with the stage), and the voice state the loop reads.
- `KiteRenderer.tsx` (the overlay SVG), `SailMark.tsx` (the UI glyph), `KiteStage.tsx` (the onboarding stage), and `DevPanel.tsx` (the dials).
- `src/renderer/kite.css`: the `--kite-*` tokens, the stage, and forced colors.
- `scripts/brand.py` (`npm run assets`): the tray and app icons, the README hero, the social preview, and the GIFs.

**Verification for every step**

- Renderer screenshots in light and dark mode.
- A reduced-motion pass, confirming every state is still recognizable.
- `npm run perf`.
- A quick "Which one is your cursor?" check with people who have never seen Kite.

---

# Part 2: Everything around the kite

**The kite we are designing for.** The pink, cursor-like sail was decided on 30 September 2026 (see §K2). It is a small delta kite in sail pink, about 26 × 30 px, that sits at the cursor's lower right. It uses three tail dots as its status meter. Every recommendation below assumes that kite.

**How this review was done.** I read every renderer component and the stylesheet. Then I built the renderer and opened each surface in an offscreen Electron window with a mocked preload (the same method `tests/renderer-smoke.cjs` uses). I captured the following, each in light and dark mode:

- Settings.
- All seven onboarding steps.
- History.
- Ten overlay states: idle, listening, thinking, answer, approval, "?", error, guide, guide lost, capture, and a notice.

The screenshots are not committed. Mixed-DPI rendering could not be checked on this 100% display.

Priorities and sizes follow [roadmap-and-pending.md](roadmap-and-pending.md): **P0** fix before calling v1 polished, **P1** next iteration, **P2** after the core journeys work well, **P3** exploratory. **S** is a contained change, **M** touches several components, **L** is a substantial rework.

---

## Start here

*This section describes the app as reviewed on 30 September 2026, before the work began. For where things stand now, see [Status](#status-1-october-2026).*

Kite's foundations are strong: deterministic approvals, a hand-drawn guide ring, pen-like ink, and clear privacy indicators. The surfaces around them, though, look like three different products stitched together:

1. **A kite in teal and gold** (`styles.css:92`). It is being replaced by the pink sail.
2. **Pink and mauve bubbles and cards,** left over from the first kite (`styles.css:6`, `:20`, `:69`, `:113`).
3. **Default-looking Windows forms** in Settings and History. Every button is styled as a primary teal button, buttons render in Arial, the slider is the browser's blue, and there's no dark mode.

Two surfaces also contain visible defects:

- The "?" bubble overflows.
- Onboarding greets the user with a Unicode glyph (◇⌁) where the kite should be.

**The five changes with the most impact**

| # | Change | Why it matters |
|---|---|---|
| 1 | One quiet palette around the pink kite (slate neutrals, ink controls), with dark mode (UX-01, UX-04) | Removes the three-product feel, makes the windows feel native, and lets the kite be the one bright thing on screen. |
| 2 | Fix the "?" bubble and hide "Keyboard controls" until needed (UX-10, UX-11) | These are the most visible defect and the most visible noise in the overlay. |
| 3 | Compact, glanceable listening and thinking pills (UX-12) | Push-to-talk lives or dies on "is it hearing me?" Today that answer is 320 px of text. |
| 4 | An approval card with a clear primary action and risk tiers (UX-20, UX-21) | The approval is Kite's trust moment. Right now **Do it** and **Cancel** look identical. |
| 5 | A focused onboarding flow with a stage for the kite (UX-60) | It's the first impression, and it currently looks broken. |

---

## U0. Designing around the pink sail

The kite is the brand. The UI is its stage. These principles apply to every item below.

1. **Only the kite is large and pink.** Bubbles, cards, and windows use cool slate neutrals. Never use pink fills on surfaces: a pink bubble next to a pink kite makes both harder to read.
2. **Three levels of attention, one color each:**
   - **The kite:** pink. "I'm here."
   - **Look here:** gold. Screen ink, the guide ring, the approval countdown. Only while the user needs to look somewhere specific.
   - **Everything else:** ink and slate neutrals.
3. **Pink appears in five places, and nowhere else:**
   1. The kite, on screen and on the onboarding stage.
   2. The sail mark (nav, title bar, card headers, the History avatar).
   3. The focus ring. Only keyboard users see it.
   4. The selected-item pill: a 3 px bar on the selected sidebar section and the selected History row, as in Windows 11's navigation view.
   5. The current step in progress dots (onboarding and guide).

   Everything else that shows state is ink: primary buttons, switches, checkboxes, sliders, selected segments, selected provider cards, and links. A Settings page has about 15 switches, and 15 pink ones would make it read like a lifestyle app. Pink is also never an action color, so it can't be mistaken for the red danger color.
4. **Borrow the sail's shapes.**
   - No diamonds. The ◇ glyph goes away.
   - The overlay uses the softer curves (UX-06). The windows use Windows 11's own radii.
   - The **three-dot rhythm** of the kite's tail is the one loading and progress motif across the product.
   - **The sail mark** is the only logo glyph.
5. **Speak from the kite.** Bubbles and notices attach to the kite with a tail. Only the privacy indicator lives in a fixed corner, by design.
6. **A small companion gets small surfaces.** The kite is about 26 × 30 px. Status surfaces (listening, thinking, notices) stay compact. The full bubble is for answers.
7. **Two registers.** The windows should feel serious; the character carries the personality.

   | | **Window register:** Settings, History, the onboarding forms, the tray menu | **Kite register:** the kite, bubble, pills, approval and guide cards, guide ring, the onboarding stage |
   |---|---|---|
   | Feel | Native Windows 11: calm and neutral | Branded, rounder, animated |
   | Color | Slate neutrals and ink. Pink only in the five places above. | The pink kite, gold for "look here", neutral surfaces |
   | Radii | 4 px controls, 8 px cards | 12 px bubble and cards, full pills |
   | Depth | Borders and layers (Mica), almost no shadow | One neutral elevation shadow |
   | Motion | 150–200 ms fades and slides, no bounce | Springs, flutter, and signature moves (§K5) |
   | Copy | Plain labels | Kite's voice (§K4) |

   Onboarding is where the two meet: a branded stage on top, a plain form below (UX-60).

### The contract between the kite and the UI

| The UI needs from the kite | Source |
|---|---|
| The kite's position and which side the bubble sits on, to aim the bubble's tail | The kite loop's `positionBubble` (exists) |
| The current state (listening, thinking, talking, waiting, lost, error) | The same voice and guide events that drive the kite's moods |
| The sail mark as inline SVG, 16–20 px | K-11 |
| The three-dot rhythm timing, so pills and loaders match the tail | A shared constant defined with the tail (§K5.1) |

| The kite needs from the UI | Source |
|---|---|
| Bubble and card bounds, so it can lean toward the approval card and avoid covering the guide card | `setBubbleBounds` and the guide layout (both exist) |
| A stage area in onboarding | UX-60 |

---

## What is already good (keep it)

- **The guide ring.** Two seeded, wobbly marker passes (`guide/ring.ts`) are the most on-brand visual in the app: hand-made, precise, and calm.
- **Ink.** Screen marks drawn with `perfect-freehand` feel like a pen, not a selection rectangle.
- **The approval model.** The plan is visible before you approve, you can answer by voice, and a countdown is shown. The structure is right. Only the presentation needs work.
- **Privacy affordances.** "Kite is looking" appears on every capture, and keys stay on the device. These are brand assets. Design them in, not around them.

Kite's voice and its motion architecture are also strengths. They are covered in Part 1.

---

## U1. Foundations: one visual system

### UX-01 — One palette, built around the pink kite
**P0 · M** · **Done, 30 Sep 2026** (`tokens.css`, `kite.css`). The dark values also cover most of UX-04.

**What we see.**

- The stylesheet defines a pink kite palette (`styles.css:6`) and then overrides it with a teal one (`styles.css:92`).
- Bubbles, the approval card, and the guide card use pink-era neutrals (`#fff8fc`, `#edc8d4`, `#443440`, `#fff0f7`).
- The guide's **Stop** button is plum (`#5d3f50`). The "Kite is looking" pill is purple (`#382753`).
- Settings uses teal (`#255e59`) and mint (`#e1eeeb`), and the dev panel uses mint too.

That's six accent families on one small product.

**Change.** Create one token layer. The kite owns its own tokens (`--kite-*`, see §K2). The UI uses only the semantic tokens below. Contrast is measured against `--bg` unless the table says otherwise.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg` | `#f4f5f7` | `#1c1f24` | Window background. Under Mica (UX-57) it is only the fallback. |
| `--surface` | `#ffffff` | `#25292f` | Cards, bubbles, pills, and the approval and guide cards |
| `--surface-subtle` | `#eceef1` | `#2e333a` | Hover, the selected sidebar section and History row, segmented-control tracks, the user's message in History |
| `--border` | `#dfe2e7` | `#3a3f47` | Card and control borders, dividers |
| `--text` | `#1b212a` (14.8:1) | `#eceef1` (14.2:1) | Body text |
| `--text-muted` | `#5a6472` (5.5:1; 6.0:1 on `--surface`) | `#a0a8b3` (6.9:1; 6.1:1 on `--surface`) | Secondary text and captions |
| `--ink` | `#1b212a`, with white text (16.2:1) | `#eceef1`, with `#1b212a` text (13.9:1) | Primary buttons, switches and checkboxes in the on state, sliders, selected provider cards. Dark mode flips it to a light fill. |
| `--accent` | `#c8174b` (5.2:1; 5.7:1 on white) | `#ff6f91` (6.2:1; 5.5:1 on `--surface`) | Pink in the UI, and only in the five places in §U0: the focus ring, the selected-item pill, the current progress step, plus the sail mark and the kite, which use `--kite-*` |
| `--sun` | `#e9a43f`, always with an ink halo | Same | "Look here": screen ink, the guide ring, the approval countdown |
| `--success` | `#0f7b0f` (Windows' success green; 5.4:1 on `--surface`) | `#6ccb5f` (7.2:1 on `--surface`) | Success states |
| `--danger` | `#c42b1c` (Windows' error red; 5.7:1 on `--surface`) | `#ff7a64` (5.7:1 on `--surface`) | Destructive actions and errors |
| `--stage` | `#1b212a` | `#111418` | The onboarding stage, a deep-ink panel in both themes (UX-60). The kite is 4.8:1 and 5.5:1 on it. |

**Hue rules**

- **Neutrals are cool slate** (hue about 216°, low saturation), so they read as grey rather than blue. The kite is the only warm thing on screen.
- **`--danger` stays on the orange side of red.** The light value is at 5° and the dark one at 9°. Windows' own dark error color (`#ff99a4`, 354°) is pink, only 8° from the dark accent, so an invalid key would look like a focused one. Don't use it.
- **There is no `--warning`.** Windows' caution amber has the same hue as `--sun` (36°), so the two can't be told apart. Things that need attention use `--sun` or a neutral row with an icon; failures use `--danger`.
- **Success is green, not teal.** Teal was the retired diamond's color, and keeping it would keep a third brand color next to pink and gold.

Retire the cream, mauve, plum, purple, mint, and teal values, including the teal ink `#173e49`.

**Why.** Consistency is what makes an interface feel modern and deliberate. Cool neutral surfaces feel native on Windows 11, work with Mica, and let the pink kite be found at a glance on any desktop. A warm cream would sit in the same color family as the pink and gold and blend with them. Borrowing Windows' own green and red makes success and failure read the way they do everywhere else on the system. The tokens also make dark mode (UX-04) and kite color skins cheap.

### UX-02 — Typography: native, crisp, inherited
**P0 · S** · **Done, 30 Sep 2026**

**What we see.** `:root` asks for `Inter, 'Segoe UI'` (`styles.css:1`), but Inter is never bundled, so the app silently falls back to Segoe UI. Buttons, inputs, and selects don't inherit the font, so they render in Chromium's default Arial-like face. This is visible in every Settings screenshot.

**Change.**

- Use `font-family: 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif`, with `Segoe UI Variable Display` for headings.
- Add `button, input, select, textarea { font: inherit; }`.
- Define a five-step type scale: 12 / 13 / 15 / 20 / 28 px.
- Use two weights only: 400 for text and 600 for headings and labels.
- Use sentence case everywhere.
- Remove the uppercase, letter-spaced `.eyebrow` label and the `-.04em` tracking on `h1` (`styles.css:37-38`). Both are marketing-site habits.
- Use `font-variant-numeric: tabular-nums` for timers and countdowns.

**Why.** Segoe UI Variable is Windows 11's own typeface. It is free, adds nothing to the bundle, and is tuned for every DPI. Mixed fonts are one of the fastest ways for an app to look unfinished. Restrained weights and plain casing are a large part of what makes a window feel serious.

### UX-03 — Button hierarchy
**P0 · S** · **Done, 30 Sep 2026.** The default button is secondary, and views opt in to `.primary`, `.ghost`, and `.danger`.

**What we see.** Every button uses the same filled teal (`styles.css:44`). That includes the window tabs, **Back**, **Replace / Test / Refresh models / Remove**, **Clear all history**, **Export**, **Do it**, and **Cancel**. Disabled buttons look like faded primaries, and on onboarding step 1, a disabled **Back** looks clickable.

**Change.** Define four variants:

| Variant | Style | Rule |
|---|---|---|
| **Primary** | Filled `--ink`: white text in light mode, a light fill with dark text in dark mode | At most one per view |
| **Secondary** | Tonal or outlined | — |
| **Ghost** | Text only | — |
| **Danger** | `--danger` text or outline | Filled only inside a confirmation step |

Hide **Back** on the first step instead of disabling it.

**Why.** Hierarchy tells users what to do next without making them read. Ink-filled primary buttons are calm and high-contrast, and they keep pink with the kite (§U0).

### UX-04 — Dark theme for every surface
**P1 · M** · **Done** (confirmed 1 Oct 2026). Every surface follows the system theme through the dark block in `tokens.css`. Overlay surfaces use `--surface-overlay` (96%) with a 1 px border.

**What we see.** In dark mode, the bubble, approval card, and guide card stay pale pink on a dark desktop. The screenshots show a bright slab next to a dark app. The Settings, History, and onboarding windows look identical in light and dark.

**Change.** Redefine the UX-01 tokens under `prefers-color-scheme: dark`. Electron follows `nativeTheme`, so no new setting is needed. Give overlay surfaces `--surface` at about 96% opacity with a 1 px light border, so they separate from any app behind them.

**Why.** An overlay that ignores the system theme feels like an intrusion, and Kite's promise is to be quiet company.

### UX-05 — Icons and the sail mark instead of Unicode glyphs
**P1 · S** · **Done, 1 Oct 2026.**
- **The sail mark.** Every ◇ and ⌁ is now the sail mark (`SailMark.tsx`), and so is Kite's avatar in History.
- **The icons.** All 20 icons in `icons.tsx` are Fluent UI System Icons at 16 px, inlined as paths filled with the text color. Pin switches to its filled form when on. Export uses Arrow Download, since Fluent has no export arrow.
- **License.** The MIT license sits beside the file (`icons-LICENSE.txt`), and a `/*! … */` notice carries into the built bundle.
- **Dependencies.** None added.

**What we see.** The UI draws with Unicode characters:

- ◇ in the nav wordmark, the approval heading, and the guide header.
- ⌁ in onboarding.
- ✓ ✗ on the approval buttons.
- ◉ for the vision badge.
- ✦ in the hotkey step.

How they render depends on the font, and they don't match each other.

**Change.** Ship a small inline-SVG icon set. Fluent UI System Icons is MIT-licensed and native to Windows 11. Take only the 15–20 icons needed. Replace every ◇ with the sail mark (from K-11): in the nav, card headers, and as Kite's avatar in History.

**Why.** Consistent icons are the cheapest polish signal there is. Putting the mark in the UI ties every surface back to the character.

### UX-06 — Shapes and motifs taken from the sail
**P1 · S** · **Done, 1 Oct 2026:**
- Shadows are neutral, and every overlay surface shares `--shadow-overlay`, the whiteboard card included.
- **Radii** are four tokens in `tokens.css`. Circles stay round, and the speech tail's tip keeps its 3 px rounding.
  - `--radius-s`, 4 px: window controls, plus inline code and code blocks.
  - `--radius-m`, 8 px: window cards. In the overlay, controls and frames inside cards also use it, such as the approval frame in the bubble.
  - `--radius-l`, 12 px: overlay surfaces (the bubble, the guide, task, and whiteboard cards, the notice, and the dev panel).
  - `--radius-pill`: pills, chips, switches, the selected-item bar, and the task meter.
- **One loading motif.** The tail's three dots (`BusyDots` and `Working` in `icons.tsx`) wave in `--rhythm-beat`. They replace every "…" status and the blinking caret:
  - busy buttons (Connect, Preview, Rescan apps);
  - a provider's "Checking", now in muted text rather than success green;
  - the tool lines "On it" and "Working";
  - a streaming answer;
  - the guide's "Looking for", instead of a pulsing keycap;
  - loading lines and onboarding's waiting lines.

  Under reduced motion the wave stops and the middle dot stays lit, as on the tail. Guide step progress was already dots (UX-30).
- The only mark is the sail.

**What we see.** The stylesheet uses ten different corner radii (3, 4, 6, 7, 8, 10, 12, 14, 16, and 20 px), with no system. The loading states are text ("Thinking…") or a blinking caret. The progress indicators are bars in onboarding and dashes in guide mode.

**Change.**

- **Radii,** split by register (§U0):
  - **Windows** use Windows 11's own values: 4 px for controls (buttons, fields, segmented controls, list rows) and 8 px for cards and the window.
  - **The overlay** uses 12 px for the bubble and the approval and guide cards, and full pills for status. The softer curves echo the sail.
- **Shadows:** neutral, never tinted (today's is plum, `#24162422`). Windows use borders and layers with almost no shadow. Overlay surfaces share one elevation shadow.
- **One loading and progress motif:** three dots in the kite tail's rhythm. It appears in the thinking pill, busy buttons, and step progress (onboarding and guide).
- **One mark:** only the sail. No diamonds anywhere.

**Why.** When the UI reuses the character's shapes, the product reads as one designed thing rather than a set of components.

### UX-07 — Legibility and focus
**P1 · S** · **Done** (confirmed 1 Oct 2026).
- No text is smaller than 12 px.
- `--text-muted` is at least 5.2:1 on every surface, in both themes.
- There is one focus ring: 2 px `--accent` with a 2 px offset.

**What we see.**

- Several captions are 10 px: `.bubble-fallback`, `.bubble-voice-status`, `.approval-card small`, the approval `pre`, `.guide-hint`, and `.tool-audit`.
- Muted text fails WCAG AA contrast (4.5:1):

  | Element | Colors | Contrast |
  |---|---|---|
  | Bubble transcript / guide hint | `#8f7788` on `#fff8fc` | 3.9:1 |
  | Bubble fallback line | `#8b7c84` on `#fff8fc` | 3.8:1 |
  | Settings body text | `#667b80` on `#f5f8f7` | 4.2:1 |

- There are two competing focus rings: 2 px teal at `styles.css:42`, and 3 px orange at `styles.css:104`.

**Change.**

- Make 12 px the minimum text size, with 11 px allowed only for non-essential metadata.
- Keep `--text-muted` at 4.5:1 or better on every surface.
- Use one focus ring: 2 px `--accent` with a 2 px offset.

**Why.** The bubble is read in quick glances over arbitrary backgrounds, so it needs more contrast than a normal page, not less.

### UX-08 — Stylesheet structure
**P2 · S** · **Done, 1 Oct 2026.**
- **The split.** `styles.css` is now `src/renderer/styles/`, imported in order by `index.css`, and `tokens.css` and `kite.css` stay where they were:
  - `base.css`: element defaults, buttons, icons, keycaps, and the toast.
  - The overlay: `bubble.css`, `pills.css`, `approval.css`, `capture.css`, `guide.css`, `board.css`, `task.css`.
  - The windows: `settings.css`, `window.css` (frame, Mica, sidebar), `history.css`, `onboarding.css`.
  - `dev-panel.css`.
  - `high-contrast.css`, loaded last, with the shared High Contrast rules for buttons and the toast.
- **High Contrast.** Each component's own High Contrast rules now sit at the end of its file.
- **Generated, not retyped.** The files were cut from line ranges of the old stylesheet, so no rule was retyped.
- **Removed as dead.** `.settings`, `.save-row`, `.setting-field`, the `.pill` selector (the pill is `.speech-bubble.compact`), a High Contrast `.toast` border color that the next rule always overrode, and the `--on-danger` token.
- **How "no visual change" was proven.**
  - **Declarations:** a parser confirmed both versions hold the same declarations apart from those removals. It then listed every pair whose order flipped and could fight over a property at equal specificity. Each one targets different elements, sets an identical value, or was fixed by placement: link buttons keep their inline padding after the views' button padding.
  - **Computed styles:** about 27,000 element and pseudo-element states, hashed, across 114 scenes (light, dark, High Contrast, a 600 px window, reduced motion, and Mica). They match, except the approval countdown's arc, which is a clock that also varies between two runs of the old build.
  - **Screenshots:** the stabilized screenshots match within GPU edge jitter.
- **One intended change.** Under the OS's reduced-motion setting, the onboarding stage now really stops animating its height. The old rule came before `.kite-stage`'s own transition, so it never applied.

**What we see.** `styles.css` is a single file with four independent button styles. Lines 95–105 are minified one-liners, and there are dead pink and teal variables.

**Change.** Split it into:

- `tokens.css`: the UX-01 tokens.
- `kite.css`: the kite's own tokens, owned by Part 1.
- `base.css`.
- One section per component: bubble, pills, approval, guide, settings, history, and onboarding.

Delete dead values. This is not a framework migration. Plain CSS is the right size for this app.

**Why.** Everything above depends on it. Polish decays quickly when each new component invents its own color.

---

## U2. The overlay: bubble and status

### UX-10 — Fix the "?" bubble
**P0 · S** (defect) · **Done, 30 Sep 2026.** Silence gets its own line: "I didn’t hear anything. Hold and speak again."

**What we see.** After a short tap or silence, the bubble gets the `question` class, which sets its width to 36 px (`styles.css:22`, `SpeechBubble.tsx:147`). The "Keyboard controls" button (`SpeechBubble.tsx:157`) still renders inside it. The result is a 36 px card with clipped text and a horizontal scrollbar, and the screenshot confirms it.

**Change.** Replace the "?" card with a compact pill that says "Hold a bit longer while you speak." The kite shows its puzzled pose at the same time (§K5.3).

**Why.** An accidental tap is the most common failed interaction, and right now it looks like a rendering bug.

### UX-11 — Hide "Keyboard controls" until needed
**P0 · S** · **Done, 30 Sep 2026.** The global shortcut is **Ctrl + Alt + K**; the tray shows it only when registering it succeeded. With nothing on screen to control, focus goes straight back to the user's app.

**What we see.** Every visible bubble shows a "Keyboard controls" button, including **Listening** and **Thinking**. For mouse users, it's unexplained noise. For keyboard users, it isn't reachable until the overlay is focused from the tray anyway.

**Change.**

- Keep the entry point in the tray, and add a global shortcut.
- Once the overlay is focused, show a small hint row: "Tab to move · Esc to close".
- Show focus-only controls with `:focus-within`.

**Why.** Accessibility controls should be complete, not conspicuous. This keeps them complete and removes the clutter.

### UX-12 — Compact listening and thinking pills
**P1 · M** · **Done, 1 Oct 2026.** The pill stays until there is something to read or decide. The kite's own listening beats are still K-04.

**What we see.** Pressing the hotkey opens the full 320 px bubble containing only "Listening…" and the keyboard button. Releasing it changes the text to "Thinking…". The bubble text is the only reliable state signal.

**Change.** The pills sit beside the kite and share its three-dot rhythm (UX-06).

- **Listening:** a small pill with a live level meter, driven by the existing `runtime.audioLevel`, and the hint "Release to send · Esc to cancel". If the mic stays silent for about 2 s while the hotkey is held, the hint becomes "I can't hear you — check your mic".
- **Thinking:** the same pill with the three-dot pulse. After 3 s (`workingHard` already exists), it adds the model name: "Still thinking · Claude Sonnet 5".
- **Answer:** only now does it expand to the full bubble.

The kite's tail shows the same states on the kite itself (§K5.2–5.3). The pill is the text companion to that.

**Why.** Push-to-talk needs instant confirmation, visible from the corner of the eye, that capture has started and audio is arriving. A pill is readable without reading, and it covers far less of the user's work.

### UX-13 — A real speech tail
**P1 · S** · **Done, 1 Oct 2026.** The bubble's body now scrolls, so the tail isn't clipped. Pills get a smaller tail, centred.

**What we see.** `.speech-bubble::before` is a 4 px triangle inside the bubble's border (`styles.css:23`). In the screenshots, it reads as a stray mark rather than a tail.

**Change.** Draw a 10–12 px tail on the bubble edge nearest the kite, using the existing `data-side`, and align it vertically with the kite's position (known in `positionBubble`). The tail's curve should follow the UX-06 radii.

**Why.** The tail is what makes the bubble the kite's speech rather than a floating toast.

### UX-14 — Answer layout
**P1 · S** · **Done, 1 Oct 2026.** The footer waits while an approval is pending. Open in History opens History, not the specific conversation yet. The icons are stand-ins in `icons.tsx` until UX-05.

**What we see.**

- The transcript has a "You:" prefix, in 11 px low-contrast text.
- Model attribution appears in parentheses: "(answered by …)" and "(looked using …)".
- **Copy** and **Keyboard controls** are equal-weight text buttons.
- The bubble auto-hides after 4 s plus 60 ms per word. Hovering pauses the timer, but there's no way to keep an answer.

**Change.**

- Show the transcript as a quiet quote line ("You asked · …").
- Keep the reply at 14 px in `--text`.
- Add a footer row:
  - A model chip, for example "Claude Sonnet 5 · looked at your screen".
  - Icon buttons for **Copy**, **Pin** (keep the bubble open), and **Open in History**.

**Why.** A clear order (question, then answer, then details) matches how people read a quick reply. **Pin** removes the anxiety of a disappearing answer.

### UX-15 — Errors with a clear next step
**P1 · S** · **Done, 1 Oct 2026** (`src/main/voice/errors.ts` returns a title plus one sentence of help).

**What we see.** An error looks like an ordinary answer with an **Open settings** button. Nothing signals that something failed.

**Change.** Use a one-line title (in `--danger` for failures, or in `--text` with an icon for something that needs setting up), one sentence of help, and one primary action. Word it in Kite's voice (§K4). The kite shows its tangled pose at the same time.

**Why.** A recoverable error should look recoverable: calm, specific, and actionable.

### UX-16 — The bubble grows from the kite
**P2 · S** · **Done, 1 Oct 2026.** `positionBubble` now places the bubble with the CSS `translate` property, which leaves `transform` free for the grow. The bubble scales from 0.96 and slides 4 px toward the kite over 180 ms, from its tail (a pill grows from its middle). It collapses the same way. Under reduced motion only the fade remains.

**What we see.** The bubble only fades its opacity in and out.

**Change.** Grow the bubble out of the kite over 160–200 ms, with a scale from 0.96 plus a 4 px translate, and `transform-origin` on the tail side. Collapse it back toward the kite on dismiss. Under reduced motion, keep the fade only.

**Why.** Spatial continuity ("it came from the kite") is the cheapest way to make the bubble feel like part of the character.

### UX-17 — Richer, safe Markdown
**P2 · S** · **Done, 1 Oct 2026.**
- **Parser and renderer.** `voice/markdown.ts` parses; `voice/MarkdownView.tsx` renders React elements only, with no HTML.
- **What it renders.**
  - Headings as bold lines.
  - Bullet and numbered lists. A list that starts at 3 keeps its number, blank lines between items keep one list, and indented items and wrapped lines are kept.
  - Bold, italics, inline code, and fenced code. `snake_case` and `2 * 3` stay text.
- **Links.** Both `[label](url)` and bare URLs show as a chip with the host. Clicking it copies the address ("Copied"); nothing navigates.
- **Not covered.** History still shows answers as plain text.

**What we see.** Only `**bold**`, inline code, and fenced code blocks are rendered (`SpeechBubble.tsx:12`). Numbered steps and bullet lists, which LLM answers use constantly, arrive as raw text with `1.` and `-`.

**Change.**

- Render lists.
- Render headings as bold lines.
- Render links as plain text or a copyable chip, since navigation is denied.

Keep the renderer tiny and allowlist-based.

**Why.** Short answers are easier to scan as lists, and step lists are the most common shape of an answer.

### UX-18 — App notices from the kite, and actionable
**P2 · S** · **Done, 1 Oct 2026** (`voice/AppNotices.tsx`).
- **Placement.** Notices are a small bubble from the kite. They share the answer bubble's tail, placement, and hit-test.
- **Timing.** One shows at a time. A notice waits while an answer or pill is up, and is dropped if it waited past its moment. It holds while the pointer is over it.
- **Actions.**
  - "I have an update ready." offers **Restart**.
  - A fault says "Something went wrong. Try again, or open the logs." and offers **Open logs**.
  - Main now accepts those two actions from the overlay; reporting a problem stays in Settings.
- **App events.** `AppNotices` now owns the overlay's app events, so the kite's pause and resume flights and its words stay in step. See §K5.3.

**What we see.** Pause, resume, update, and fault notices appear in the bottom-right corner of the desktop, far from the kite. They have `pointer-events: none` (`styles.css:103`), so "Update ready · Restart from the tray" can't be clicked.

**Change.** Show notices as small bubbles from the kite, using the same tail and surface as UX-13. For **Update ready**, add a **Restart** button (it can use the same hit-test path the bubble uses).

**Why.** One character, one place to look. An actionable notice also saves a trip to the tray.

---

## U3. The approval card (the trust moment)

### UX-20 — Buttons that name the action, with hierarchy
**P0 · S** · **Done, 30 Sep 2026** (`approvalAction.ts`, `useHotkeyLabel.ts`)

**What we see.** "✓ Do it" and "✗ Cancel" are identical filled buttons (`ApprovalCard.tsx:26`).

**Change.**

- The primary button (ink) names the action: "Open Spotify", "Paste text", "Start guide".
- The secondary button is a ghost labelled "Not now".
- Keep the voice hint, but make it follow the user's hotkey (UX-52).

**Why.** Naming the action prevents approving the wrong thing. Clear hierarchy prevents mis-clicks under a countdown.

### UX-21 — Risk tiers that explain themselves
**P1 · M** · **Done, 1 Oct 2026** (`approvalRisk` in `approvalAction.ts`, using the same `routeVision` as the main process).

**What we see.** Opening an app and pasting into the focused window look the same.

**Change.** Use two visual tiers:

- **Low risk** (open an app, web search): a compact card.
- **Sensitive** (typing text, clipboard, reading the screen, a guide that may use vision): a shield icon, plus one line saying what leaves the PC and where it goes. For example: "Your screen will be sent to Kimi K2.5".

The summary text stays deterministic, since it's generated from validated arguments.

**Why.** Kite's privacy stance is a differentiator. Showing the data flow at the moment of consent makes it visible.

### UX-22 — Human details and a calmer countdown
**P1 · S** · **Done, 1 Oct 2026**

**What we see.**

- The card shows "Full arguments · open_app", which exposes an internal tool id.
- The countdown ring is mauve (`#a44970`).
- The heading is "Your permission" ("Preview action" in dry-run mode).

**Change.**

- Make the summary the title.
- Move the arguments into a collapsed **Details** section, with the tool id in small monospace.
- Replace the countdown with "Auto-cancels in 30 s" and a thin `--sun` ring. For the last 5 s the ring stays gold, but it thickens and the number turns bold.

**Why.** Calm, precise, human wording at the moment of consent. Urgency is reserved for the last 5 seconds, not all 30. The ring changes weight rather than color: an amber would have the same hue as the gold and wouldn't be noticed, and red would suggest an error, but auto-cancel isn't one.

### UX-23 — Show the approval as its own card
**P2 · S** · **Done, 1 Oct 2026.** With an approval pending, the card is the first thing in the bubble. The transcript and the answer before it fold into one line underneath ("Revenue grew 24% this quarter, led by the new… ›"), which opens on click. Once the decision is made, the bubble goes back to the answer and the tool status.

**What we see.** The approval card is appended below the previous answer inside the same bubble, which pushes the decision down.

**Change.** When an approval arrives, collapse the answer to one line ("Revenue grew 24%… ▸") and put the card first.

**Why.** Only one thing needs a decision, so it should be the first thing the user sees.

---

## U4. Guide mode card and ring

### UX-30 — Title the card with the goal
**P1 · S** · **Done, 1 Oct 2026**

**What we see.** The card header is a generic "◇ Show me how" (`GuideLayer.tsx:65`). The goal and the app are known (`view.goal`, `view.app`) but not shown.

**Change.**

- Header: "Add a footer · Word", followed by the step count.
- The instruction at 15 px.
- The target control as a keycap-style chip.
- Progress uses the three-dot motif (UX-06): done steps in `--text`, the current step in `--accent`, and upcoming steps in `--border`.

**Why.** Users lose context as they move between steps. The goal is the anchor they need.

### UX-31 — Recovery actions when the target is lost
**P1 · S** · **Done, 1 Oct 2026.** Look again sends the existing `repeat` action, which re-runs the search while the guide is lost.

**What we see.** The lost state shows only a message and an orange border. `guideActions` already includes `repeat`, but there's no button for it (`GuideLayer.tsx:74-79`).

**Change.** In the lost state, show **Look again** (primary) and **Skip step**, and name the window Kite is waiting for.

**Why.** "I can't find it" should always come with a one-click way forward.

### UX-32 — Calmer controls
**P1 · S** · **Done, 1 Oct 2026.** Back is hidden on the first step, as in onboarding (UX-03).

**What we see.** **Stop** is a filled plum button. **Back / Pause / Skip** are pink tonal buttons. The hint is 10 px.

**Change.**

- Use icon-plus-label buttons: ◀ Back, ❙❙ Pause, Skip ▶.
- Make **Stop** a ghost button with an ✕ icon.
- Raise the hint to 12 px, and shorten it after the first step ("Say 'next' or 'stop'").
- Keep the ring gold (`--sun` with its ink shadow). It is the one "look here" mark on the screen. Where the kite flies to point is covered in §K5.6.

**Why.** Stop isn't the primary action, so it shouldn't be the loudest button on the card.

---

## U5. Capture and marking

### UX-40 — Rebrand "Kite is looking"
**P1 · S** · **Done, 1 Oct 2026**

**What we see.** A purple pill (`#382753`) in the display's top-left corner (`styles.css:89`), in the system-ui font.

**Change.**

- Keep the fixed position: a privacy indicator must be predictable.
- Style it as a dark ink pill (`#1b212a` in both themes) with light text, a faint light border, and a small dot in the kite's pink. It's Kite doing the looking.
- The dot pulses, and stays steady under reduced motion.

**Why.** It's a trust signal, so it should look like part of Kite, not like a system alert.

### UX-41 — First-run hints for marking
**P2 · S** · **Done, 1 Oct 2026** (`Annotation.tsx`).
- **The hint.** For the first three marking sessions on this computer (counted in `localStorage`), a small pill by the cursor reads "Circle, underline, point, or tap · up to 5".
- **The counter.** Once drawing starts, the hint goes; from the second mark, "2 of 5" sits by the latest one.
- **Never captured.** Both hide during a capture, so they never appear in a screenshot.

**What we see.** Once the crosshair appears, nothing tells the user which kinds of marks work, or that there's a five-mark limit.

**Change.** For the first three uses, show a tiny hint near the cursor: "Circle, underline, point, or tap · up to 5". Once two or more marks exist, show a mark counter.

**Why.** Teach in context, then get out of the way.

---

## U6. Settings window

### UX-50 — Sidebar sections instead of one long scroll
**P1 · L** · **Done, 1 Oct 2026.** History is the last sidebar item. Kite size, Liveliness, and interface sounds join General and Voice when K-13 to K-15 land. The sidebar becomes a row of tabs in windows narrower than 640 px.

**What we see.**

- Seven sections are stacked on one page: Providers, Make Kite yours, Trust, Actions, Model, Screen vision, and Voice.
- The model choice sits far below the providers it depends on.
- Top-level tabs present Settings, History, and Tutorial as peers, all drawn as filled buttons.
- The window title is "Kite settings" even when it shows History.

**Change.** Use a left sidebar. The selected section gets a `--surface-subtle` fill, `--text` in weight 600, and the 3 px `--accent` pill on its left edge, as in Windows 11's navigation view (§U0):

- **General:** hotkey, launch at startup, and motion, plus the kite's size, liveliness, and color. The options are defined in K-14 and K-15.
- **Models & keys:** providers, the main model, the fallback, and the vision model.
- **Voice:** voice, speed, preview, and interface sounds (K-13).
- **Screen & privacy:** screenshots, capture, and what leaves the PC.
- **Actions & trust:** search engine, apps, guide mode, and approvals for each tool.
- **About:** version, updates, logs, report a problem, and replay the tutorial.

Make History its own view, and set the window title for each view.

**Why.** Settings should be navigable by intent. Related controls belong together, such as a model picker next to the key that unlocks it.

### UX-51 — Provider rows driven by state
**P1 · M** · **Done, 1 Oct 2026.** The overflow menu also has Check connection. "Get a key" opens a fixed page per provider (`src/main/ipc/about.ts`).

**What we see.** Each provider shows three or four equal-weight buttons: **Save / Replace, Test, Refresh models, Remove** (`SettingsView.tsx:53-57`). Saving and testing are separate steps, and there's no link to get a key.

**Change.**

- **Not connected:** a key field, a **Connect** button that saves, tests, and refreshes models in one step, and a "Get a key ↗" link opened with `shell.openExternal` (allowlisted).
- **Connected:** "✓ Connected · 23 models", with **Replace, Refresh, Remove** in an overflow menu.
- Mark Groq as **Required for voice**.

**Why.** Key setup is the biggest drop-off risk in a bring-your-own-key app. One action per state, with guidance, removes the guesswork.

### UX-52 — Copy that follows the user's hotkey
**P1 · S** (defect) · **Done, 1 Oct 2026** (`Keycaps.tsx`)

**What we see.** "Ctrl + Win" is hard-coded in `SettingsView.tsx:74`, `:103`, and `:114`, and "Ctrl+Win" in `ApprovalCard.tsx:27`. If the user changes the hotkey, these instructions become wrong.

**Change.** Generate the text with `hotkeyLabel(settings.hotkey)` everywhere, and show it as keycaps.

**Why.** Instructions that contradict the user's own setting damage trust in the whole app.

### UX-53 — Remove duplicated chrome
**P1 · S** · **Done, 1 Oct 2026**

**What we see.**

- A second "Kite / A little company beside your cursor" header sits under the nav.
- A sticky pink status banner shows messages like "Changes apply immediately…" and overlaps content while scrolling.
- Onboarding step 3 embeds the whole view, so the header appears there too.

**Change.** Drop the header. Show status inline in the row it concerns (a ✓, or an error under the field), and use a toast for global events.

**Why.** Feedback belongs where the action happened.

### UX-54 — Switches and human labels
**P1 · S** · **Done, 1 Oct 2026**

**What we see.** Instant-apply settings use checkboxes. The Trust section lists raw tool names ("open app", "get datetime", "list reminders") with Always ask / Don't ask selects (`SettingsView.tsx:82`).

**Change.**

- Use Windows-style switches for settings that apply immediately. Their "on" state is filled `--ink`, not pink, so a page full of switches stays calm (§U0).
- Rename Trust to **Ask before I…**, with one switch per row: "Open an app", "Search the web", "Check the date and time", "Read your reminders".
- List the always-ask actions below them, with a lock icon and "Always asks in this version".

**Why.** People reason about what Kite will do, not about tool ids. Switches match settings that apply immediately.

### UX-55 — A rich model picker
**P2 · M** · **Done, 1 Oct 2026** (`ModelPicker.tsx`).
- **The listbox.** It replaces the native select and is grouped by provider. Each row shows the name and a tier badge, plus a **Vision** badge where it applies, and **Actions** or a quiet **Chat only**.
- **The button** shows the same badges. If the current choice isn't listed, it says **Custom** or **Needs a key**.
- **Keyboard.** It follows the listbox pattern: arrows, Home and End, Enter or Space to choose, and Esc to close, after which focus returns to the button.
- **Placement.** The list opens upward when there's no room below.
- **Advanced.** A collapsed **Advanced** section holds the backup model and custom IDs.

**What we see.** Options read like "Kimi K2.5 · flagship · ◉ Vision · Actions" inside a native select, and the custom-model fields are always visible.

**Change.** Use a custom listbox, grouped by provider. Each row shows:

- The model name.
- A tier badge.
- **Vision** and **Actions** badges.

Move custom model ids and the fallback into a collapsed **Advanced** section.

**Why.** Choosing a model involves real trade-offs, and badges make the options scannable.

### UX-56 — Voice section
**P2 · S** · **Done, 1 Oct 2026.**
- **Slider.** The speed slider draws an ink fill and thumb on a border rail (`.range`, filled to `--fill`). A **Normal** tick sits exactly under 1.0× and resets the speed when clicked. The row reads "Normal" at 1.0×.
- **No key.** Without a Cartesia key, the line "Add a Cartesia key to hear Kite speak." replaces the voice controls.
- **Sound cues.** Settings → Voice also holds the Sound cues switch (K-13).

**What we see.** The speed slider is the browser's default blue. **Preview** sits apart from the voice picker. The voice controls stay enabled without a Cartesia key.

**Change.**

- Style the slider with the tokens: an `--ink` filled track and thumb on a `--border` rail. Add a "Normal" tick at 1.0×.
- Put **Preview** next to the voice picker.
- When there's no key, replace the inactive controls with "Add a Cartesia key to hear Kite speak".

### UX-57 — Native window chrome
**P2 · S** · **Done, 1 Oct 2026** (`window/settings.ts`, `window/size.ts`).
- **Mica.** On Windows 11 22H2 and later, the window calls `setBackgroundMaterial('mica')`, which also clears Electron's background. The page loads with `?mica`, drops `--bg` from itself and the sidebar, and keeps `Canvas` in High Contrast.
- **Size.** The window reopens at the size it was closed at, and maximized if it was. The size is kept within the screen and above 480 × 560; the default 820 × 860 also shrinks to fit small screens.
- **Checked.** An off-screen harness on the real window confirmed the Mica call, the `?mica` load, and a 1000 × 700 size surviving a close.
- **Not checked.** How Mica looks on screen. The off-screen windows can't show the system backdrop.

**Change.**

- On Windows 11, use `backgroundMaterial: 'mica'` with a transparent page background. `--bg` is then only the fallback, used where Mica isn't available. Cards and the sidebar sit on top as `--surface` and `--surface-subtle` layers.
- Remember the window size.
- Raise the minimum width to about 480 px so the sidebar fits.

**Why.** Mica makes an Electron window feel native at almost no cost. It needs a transparent page, and it's designed to sit under neutral layers. An opaque page color would hide it entirely, which is one reason the palette uses neutrals rather than cream (UX-01).

---

## U7. Onboarding

The kite's part in onboarding (what it does on each step, and the "Let's fly" moment) is covered in §K5.7. This section covers the flow and layout around it.

### UX-60 — A focused onboarding flow with a stage for the kite
**P0 · M** · **Done, 30 Sep 2026** (`KiteStage.tsx`). Since 1 Oct 2026 the stage holds the live kite (K-07).

**What we see.**

- Every step shows a teal outline ◇ with a gold ⌁ glyph floating below it (`Onboarding.tsx:29`). In the screenshots, it reads as a broken icon.
- Onboarding runs inside the Settings window, with the Settings / History / Tutorial tabs still visible.
- Progress is seven unlabeled bars.
- The footer has three buttons of equal weight.

**Change.**

- Remove the glyph. Reserve a **stage** at the top of every step, where the kite lives. Until the animated kite is ready (K-07), the stage shows the static sail.
- **The stage is the one branded surface in the windows.** It's a deep-ink panel (`--stage`) in both themes, so the kite looks the same on every system. A faint dotted "string" runs from the lower-left corner to the kite (§K4, "The string").
- **Its height follows the step:**

  | Steps | Stage height | Why |
  |---|---|---|
  | Welcome, and the finish ("Let's fly") | About 190 px | The character is the point |
  | Microphone, hotkey, first question, circle to ask | About 140 px | The kite demonstrates something (its tail is the mic meter, for example) |
  | Keys | About 84 px | The form leads |

- Below the stage, the step is a plain window-register form (§U0) on `--bg`.
- Hide the nav during onboarding.
- Label the progress, for example "2 of 7 · Microphone", using the three-dot motif: done steps in `--text`, the current step in `--accent`.
- Give each step one primary action. Make **Back** a ghost button (hidden on step 1), and "Finish later" a link.
- Center the content, and use the lower half for the practice area.

**Why.** Setup is a guided path, and the first screen is where the user meets the character. The UI should frame the character, not offer exits to unrelated places. Putting the brand on the stage lets the forms below it stay plain and serious.

### UX-61 — A purpose-built keys step
**P1 · M** · **Done, 1 Oct 2026** (`KeysStep.tsx`, which shares `ProviderRow.tsx` with Settings). Connecting a brain also makes it the main model when the current model's provider has no key. Continue reads "Continue anyway" with a line naming what's missing.

**What we see.** Step 3 embeds the full `SettingsView` (`Onboarding.tsx:32`), including the duplicate "Kite" header, the status banner, and all six providers.

**Change.** Show three parts, in order:

1. **Groq:** required, with one sentence explaining why.
2. **Pick a brain:** provider cards. One is enough. The chosen card gets an `--ink` border, not pink.
3. **Cartesia:** optional, "for a voice".

Use the same **Connect** flow as UX-51. **Continue** says what's still missing, for example "Add a Groq key to use voice".

**Why.** Scoping the step to what's needed now makes a hard step feel short.

### UX-62 — The microphone step
**P1 · S** · **Done, 1 Oct 2026.** If access is blocked, the step explains how to allow it and offers Try again.

**What we see.** A flat gold line with a lot of empty space around it, a **Check microphone** button, and "Not checked" in paragraph type.

**Change.**

- Start the check as soon as permission is granted, and show the device name.
- The level is shown by the kite's tail on the stage.
- Under the stage, show a status line that turns into "I can hear you ✓", in `--success`, after about 1 s of voice.

**Why.** It proves the most important permission, and it teaches the listening visual the user will see every day.

### UX-63 — The hotkey step
**P1 · S** · **Done, 1 Oct 2026.** The stage kite perks on each key and flutters when the chord lands (K-07).

**What we see.** Text only: "Waiting for your shortcut…", then "Nice — I felt that! ✦".

**Change.** Show large keycaps (**Ctrl**, **Win**) that light up individually while held. When the chord completes, show a check. The kite reacts on the stage.

**Why.** Seeing each key register teaches the chord physically, and makes a stuck key obvious.

### UX-64 — Practice ink that matches the real thing
**P2 · S** · **Done, 1 Oct 2026.** Both draw with `inkPath` (`vision/ink.ts`) and the same `--sun` style. The step checks the mark: a circle that takes in part of the chart says "That's it." with a check. Any other mark says "Almost. Draw all the way round the chart, and end where you started." While you draw, the stage kite flies down and perches by the nib, nose on the ink (K-07).

**What we see.** The practice mark is an orange polyline (`#da713b`, `Onboarding.tsx:38`). The real overlay uses gold `perfect-freehand` ink.

**Change.** Reuse the real stroke renderer and `--sun`, and add a success state: "That's it ✓".

**Why.** Practice should look exactly like the real thing.

### UX-65 — A finish worth remembering
**P2 · S** · **Done, 1 Oct 2026.** The card is a `<dl>` in the window register. It shows the user's own shortcut as keycaps, and the guide line only when guide mode is on. The last step drops "Finish later", so **Let's fly** is the one way out. The three switches stay below the card.

**Change.** On the final step, show a cheat-sheet card:

- Hold **Ctrl + Win** to talk.
- Hold and draw to circle to ask.
- **Esc** to cancel.
- "How do I…?" to start a guide.

The primary button is **Let's fly**. What the kite does then is covered in §K5.7.

**Why.** People remember how something ends, and the cheat sheet is what they'll need tomorrow.

---

## U8. History

### UX-70 — A readable, chat-style transcript
**P1 · M** · **Done, 1 Oct 2026.** A tool call shows with Kite's reply to the question it served, even when it was recorded against the user's message.

**What we see.**

- Each message card shows "You" or "Kite" as a large heading.
- The model name is bold, while the actual message is small and grey: the lowest-contrast text on the page.
- "0 ms total" appears on user messages.
- Tool audits appear as raw text, such as "create_note · approved · 30 ms".

**Change.**

- Show user and Kite messages as distinct, aligned blocks, with the sail mark as Kite's avatar. The user's message sits on `--surface-subtle`.
- Mark the selected conversation the same way as the selected sidebar section: a `--surface-subtle` fill and the `--accent` pill (UX-50).
- Show message content in `--text`.
- Put timings, the model, and tool audits in a collapsed **Details** row.
- Hide timings on user messages.

**Why.** History is for rereading answers. The content should be the most prominent thing on the page.

### UX-71 — Friendly dates, titles, and search
**P1 · S** · **Done, 1 Oct 2026.** Matches come from FTS5 `snippet()` and render without HTML. The first conversation opens automatically.

**What we see.** Group headers read like "9/30/2026". Titles are truncated first lines. Search has no icon and no match highlighting.

**Change.**

- Use "Today", "Yesterday", weekday names, and then dates.
- Add a search icon, and highlight matches with FTS5 `snippet()`.
- Add a friendly empty state: the sail mark, and "Hold Ctrl + Win to ask your first question".

### UX-72 — Human labels for marks and tools
**P1 · S** · **Done, 1 Oct 2026** (`historyText.ts`). Declined and failed calls read as not having happened: "Didn’t open an app · you declined".

**What we see.** Internal names like "Marked: enclosure" and `create_note` (`HistoryView.tsx:18`).

**Change.**

- Mark types become "Circled", "Underlined", "Pointed at", and "Tapped".
- Tools become past-tense sentences, such as "Saved a note · you approved".

### UX-73 — Destructive actions look destructive
**P1 · S** · **Done, 1 Oct 2026**

**What we see.** **Clear all history** is a filled primary button next to the search box. **Delete conversation** looks the same as **Export Markdown**.

**Change.**

- Move **Clear all history** to the page footer or an overflow menu, styled as a danger button.
- Make per-conversation delete an icon with a tooltip.
- Keep the existing confirmation dialog from the main process.

### UX-74 — Screenshot thumbnails
**P2 · S** · **Done, 1 Oct 2026.**
- **Data.** History's messages now carry an attachment count. A new trusted `history:screenshot` returns the kept marked overview as a data URL, and it reads only from inside the screens folder, like delete.
- **Display.** A question with a kept screenshot shows it as a 240 px thumbnail that opens to full width in place.

**Change.** When "Keep screenshots in history" is on, show the marked overview as a thumbnail on the user's message.

**Why.** A marked screenshot is the best reminder of what the question was about.

---

## U9. Tray menu

The tray *icon* is part of the kite's mark. It's covered in K-11, including the paused and update-ready variants.

### UX-80 — A grouped tray menu with clear labels
**P1 · S** · **Done, 1 Oct 2026.** The update status moved to Settings → About.

**What we see.**

- The menu is a flat list of 11 items.
- "Voice on (click to mute)" is a checkbox that is checked when voice is *off* (`tray.ts:20`).
- "Updates: idle" is a disabled item.
- "Focus Kite controls (Tab to navigate)" sits at the top level.
- Left-click does nothing. Only double-click opens Settings (`tray.ts:40`).

**Change.** Structure the menu like this:

- A disabled header: "Kite · Ctrl + Win to talk", following the user's hotkey.
- **Mute voice** (checked when muted), **Pause ▸**, and **Model ▸**.
- A separator, then **Settings** and **History**.
- **Help ▸**: Replay tutorial, Keyboard controls, Open logs, Report a problem.
- **Restart to update**, shown only when an update is ready.
- **Quit**.

Make left-click open the same menu.

**Why.** Tray menus are scanned, not read. Grouping and honest labels make them fast.

---

## U10. Accessibility of the surfaces

The kite's own accessibility (reduced motion, High Contrast rendering, and its accessible name) is covered in §K5.8.

### UX-90 — Windows High Contrast (forced colors)
**P1 · S** · **Done, 1 Oct 2026.** Anything that showed state through a fill (switches, dots, the selection pill, lit keys) now uses an explicit system color. Primary buttons opt out of forcing and use Highlight, because Chromium forces a button's text color. Checked with DevTools forced-colors emulation in both High Contrast palettes.

**Change.** Add `@media (forced-colors: active)` rules:

- The bubble, pills, and cards use `Canvas` / `CanvasText` with a `Highlight` border.
- The guide ring and screen ink use `Highlight`.
- Buttons use the system button colors.

**Why.** Some users rely on High Contrast mode every day. The overlay is currently untested there.

### UX-91 — Keyboard and screen-reader polish
**P2 · S** · **Done, 1 Oct 2026.** Esc closes the bubble while Kite's controls have focus (UX-11). The bubble is no longer a live region: the pill, errors, and one hidden status line each announce their own state once.

**Change.**

- **Esc** closes the focused bubble.
- Announce state changes ("Listening", "Thinking", "Answer ready") once, through a single polite live region, instead of making the whole bubble `aria-live`.

---

## Suggested sequence

*This is the original plan. Steps 1 and 2 are now nearly done; the current order is in [Status](#status-1-october-2026).*

The kite work in Part 1 runs in parallel. Its K-02 (the sail replacing the diamond) should land early, because the tokens here assume it.

1. **Foundations (P0):** UX-01, UX-02, UX-03, UX-10, UX-11, UX-20, UX-60.
2. **Everyday surfaces (P1):**
   - Overlay: UX-12, UX-13, UX-14, UX-15.
   - Approval: UX-21, UX-22.
   - Guide: UX-30 to UX-32.
   - Capture: UX-40.
   - Settings: UX-50 to UX-54.
   - Onboarding: UX-61 to UX-63.
   - History: UX-70 to UX-73.
   - Tray: UX-80.
   - Theme and accessibility: UX-04, UX-05, UX-06, UX-07, UX-90.
3. **Delight and depth (P2):** everything else.

## How to verify

- **Visual baseline.** Extend `tests/renderer-smoke.cjs` to save a screenshot of every surface and state, in light and dark mode. The mocked preload already supports this. Review the images in pull requests.
- **Contrast.** Check every token pair: 4.5:1 for text and 3:1 for UI graphics, on light, dark, and High Contrast.
- **The kite stays the brightest thing.** In a screenshot of the overlay over a busy app, the eye should land on the kite first, anything gold second, and the UI surfaces last.
- **Pink budget.** In a screenshot of each window, pink appears only in the five places in §U0. A switch, button, link, or selection fill in pink is a bug.
- **Danger and accent stay apart.** In dark mode, an invalid-key error next to a focused field must read as red next to pink.
- **Performance.** `npm run perf` must stay near today's quiet-workstation numbers (about 0.66% idle CPU and 60 fps while moving). Bubble and pill motion stays in CSS or in the existing animation loop.
- **Manual.** Check 125% and 150% scaling. Check with a busy dark app (for example VS Code) and a busy light app (Word) behind the overlay. Do one first-run pass with someone who has never seen Kite.
