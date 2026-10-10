# Temporary capture exclusion

Status: Accepted for v1.

## Context

Kite should be absent from its own screenshots but visible in ordinary recordings.

## Options

Permanent content protection; hide-only capture; temporary protection plus hiding.

## Decision

Enable content protection, hide overlay content, wait about two frames, capture, and restore in finally.

Phase 3 (11 October 2026) makes capture lazy: an ordinary voice hold never enters this path. The first deliberate screen mark, or an approved screen-read tool, does.

A temporary-protection-only strategy is implemented in the capture helper and tested with a visible synthetic overlay. It passed on the available Windows display at 100% scaling. Shipping capture retains the hiding fallback pending mixed-display scaling and OBS/Game Bar checks; the test does not enable a new default globally.

Reference: [Electron content protection](https://www.electronjs.org/docs/latest/api/browser-window/#winsetcontentprotectionenable). Protection takes effect with desktop composition and differs across Windows versions and capture paths.

## Consequences

OBS/Game Bar can show Kite during normal use. Windows versions and capture paths differ, so explicit test capture and manual recording verification remain required.

