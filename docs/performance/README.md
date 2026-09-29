# Measured performance

Measured 2026-09-29 on Windows 11 build 26200, Intel Core i7-14650HX, Electron 44.4.5. Reproduce with `npm run perf` after completing `npm run make`. Raw per-second samples and method are in [latest.json](latest.json).

The first local run averaged **0.72% idle CPU**, **454 MB total process working set**, and **20 rendered physics frames/s** when dozing. With a moving cursor it averaged **60 fps**, **1.77% CPU**, and **0.14 ms of JavaScript frame work**. A packaging process was also running on the workstation during this first sample; repeat on a quiet workstation before treating it as a release baseline.

The test loads the production Vite bundle in Electron with a fresh profile, denies microphone access, and uses no provider keys. It settles for 35 seconds, samples 12 times at one-second intervals with a stationary cursor, then repeats with a synthetic moving cursor. It is not a clean-VM installed-app benchmark or a voice-workload benchmark.

CPU is the sum of Electron `percentCPUUsage` across its processes. Total memory sums process working sets, so shared pages can be counted more than once; main-process memory uses private memory. Frame-work time measures JavaScript loop execution, excluding the wait until the next animation frame and browser compositor work. Average 60 fps does not guarantee zero dropped frames.

**Voice-to-voice median: not measured; zero live samples.** The fresh-profile harness must not invent provider results. After real conversations, the Perf panel computes the median of non-interrupted `voice_to_voice_ms` SQLite rows. These measure release-to-playback acknowledgement with reported device output latency, not acoustic latency.

The renderer smoke test runs 50 sequential playback interactions and verifies one live playback AudioContext at most and unchanged IPC listener counts. This is a regression check, not an exhaustive long-running heap profile. Settings and history teardown, microphone permission cancellation, and production startup are checked separately.
