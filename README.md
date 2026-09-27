# Kite

Cursor-scale Electron companion built with Forge, Vite, TypeScript, React, and Zustand.

## Run and preview

```sh
npm install
npm start
```

The system cursor remains visible. A 22px curved pink kite follows with damped spring motion, minimal banking, and two small square tail dots. The dots extend only about 7px below the body and share its transform, so they cannot fold into the silhouette or trail far behind. The kite sits 32px right and 28px below the cursor. The overlay covers the virtual desktop; cursor IPC carries global coordinates plus the overlay origin and current monitor bounds. The renderer converts to local coordinates without edge clamping or offset flipping, so the kite follows the cursor out of view naturally.

**Ctrl+Shift+D** (Command+Shift+D on macOS) toggles the development motion panel on the cursor's monitor. Preview idle/listening/thinking/talking, trigger gust/wake-up/dizzy, tune stiffness/damping/wag, toggle eyes, and see FPS. Only the panel captures clicks; the kite stays click-through. The panel is omitted from production bundles and its shortcut is not registered in packaged apps. Sliders are live session-only tuning.

**Ctrl+Shift+K** remains the placeholder voice shortcut, logging `hotkey pressed` in the launch terminal.

## Motion implementation

`src/renderer/kite/` contains pure physics, the idle state machine, presets, config, the imperative SVG renderer, and one animation loop. `config.ts` holds shared tuning and `KITE_SCALE`; `moods.ts` defines relative motion presets. All character dimensions scale together. Eyes are implemented but off by default to keep the small silhouette legible.

The frame loop reads cursor IPC directly, then updates behaviours, springs, and DOM attributes. The compact tail uses fixed local dot positions with a bounded subpixel sway; the pure rope module is retained for future variants but is no longer used by this design. Frame values never enter React or Zustand. Zustand holds only mood, changed through `useKiteStore.getState().setMood(...)`. The dev panel's FPS output is also written directly to the DOM.

Idle becomes bored after 8 seconds and dozes after 30 seconds, with very subtle changes. The default calm profile disables automatic gusts, wake-up hops, and shake spins, removes movement stretch, and reduces personality motion to 12%. One-shots remain available explicitly in the dev panel; set `automaticOneShots` in config to restore automatic triggers. Other moods suppress idle behaviours. Listening and talking accept optional normalized signal levels through `setMotionLevels({ audioLevel, speechLevel })` in `runtime.ts`; preview uses synthetic levels until real inputs are supplied.

Reduced-motion preference changes are observed live: no gusts, spins, banking, or stretch, with gentler follow, bob, wind, and wag.

## Checks

```sh
npm test
npm run typecheck
npm run lint
npm run package
```

Pure tests cover spring convergence/overshoot at 30, 60, and 144 Hz, rope lengths/pinning/immutability under variable timesteps, shake detection and false positives, idle thresholds/wake-up, and reduced-motion one-shots.

Native acceptance checks:

- Move across each monitor, including negative-origin and mixed-DPI arrangements. Confirm the kite maintains its cursor spacing and follows beyond the viewport instead of sticking to or flipping at its edges.
- Stop suddenly and confirm the kite settles quietly. Wait 8/30 seconds, then move or shake: the default profile should remain calm without spontaneous hops or spins.
- Preview all four moods and one-shots from the dev panel. Enable React DevTools “Highlight updates” to confirm cursor motion produces no React updates. The FPS readout measures actual rAF cadence.
- Click desktop apps underneath the kite and outside the panel; confirm focus stays with the underlying app. Close the panel and verify complete click-through.
- Enable OS reduced motion while running and verify the motion restrictions.

The settings form remains an IPC-only phase-zero stub. In an overlay renderer DevTools console, `window.kite.openSettings()` opens it. Keys live only in component state; Save logs no secrets and does not persist them. Voice, provider calls, and encrypted persistence are still out of scope.
