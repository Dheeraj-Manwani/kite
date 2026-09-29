# Screen vision and annotation

Hold **Ctrl + Win**, wait for the crosshair, then circle, underline, point with an arrow, or tap. Speak while holding, then release. Several marks can be compared in one turn. A silent marked hold asks “What is this?” Ink stays through the answer (including spoken tool approvals), then fades.

Kite captures the display under the cursor before enabling ink. Early clicks are swallowed while capture is pending. Strokes starting outside that display are ignored. There are at most five strokes and 2,000 points per hold. Monitor layout or scaling changes cancel the current interaction, preventing stale coordinates.

Ask “what’s on my screen?” without drawing to use `read_screen`. The tool requests confirmation by default. **Settings → Screen vision** includes:

- **Vision model:** Kimi K2.5 by default, with configured vision models including Groq Llama 4 Scout available in the picker.
- **Let Kite look at my screen without asking:** off by default. This changes only `read_screen` approval.
- **Keep screenshots in history:** off by default. Enabling it writes prepared JPEGs to `userData/screens/` and records their paths in `attachments`.

The “Kite is looking” indicator is always shown. During capture, content protection temporarily excludes the overlay, and the renderer also hides every overlay layer except the indicator. A renderer acknowledgment and approximately 40 ms of settling precede capture. Protection and visibility restore in `finally`. Captures are serialized, and canceled queued captures are skipped.

## Images and history

Stroke points are overlay-local DIP. Main adds the overlay origin, checks the starting display, and classifies marks. Pixel mapping subtracts the captured display’s origin and multiplies by its scale factor. The prepared images are:

1. An overview with magenta marks, JPEG quality 0.85, long edge at most 1,568 pixels.
2. A union crop with 20% padding on each side, at least 300 × 300 capture pixels when the display allows it, clamped to the capture. Its long edge is capped at 1,568 pixels.

Taps receive magenta rings. Underlines include the line and text immediately above it; arrow regions surround the estimated tip. These classifications are geometric heuristics, so unusual shapes may need a clearer mark.

Images stay in memory by default. User rows retain mark types, DIP regions, and capture timing. After completion or cancellation, rolling conversation images become a text placeholder containing the answer. Tool audits never serialize image bytes. The explicit developer test capture is the sole default-off-history exception: it saves a PNG to the OS temp folder.

Vision turns route to a configured vision-capable model and identify it in the bubble. The assistant history row records the answering model. Explicit English screen requests are detected before selecting a model so a text-only model can hand the turn to vision. With no configured vision-capable provider, the bubble offers settings.

## AI SDK compatibility

This repository currently installs AI SDK 7. User messages retain the requested `image` parts, which SDK 7 accepts through its compatibility conversion (it emits a deprecation warning). Native tool outputs use SDK 7’s `content` / `file` shape. OpenAI Responses, Anthropic, and Google adapters accept these image tool results. The installed Groq and OpenAI-compatible (Moonshot) adapters stringify tool content; Kite instead sends the image as a follow-up user message before the next model call. Approval and the existing action/model-call budgets remain in force.

Reference: [AI SDK tool calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling). Adapter behavior was also checked against the installed package source and exercised with mocked agent-loop requests.

## Verification

- `npm test`: geometry, scale factors 1 / 1.25 / 1.5 / 2, negative origins, crop clamping/minimums, routing, context cleanup, capture cleanup on failure, silent marked turns, approval policy, image tool results/follow-up injection, metadata-only default persistence, opt-in attachments, and annotated note/search actions.
- `npm run test:native`: SQLite migrations, annotation metadata, settings defaults, native storage and existing persistence checks.
- `npm run package`, then `npm run test:renderer`: actual OffscreenCanvas JPEG sizes, magenta tap pixels, input interception, five-stroke limit, voice-approval mark preservation, fading, and capture hiding.
- `npm run test:startup`: bundled app and IPC startup.
- `npm run test:capture`: **temporarily covers the cursor’s display with a synthetic green window**. It checks that an overlay marker appears in a normal desktop capture, is absent from Kite’s explicit dev PNG, and returns in a normal capture afterward. It uses temporary app data and no provider calls. The test saves its fixture PNG under the OS temp `kite-captures` folder.

The real capture check passed on the available 100% display. Provider responses were mocked, not billed live. Still verify on the target desktop: spoken word identification, two-image comparison, 125% / 150% mixed-monitor pointer alignment, and continuous OBS/Game Bar recording before/during/after capture. The native capture test checks restoration of normal capture visibility; it does not substitute for testing those recording applications.
