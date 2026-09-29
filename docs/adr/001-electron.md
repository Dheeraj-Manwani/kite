# Electron over Tauri

Status: Accepted for v1.

## Context

The companion needs transparent Windows overlays, native keyboard hooks, capture, audio playback, and a React UI.

## Options

Electron; Tauri with custom Rust integrations.

## Decision

Use Electron Forge with Vite and a narrowly scoped preload bridge.

## Consequences

We reuse mature APIs and TypeScript across processes, accepting a larger installer and memory footprint. Performance must be measured rather than assumed.

