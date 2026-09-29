# Drop general desktop automation

Status: Accepted for v1.

## Context

V1 tools need a small auditable set of actions, not unconstrained mouse/keyboard control.

## Options

General nut.js automation; arbitrary shell; narrow OS APIs.

## Decision

Use validated app paths, Electron shell/clipboard APIs, and a narrowly scoped paste shortcut. Do not include general mouse automation.

## Consequences

Less dependency and permission surface, with clearer approvals. Broader computer-use belongs in a future explicitly designed and confirmed mode.

