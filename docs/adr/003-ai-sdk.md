# Vercel AI SDK

Status: Accepted for v1.

## Context

Five providers need consistent streaming, tool calls, and multimodal message handling.

## Options

Handwritten HTTP adapters; provider SDKs individually; shared AI SDK.

## Decision

Use AI SDK adapters behind Kite's provider boundary. This checkout installs SDK 7.

## Consequences

A shared agent/tool loop reduces duplication. Provider capabilities still differ; catalog gating and serialization tests remain necessary, and major-version changes need review.

