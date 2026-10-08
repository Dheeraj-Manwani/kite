# Phase 0 background-agent probe

Run `npm run package` and then `npm run eval:background:phase0` on Windows x64. The runner starts the packaged executable with a fresh temporary profile and writes `out/background-spike/phase0.json` plus two synthetic PDFs. [Retained report](phase0.json).

The probe records packaged startup to `app.whenReady`, total sampled process working sets before/after conversion and during browser startup, a 20 ms main-event-loop timer, conversion time/size/page count/hash, Electron/Chromium versions, archive size, and workflow model calls/tokens. Working sets are point samples, not stable idle averages or leak tests. The app starts in a dedicated probe mode: it does not run the companion renderer, microphone, or provider calls. The event-loop sample therefore does not establish overlay frame rate or live voice performance during conversion.

Fixtures are a 120-line document with UTF-8 characters and a long Markdown-source document containing literal script markup. Both use Readable A4 output. All nine pages were rendered with Poppler and visually checked for wrapping, legible text, margins, and literal markup; this is not an Office fidelity corpus or a font/script coverage claim. Hashes can differ between executions because PDF metadata changes.

The browser check uses an explicitly allowed local HTTP fixture in its own persistent Electron partition. It sets a synthetic login cookie, destroys/reopens the window, checks the cookie remains, checks the default profile remains untouched, and checks `window.kite` and Node `require` are absent. It makes no real account claims and cannot validate OAuth popups, CAPTCHA, MFA, external redirects, or real website automation.

The retained phase 0 report records zero added runtime packages for the initial implementation, which reused existing Electron/Chromium and SQLite. Phase 2 adds document dependencies; the current phase 0 runner names the field `textConverterAddedRuntimePackages` to distinguish the text workflow from the whole app. Archive size uses Electron's `original-fs` rather than virtual ASAR directory statistics. It is the entire archive, not incremental installer size. Native SQLite/keyboard-hook packaging is checked separately with `npm run test:packaged`.

## Phase 2 document probe

After packaging, run `npm run eval:background:phase2`. It launches the packaged executable with a temporary profile and writes `out/background-documents/phase2.json`, positive PDF outputs and an actual preview capture. [Retained results](phase2.json). Fixtures are synthetic bundled assets and a generated 15-page static PDF containing text, vectors and a JPEG. No user files, providers or accounts are used.

The retained Windows x64 sample reduced that PDF from 12,490 to 9,160 bytes (26.7%) and correctly reported that a 1,024-byte target was not met. Re-optimizing yielded an unchanged copy. All three supported image fixtures produced one-page PDFs; text and Markdown-source fixtures produced three and one pages. Encrypted, signature, script and CMYK fixtures were rejected with specific codes. The packaged worker resolves pdf-lib 1.17.1 and its pako 1.0.11 rather than the unrelated root pako version. Workflow model calls remain zero.

`scripts/background-document-fidelity.py` independently checks pypdf strict parsing and Poppler rendering of every positive output. On all 15 optimized pages, page boxes/extracted text match and 100 DPI render comparisons have **zero changed pixels**. Extracted PNG pixels/alpha match the originals; the embedded JPEG DCT bytes are identical (pypdf's convenience JPEG export re-encodes and is not used for that byte comparison). Latin UTF-8 and literal script markup survive text printing. [Retained fidelity results](phase2-fidelity.json).

Run with a Python environment containing pypdf/Pillow and supply Poppler explicitly if absent from PATH:

```sh
python scripts/background-document-fidelity.py --pdftoppm /path/to/pdftoppm
```

The viewer check requires visible page pixels, no Kite/Node APIs and failed external requests. Native and bundled-panel tests separately cover durable binary sources, batching, v1 migration, cancellation, source hashes, target reporting, publication recovery, native selection, preview/reveal and exclusive export. `npx electron tests/packaged-runtime.cjs` loads the actual ASAR dependency tree and checks nested pako plus MathJax formula generation after the packaging resolver correction.

The package report also records archive bytes, a sampled aggregate process working-set peak and maximum main timer gap. These include the fixture generator, child startup, printing and viewer; they are point samples in diagnostic mode without the companion/microphone/providers. They are not idle-memory, leak, hard memory-containment or foreground-latency measurements. Do not compare the phase 0/2 archive sizes as a controlled installer delta: dependency resolution and the fixture bundle also changed. The synthetic corpus does not establish Office fidelity or broad third-party PDF/font compatibility.

## Gates still open

- Office converter distribution, license notices, representative fidelity, protected inputs, and original-byte preservation fixtures.
- Real manual account sign-in and takeover in the dedicated browser, then comparison with a packaged Playwright alternative.
- Installer-size delta against an identical dependency/platform baseline.
- Live voice/overlay responsiveness while file work runs, memory after repeated runs, and idle worker release measurements.

Runtime correctness is checked separately in `tests/background-native.cjs`; actual panel lifecycle and export in `tests/background-panel.cjs`. Passing these correctness checks does not close the performance/product gates above.
