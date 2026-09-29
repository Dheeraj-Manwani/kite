# Screenshots are not persisted by default

Status: Accepted for v1.

## Context

Screens can contain private data, and old images add cost to later turns.

## Options

Persist all screenshots; retain indefinitely in context; memory-only with explicit history opt-in.

## Decision

Keep captures in memory for the turn, replace image context with a text placeholder, and persist only when screenshot history is enabled.

## Consequences

Default sessions leave no screenshot files. Annotation metadata remains useful in history. Opt-in JPEGs require attachment tracking and deletion alongside conversations.

