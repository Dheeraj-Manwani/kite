# Model and voice API verification

Catalog seeds were checked while building this change on **2026-09-28** against provider documentation, rather than copied from memory. They are a build-time snapshot, not an availability guarantee for a particular account.

- OpenAI: https://developers.openai.com/api/docs/models — `gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna`; text and image input. OpenAI uses Responses; Sol/Luna use no reasoning for voice latency.
- Anthropic: https://platform.claude.com/docs/en/models/overview — `claude-opus-5-5`, `claude-sonnet-5`, `claude-haiku-4-5`.
- Google: https://ai.google.dev/gemini-api/docs/models — `gemini-3.1-pro-preview`, `gemini-3.8-flash`, `gemini-3.5-flash-lite`.
- Groq: https://console.groq.com/docs/models — `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `llama-3.1-8b-instant`. The latter is listed as enterprise; availability depends on account. Speech recognition stays `whisper-large-v3-turbo`.
- Moonshot: https://platform.kimi.ai/docs/models — `kimi-k3`, `kimi-k2.6`, `kimi-k2.7-code-highspeed`. K2.5 is listed as discontinued August 31, 2026. Preserve the existing K2.6 default and its non-thinking request option; do not send that option to unknown models.
- **Jobs model** (Settings → Models & keys): runs tasks and jobs. Automatic picks `deepseek-flash` when a DeepSeek key is saved, else the main model (`jobsModel` in `src/shared/agent.ts`). The `do_task` card names it.
- DeepSeek (checked **2026-10-01** against https://api-docs.deepseek.com/quick_start/pricing and the live API): `deepseek-flash` (images, tools; tier *fast*) and `deepseek-v4-pro` (no images, tools; tier *flagship*). Base URL `https://api.deepseek.com`, OpenAI format. Thinking is on by default, and with tools it requires `reasoning_content` to be sent back on every later request or the API returns 400, so Kite sends `thinking: { type: "disabled" }` to **every** DeepSeek model; both listed models accept it. `tool_choice: "required"` is accepted (undocumented; checked live). Images go as `image_url` data URLs in a user message. `deepseek-flash` is a moving alias: responses report `deepseek-flash`, not a version. When busy, the API holds requests open with keep-alives for up to 10 minutes, so a task decision is capped at 60 s (`decisionTimeoutMs` in `src/main/agent/model.ts`). DeepSeek stores data in the People's Republic of China (privacy policy).

What each provider's API accepts (a required tool choice; images inside tool results) is in `providerTraits` in `src/main/ai/catalog.ts`. Call sites read it rather than naming providers.

Refresh models uses authenticated provider endpoints (OpenAI/Groq/Moonshot/DeepSeek `/models`, Anthropic `/v1/models`, Google `/v1beta/models`). Anthropic and Google pagination is followed. Only Google advertises generation methods; other APIs do not consistently expose vision/tier metadata. Unknown discoveries get no vision badge and a default `fast` grouping. Known seed metadata takes precedence. Custom model IDs are retained in the local catalog.

Key tests request only “Hi.” with a 5-token cap. OpenAI Responses enforces a **16-token minimum cap**, so that adapter uses 16 with reasoning disabled; the requested visible answer is still 1–5 tokens. Reference: https://developers.openai.com/api/reference/java/resources/beta/subresources/responses/methods/create . HTTP 400/404 is reported separately as model unavailable, not as a bad key.

Cartesia references:

- https://docs.cartesia.ai/api-reference/tts/websocket — context IDs, `continue`, context cancellation, base64 audio, word timestamps.
- https://docs.cartesia.ai/api-reference/voices/list — paginated voices with `starting_after` and `next_page`.
- https://docs.cartesia.ai/api-reference/tts/working-with-web-sockets/context-flushing-and-flush-i-ds — continued contexts and flush semantics.

The requested `sonic-3.5` is pinned in `ttsConfig`, rather than following `sonic-latest`. API version is `2026-08-14`. Audio is mono raw `pcm_f32le` at 44.1 kHz, with word timestamps and per-context speed. An explicit main-process WebSocket transport handles bounded exponential reconnect attempts, serialized sends, context cancellation, and five-minute idle closure. It never replays an interrupted context after a connection loss.
