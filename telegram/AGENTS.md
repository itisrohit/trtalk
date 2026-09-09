# AGENTS.md — TrTalk Telegram Gateway

The **Telegram channel adapter** for TrTalk: a thin, **stateless** bridge between Telegram and the core. Part of the [`itisrohit`](https://github.com/itisrohit/trtalk) stack — read the parent's [`docs/ARCHITECTURE.md`](https://github.com/itisrohit/trtalk/blob/main/docs/ARCHITECTURE.md) first. This gateway is the **mirror of [`whatsapp/`](https://github.com/itisrohit/whatsapp)** — when in doubt, copy its shape.

## Job

1. Receive Telegram webhook updates (text, photo, voice/audio, document, callback-query buttons).
2. **Normalize to the canonical message** (`docs/ARCHITECTURE.md` §5). Media is downloaded (`getFile` → file path → download) and inlined as a base64 `data:` URI in `media_url` (`app/services/media.py`) — Telegram file URLs need the bot token and the channel-agnostic core can never fetch them.
3. `POST` the core's `/ingest`.
4. Render the core's canonical response back to Telegram. An **empty `messages` list is silence** (human-mode conversations) — render nothing.
5. Expose **`POST /send`** (ADR-004, `app/services/sender.py`): the canonical **outbound** contract, mirror of `/ingest`, same `INTERNAL_API_KEY`. Types: `text`, and `image`/`document`/`audio` with `media_url` as a base64 `data:` URI (mirror of inbound) mapped to `sendPhoto`/`sendDocument`/`sendVoice`/`sendAudio`. Addressed by the **chat id** (`contact.external_id`). **No 24h window** → no `WINDOW_EXPIRED`; failures collapse to `SEND_FAILED`.

**Ack Telegram fast** (return 200 immediately) and process against the core asynchronously — Telegram retries and can disable a slow webhook.

## Stack

Python · **python-telegram-bot** (Bot client only — FastAPI owns the webhook route, ADR-006) · FastAPI · httpx · Sentry · `uv`.

## Identity (ARCHITECTURE §10 analog)

- Telegram has no BSUID. Canonical `contact.external_id` = the **chat id** (`message.chat.id`) — stable per conversation, and what replies are addressed to. Keep user id / username in `contact.metadata`. `wa_id` is WhatsApp-specific and stays `None`.

## Webhook authenticity

- Telegram echoes the secret set via `setWebhook(secret_token=…)` in the `X-Telegram-Bot-Api-Secret-Token` header on every call. Verify it against `TELEGRAM_WEBHOOK_SECRET`; 401 otherwise. This is the gateway's authenticity check (analog of Meta's `app_secret` HMAC) — keep it private/gitignored.

## Dev

```bash
cp .env.example .env     # bot token + webhook secret + CORE_URL
uv sync
make dev                 # :8001
```

## Planning

PRPs and the sprint plan live in the **parent repo** (`../PRPs`, `../docs`).

## Don't

- Add a database or business logic — this service is **stateless**.
- Require `wa_id` (that's WhatsApp-only; address by chat id).
- Block the webhook waiting on the core (ack first, process async).
- Run python-telegram-bot's `Application`/updater server — FastAPI owns the route (ADR-006).
- **Hardcode user-facing literals.** The agent localizes per-user via the system prompt; the few non-agent replies (core unreachable, unsupported type) are English defaults configurable via `.env` (`ERROR_REPLY`/`UNSUPPORTED_REPLY`) — set them per-deployment in your users' language. They must be gateway-local: they fire exactly when the core is unreachable.
- **Send canonical text raw.** `message.text` is Markdown (ARCHITECTURE §5, [ADR-007](https://github.com/itisrohit/trtalk/blob/main/docs/design/adr-007-canonical-markdown-rendering.md)); the gateway renders it to MarkdownV2 (`app/services/formatting.py`, with a plain-text fallback) before sending. Don't push channel formatting into the core.
