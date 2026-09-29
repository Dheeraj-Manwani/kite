# Temporary capture exclusion

Status: Accepted for v1.

## Context

Kite should be absent from its own screenshots but visible in ordinary recordings.

## Options

Permanent content protection; hide-only capture; temporary protection plus hiding.

## Decision

Enable content protection, hide overlay content, wait about two frames, capture, and restore in finally.

## Consequences

OBS/Game Bar can show Kite during normal use. Windows versions and capture paths differ, so explicit test capture and manual recording verification remain required.

