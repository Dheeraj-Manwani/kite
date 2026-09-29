# DOM/SVG overlay

Status: Accepted for v1.

## Context

Kite combines spring motion, text, annotations, controls, and accessible settings.

## Options

Native drawing; canvas-only UI; DOM/SVG in a transparent window.

## Decision

Use React for UI, an imperative SVG physics loop for motion, and a click-through non-focusable Electron overlay.

## Consequences

Text and controls retain browser accessibility, while animation avoids React frame updates. Interaction/focus must be scoped carefully so drawing never reaches underlying apps.

