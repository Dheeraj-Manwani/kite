# Release procedure and acceptance

The local build produces unsigned Windows x64 Squirrel and ZIP artifacts. `npm run test:packaged` verifies the actual packaged executable can open SQLite and start/stop uiohook. This is necessary but does not replace testing an installed application.

## Reproduce

1. On Windows, run `npm ci`, lint, typecheck, both unit suites, and `npm run make`.
2. Confirm the build logs list copied runtime dependencies and `Preparing native dependencies: 2 / 2`. Run packaged, native, renderer, and startup smoke tests after build completion.
3. Inspect `out/make/squirrel.windows/x64`: `KiteSetup.exe`, a full `.nupkg`, and `RELEASES`. Keep them together for publishing and auto-update. The ZIP is a separate portable artifact.
4. Install on a clean Windows VM or second account. Check shortcuts, startup, SQLite persistence, actual Ctrl+Win press/release, microphone permission, spoken question, optional TTS, and uninstall. These require an interactive Windows desktop and configured test provider accounts.
5. Verify a second launch brings Settings forward, rather than starting another overlay. Verify pause/resume, sleep/resume hook recovery, and display changes.
6. Record Windows version, display scale, hardware, app version, and results. Do not label this check complete based on source tests.

## Publish and update

The `v*` tag must match `package.json`. The release workflow builds, runs packaged smoke, and publishes a **draft** through Forge's GitHub publisher. `GITHUB_TOKEN` is supplied by Actions with repository contents write permission. Review notes and artifacts before making the draft public. No signing secrets are configured by default.

Auto-update uses the Electron public update service for this public GitHub repository. Drafts are excluded. To verify upgrading, install an older version through Squirrel, publish a higher version with all Squirrel assets, wait for the check/download, observe the badge/reaction, and select Restart to update. Confirm the new version and retained data. A development app or ZIP launch does not establish Squirrel upgrade behavior. Two public versions and an installed prior version are required; this repository's automated smoke does not simulate that check.

Optional signing reads `WINDOWS_CERTIFICATE_FILE` and `WINDOWS_CERTIFICATE_PASSWORD` from the environment. Supply a certificate securely on the runner; never commit it. Without these variables, the README and installer remain honestly unsigned.

## Portfolio publication

Set the repository description to “A voice companion beside your cursor. Hold, ask, or circle anything on screen.” Suggested topics: `electron`, `typescript`, `react`, `voice-assistant`, `byok`, `ai-sdk`, `desktop-companion`, `vision`.

Upload `assets/social-preview.png` (1280×640) through repository Settings → Social preview. GitHub's repository metadata API does not upload that image. Record the live demo using [the script](demo.md), then link the hosted video from README. Illustrative GIFs are labeled as simulations and must not be presented as proof of live provider results.

Outstanding acceptance: clean-account installation, live microphone/provider/TTS flow, real mixed-DPI displays, normal OBS visibility with capture exclusion, update from an installed older release, and a real narrated video. Local automated results and fresh-profile performance are tracked separately.
