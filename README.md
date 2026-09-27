# Kite

An Electron Forge + Vite + React desktop kite. This phase implements only the idle overlay and a settings form stub.

## Run

```sh
npm install
npm start
```

The transparent overlay starts without window chrome or DevTools. It spans the union of all display bounds and follows the cursor with a small offset, easing, and idle bobbing. Cursor positions are converted from global screen coordinates to overlay-local device-independent pixels, including negative monitor origins. Display changes recompute the bounds.

`Ctrl+Shift+K` (`Command+Shift+K` on macOS) logs `hotkey pressed` in the launch terminal. Registration failure logs a warning. There is no voice pipeline yet.

Settings are deliberately IPC-only for this phase; there is no visible launcher yet. To open them during development, temporarily open the overlay DevTools from the main process with `getOverlayWindow()?.webContents.openDevTools({ mode: 'detach' })`, then run `window.kite.openSettings()` in its renderer console. Remove the temporary DevTools call after testing. Repeated calls focus the existing settings window.

API keys remain in local component state and disappear when the settings window closes. Save displays a confirmation and logs only that the stub was invoked; it does not log key values or persist them.

## Verify

```sh
npm run typecheck
npm run lint
```

Manual desktop checks:

- Move the cursor around each display, including displays left of/above the primary. Confirm the kite follows with a gentle trail and continues bobbing when stationary.
- Click an underlying desktop icon or application away from the kite. Confirm the overlay passes clicks through and does not take keyboard focus.
- Move quickly into the trailing kite's bounding box. Its opacity should increase while hovered and clicks should pass through again after leaving. The kite continues following, so hover is transient.
- Press the stub shortcut and check the launch terminal.
- Open settings through the IPC call, fill all five fields, and save. Confirm session-only feedback, then close/reopen to verify the fields reset.
- Change display arrangement while running and confirm coverage updates.

Real desktop input, focus, transparency, and mixed-DPI multi-monitor behavior require native testing; a renderer build alone cannot validate them. Voice, provider calls, persistence/encryption, and mood transitions are outside this phase.
