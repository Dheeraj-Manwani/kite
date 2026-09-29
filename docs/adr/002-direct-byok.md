# Direct BYOK without a backend

Status: Accepted for v1.

## Context

Kite is a personal companion whose users choose and pay their model providers.

## Options

Hosted proxy with managed billing; direct provider calls.

## Decision

Keep provider traffic and encrypted user credentials in main, with no Kite backend.

## Consequences

No central account or telemetry service is needed. Users manage keys, quotas, and provider privacy terms; secrets never return to renderer after saving.

