# Kite

A small pink cursor companion with hold-to-talk voice chat. The compact two-dot tail and unclamped cursor spacing are preserved.

## Run

```sh
npm install
npm start
```

Open **Settings** from the Kite tray icon. Save a **Groq** key for speech recognition, then a key for any reply provider: OpenAI, Anthropic, Google Gemini, Groq, or Moonshot. Test each key and choose a model. Refresh models queries your account; custom IDs are supported. For speech, save a Cartesia key, refresh/select a voice, and enable **Speak replies**. Changes apply immediately.

Hold **Ctrl + Win**, speak, then release. The hook accepts either left or right modifier. Release either modifier to finish. A tap shorter than 250ms or a silent recording produces a small “?” without calling a provider. Pressing another key during the hold cancels it. **Escape** aborts the active recording/transcription/reply, and is registered globally only while an interaction is active. A new hold interrupts the previous interaction. A new hold immediately stops queued audio, cancels Cartesia, aborts the LLM, saves any partial reply as interrupted, and starts listening.

The microphone stream warms at startup and keeps its tracks disabled and AudioContext suspended between recordings. RMS is sampled in the existing kite animation loop, with a silence threshold of 0.012. Recordings are Opus/WebM, capped at 60 seconds and 12 MiB. If Windows blocks access, enable **Settings → Privacy & security → Microphone → Let desktop apps access your microphone**.

The bubble shows the transcript and streamed reply, supports bold/inline code/line breaks, and flips around monitor edges. Hover freezes its position, pauses expiry, and enables text selection. Copy uses a narrow main-process clipboard handler. With voice enabled, words follow Cartesia timestamps on the playback clock. Hover reveals all available text. Without timestamps or with voice muted, text streams normally. Expiry starts only after the LLM and audio playback have both finished; the bubble remains for 4 seconds plus 60ms per word.

## Confirmed Windows actions

Models marked **Actions** in Settings can open indexed Start Menu apps, open HTTP/HTTPS URLs, search the web, paste text, read/write the clipboard, create Markdown notes, and manage timers/reminders. Date/time and listing reminders are informational. Every other tool requires a separate confirmation, including reading your clipboard. Unknown/custom models default to **Chat only** until their tool support is curated in the catalog.

The approval card shows a summary generated from validated arguments, expandable full arguments, **Do it / Cancel**, and a 30-second countdown. Click a button, or hold Ctrl+Win and say “yes” or “no.” While approval is pending, the hold records a decision without discarding the pending request. Anything else (such as “no, open Firefox instead”) denies it and starts a new request. Escape, recording failure, timeout, and interruption deny pending actions. There are at most four model calls and three approved actions across an interaction, including a provider fallback. Tools never execute shell commands; opening goes through Electron's openPath/openExternal APIs.

For **type_text**, focus the destination editor first; voice approval is recommended. The overlay is non-focusable. Paste saves all readable clipboard formats as materialized writable items, sends Ctrl+V, and restores them after 300ms, including on interruption. Tool execution is serialized across interactions to avoid clipboard races, and shutdown waits for restoration. [Electron ClipboardItem API](https://www.electronjs.org/docs/latest/api/clipboard-item). The native clipboard test verifies text and image restoration; the physical approval-click focus behavior in Notepad still needs a manual check on this machine because the desktop automation helper could not click the non-focusable fixture.

Settings → Actions chooses the search engine and rescans Start Menu shortcuts (cached for ten minutes). App matching asks for clarification when scores are weak or close. Notes go into Documents/Kite Notes with sanitized, unique filenames. Pending reminders survive restart; overdue reminders fire on the next startup. Windows notifications appear when due, and Kite queues spoken reminders behind an active interaction. Alarm motion lasts ten seconds or until dismissed. Kite must be running to deliver reminders; it does not install a Windows background task.

The dev panel (Ctrl+Shift+D) includes **Dry-run actions** and a live list of the last 20 audited tool calls. Dry run returns previews without executing any tool, and pauses delivery of previously saved reminders. Changing dry run cancels the current interaction; already completed effects cannot be undone. Turn it off to resume reminder delivery. SQLite's `tool_calls` table stores validated proposals, decisions, results/errors, durations, and dry-run status, linked to the initiating user message. These local plaintext records may include clipboard text and note contents. Tool results are explicitly treated as untrusted data in the system prompt.

## Data and security

Provider traffic runs only in main: Groq `whisper-large-v3-turbo` transcription, the selected model through the AI SDK, and Cartesia `sonic-3.5` speech. Kite’s system prompt names the actual responding model. Optional fallback (off by default) retries once, only on network/5xx/429 errors before the first text token. History records the actual provider/model. Model switches from Settings or the tray play a spin/flash and a short announcement. See [verified model/API references](docs/models.md).

Newly typed keys pass once from the settings form to main and are cleared from the form after saving. Existing keys are never returned to a renderer. `safeStorage` encrypts keys before their base64 ciphertext is saved under `secrets.<provider>` in `userData/settings.json`. Encryption being unavailable is an error; Linux's plaintext backend is rejected too. There is no plaintext fallback or `getKey` bridge method.

IPC validates the calling window and its top-level app frame. Only settings can set/delete keys. Only the overlay can submit audio. Media permissions are restricted to audio from Kite's own overlay origin; navigation and new windows are denied. Provider errors are sanitized before reaching the UI, and saved keys are not logged.

Conversations and messages are stored in `app.getPath('userData')/kite.db` using SQLite WAL, foreign keys, and ordered `PRAGMA user_version` migrations. History is local plaintext; API keys are encrypted separately. Raw audio is not persisted. The context contains the last 10 messages and resets after five minutes of inactivity. Completed replies and interrupted partial replies are persisted, including an interrupted flag and first-audio/voice-to-voice timing. No history UI is included.

## Structure and timing

- `src/main/input/`: pure PTT state machine and native hook adapter.
- `src/main/settings/`: hotkey config and encrypted secrets.
- `src/main/ai/`: providers, transcription, streaming, persona, rolling context.
- `src/main/voice/`: one interaction controller, cancellation, safe errors, IPC.
- `src/main/storage/`: SQLite schema/migrations and persistence.
- `src/renderer/voice/`: recorder, safe markdown bubble, signal sampling and positioning.
- `src/renderer/kite/`: the existing imperative rAF animation and development panel.

Motion samples stay outside React/Zustand. The same loop samples microphone and playback RMS, applies reactions, and positions the bubble; React updates the bubble at spoken word boundaries. The dev panel (Ctrl+Shift+D) shows STT, first-token, first-audio, voice-to-voice and rolling 20-answer average latency. Its **Print last 10 messages** action writes history to the main terminal only in development.

`transcribeMs` measures the STT call. `firstTokenMs` includes recorder finalization, IPC, STT, and the initial model response, measured from release. `totalMs` measures release to completion. `ttsFirstAudioMs` measures voice startup from the first LLM delta to the first received PCM chunk. `voiceToVoiceMs` measures key release to renderer playback acknowledgement, allowing for reported device output latency. This is a software estimate, not an acoustic microphone measurement. The goal is about 1.5 seconds for short questions on fast models; live network/account/device measurements are required.

Native `uiohook-napi` and `better-sqlite3` are externalized from the main Vite bundle. Forge rebuilds native dependencies for development; installer/native unpacking remains for the polish phase.

## Verification

```sh
npm test
npm run test:native
npm run test:clipboard # native text/image restoration; preserves clipboard
npm run typecheck
npm run lint
npm run package
npm run test:renderer # uses the built renderer
npm run test:startup # uses the built main process
```

The Node suite covers physics, modifier order/repeats/extra-key cancellation, context trimming/reset, mocked safeStorage, silence/empty transcription, missing keys and 429s, stale stream cancellation, and real SDK serialization/SSE parsing with mocked HTTP.

The Electron-native smoke test uses a separate temporary userData directory. It tests actual OS encryption, ciphertext on disk, reloading/deleting a test key, and reopening persisted SQLite messages. It never uses your provider credentials.

Tool tests use the AI SDK mock language model and cover approval, denial, timeout, invalid input, parallel/sequential action limits, fallback call accounting, clipboard-to-note chaining, interrupted session isolation, dry run, and reminders. Native tests verify audit/reminder migration and persistence across reopening the database. The renderer test verifies the confirmation card and both decisions.

To finish the Notepad acceptance check: run `npm run test:notepad`, focus a new blank Notepad tab, then click the fixture's **Do it** button. Confirm that `meeting at 5` appears in Notepad and the terminal reports restored clipboard contents. The fixture closes after success or three minutes; it does not use provider keys. Then repeat through Kite with “Type meeting at 5 into this note” using both click and voice approval.

Manual live acceptance:
1. Save/test provider and Cartesia keys, restart, and confirm masked saved status. Check that `window.kite.getKey` is undefined.
2. Hold Ctrl+Win and speak. Confirm the listening motion responds to voice, then transcription, reply streaming, and latency readout.
3. Try a tap, silence, an extra key, Escape during streaming, and interrupting a reply with another hold.
4. Hover/select/copy the bubble; check expiry pauses and outside clicks reach the desktop.
5. Check negative-origin/mixed-DPI monitors and reduced-motion settings.
6. Restart and use the dev history action to confirm messages persist.

The local flow and transport are testable without keys. All five live providers, Cartesia audio quality/timestamps, tray behavior, and the voice-to-voice latency target require configured accounts and a live spoken question. Automated tests use mocked provider traffic and temporary storage. TTS failure falls back to full streaming text without discarding the LLM answer.

Implementation references: [AI SDK transcription](https://ai-sdk.dev/docs/ai-sdk-core/transcription), [AI SDK streaming](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text), [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage), and [Moonshot Kimi K2.5](https://huggingface.co/moonshotai/Kimi-K2.5).


Additional acceptance checks:
- Ask “which model are you?”, switch models using both Settings and the tray, and repeat. Kite should name the selected model and perform its costume reaction.
- Preview a voice, adjust speed, and ask a question. Speech should begin before the answer finishes streaming; motion should follow syllables.
- Interrupt during playback and after LLM completion. Check immediate silence and a new listening pose.
- Mute from the tray during playback. Text should remain available and a small mute glyph should appear.
- Use a retryable failure before the first token with fallback enabled; verify the bubble attribution and persisted provider/model. Fail after a token and verify no fallback.
- Ask for code or a long list. Kite gives a short spoken introduction; details remain in the bubble and appear immediately on hover.
