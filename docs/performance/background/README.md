# Phase 0 background-agent probe

Run `npm run package` and then `npm run eval:background:phase0` on Windows x64. The runner starts the packaged executable with a fresh temporary profile and writes `out/background-spike/phase0.json` plus two synthetic PDFs. [Retained report](phase0.json).

The probe records packaged startup to `app.whenReady`, total sampled process working sets before/after conversion and during browser startup, a 20 ms main-event-loop timer, conversion time/size/page count/hash, Electron/Chromium versions, archive size, and workflow model calls/tokens. Working sets are point samples, not stable idle averages or leak tests. The app starts in a dedicated probe mode: it does not run the companion renderer, microphone, or provider calls. The event-loop sample therefore does not establish overlay frame rate or live voice performance during conversion.

Fixtures are a 120-line document with UTF-8 characters and a long Markdown-source document containing literal script markup. Both use Readable A4 output. All nine pages were rendered with Poppler and visually checked for wrapping, legible text, margins, and literal markup; this is not an Office fidelity corpus or a font/script coverage claim. Hashes can differ between executions because PDF metadata changes.

The browser check uses an explicitly allowed local HTTP fixture in its own persistent Electron partition. It sets a synthetic login cookie, destroys/reopens the window, checks the cookie remains, checks the default profile remains untouched, and checks `window.kite` and Node `require` are absent. It makes no real account claims and cannot validate OAuth popups, CAPTCHA, MFA, external redirects, or real website automation.

The report records zero added runtime packages because it reuses existing Electron/Chromium and SQLite. Archive size is measured using Electron's `original-fs` built-in to avoid virtual ASAR directory statistics. The size is the entire archive, not incremental feature/installer size. Native SQLite and keyboard-hook packaging is checked separately with `npm run test:packaged`.

## Gates still open

- Office converter distribution, license notices, representative fidelity, protected inputs, and original-byte preservation fixtures.
- Real manual account sign-in and takeover in the dedicated browser, then comparison with a packaged Playwright alternative.
- Installer-size delta against an identical dependency/platform baseline.
- Live voice/overlay responsiveness while file work runs, memory after repeated runs, and idle worker release measurements.

Runtime correctness is checked separately in `tests/background-native.cjs`; actual panel lifecycle and export in `tests/background-panel.cjs`. Passing these correctness checks does not close the performance/product gates above.
