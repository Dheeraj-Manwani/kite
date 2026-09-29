# Groq batch transcription

Status: Accepted for v1.

## Context

True push-to-talk provides a complete bounded recording on key release.

## Options

Continuous streaming transcription; batch WebM transcription.

## Decision

Send the completed audio to Groq after release, dropping silence and too-short holds locally.

## Consequences

The pipeline is simpler and uploads only deliberate utterances, but transcription cannot begin until release. Measure that cost in voice-to-voice metrics.

