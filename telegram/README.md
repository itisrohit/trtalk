# TrTalk Telegram Gateway

Telegram channel adapter for [TrTalk](https://github.com/itisrohit/trtalk), the open-source stack for building custom AI chat agents.

A thin, **stateless** bridge: it receives Telegram webhook updates, normalizes them to TrTalk's canonical message contract, forwards them to the [core](https://github.com/itisrohit/core)'s `/ingest`, and renders replies back to Telegram. No database, no business logic — the core never knows Telegram exists.

It also implements the **canonical outbound contract** (`POST /send`, ADR-004) — the mirror of `/ingest`, authenticated with the same `INTERNAL_API_KEY` — so operators can reply from the admin panel (human-handoff inbox). Unlike WhatsApp, Telegram has no 24h customer-service window, so the outbound path is simpler (no `WINDOW_EXPIRED`).

> **Status: scaffold.** The app boots and `/health` works; inbound webhook processing and outbound `POST /send` are in progress. Tracked in the parent's [Sprint 9 epic](https://github.com/itisrohit/trtalk/issues/6) (PRP: [`PRPs/sprint-09-telegram-channel.md`](https://github.com/itisrohit/trtalk/blob/main/PRPs/sprint-09-telegram-channel.md)).

## Stack

Python · python-telegram-bot · FastAPI · httpx · Sentry · `uv`.

## Local dev

```bash
cp .env.example .env     # Telegram bot token + webhook secret + CORE_URL
                         # how to get a bot token (@BotFather):
                         # https://github.com/itisrohit/trtalk/blob/main/docs/TELEGRAM-SETUP.md
uv sync
make dev                 # serves on :8001 (GET /health)
```

Read the parent's [`docs/ARCHITECTURE.md`](https://github.com/itisrohit/trtalk/blob/main/docs/ARCHITECTURE.md) (§5 canonical contract, §5.1 / ADR-004 outbound) first.

## License

[Apache-2.0](./LICENSE).
