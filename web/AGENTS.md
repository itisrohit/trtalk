# AGENTS.md — TrTalk Web Gateway

The **web channel adapter** for TrTalk: an embeddable chat **widget** for
anonymous site visitors, plus the thin **gateway** that bridges it to the core.
Part of the [`itisrohit`](https://github.com/itisrohit/trtalk) stack —
read the parent's [`docs/ARCHITECTURE.md`](https://github.com/itisrohit/trtalk/blob/main/docs/ARCHITECTURE.md)
and [`ADR-011`](https://github.com/itisrohit/trtalk/blob/main/docs/design/adr-011-web-channel.md) first.

## Why this gateway is different (read this)

Unlike WhatsApp/Telegram, the web channel **ships its own client** (there is no
third-party app), so — by ADR-011 — it is **a Node monolith, not a FastAPI
gateway, and not part of the admin**. One repo, two artifacts, one `npm`:

- **`src/server`** — an **Express** gateway (the bridge).
- **`src/widget`** — the embeddable UI (**Vite + Preact via `preact/compat`**),
  Shadow-DOM isolated, served by the server as `dist/widget.js`.

The core stays channel-agnostic: it speaks only the canonical contract. This
gateway adds **no business logic** — it is transport + UI.

## Job

1. **Serve the widget** (`GET /widget.js`) — a `<script>` a customer pastes on
   any page → floating bubble → chatbox.
2. **Inbound** (`POST /chat`): translate the widget message to the canonical
   contract (§5) — media inlined as a base64 `data:` URI (ADR-003) — and `POST`
   the core's `/ingest`.
3. **Live outbound** (`GET /stream` SSE + `POST /send`): hold the visitor's SSE
   connection; when the core dispatches a deferred reply (ADR-004/008) to
   `POST /send`, push it down the stream. Complete messages, not token chunks.
4. **Rehydration** (`GET /history`): proxy the core's internal history read so a
   (re)opened widget shows past turns — including replies delivered while the tab
   was closed. The browser never holds the internal key.

## Identity (ARCHITECTURE §10 analog)

Anonymous. A **UUID in `localStorage`** is the `contact.external_id` (§5's
"channel-scoped id otherwise"). One visitor → one conversation. Cleared storage =
a new visitor (accepted). Capturing a name/email is a **system-prompt / tool**
concern, never the channel's.

## Trust boundary (ADR-011 §5)

The browser talks **only** to this gateway's public routes (`/chat`, `/stream`,
`/history`, `/widget.js`). The `INTERNAL_API_KEY` lives **only** here and is used
on the core hops + to verify inbound `/send`. Public routes enforce an **origin
allowlist** (`WEB_ALLOWED_ORIGINS`) + a **per-visitor rate limit**. `/send` is
core→gateway (internal key), not origin-checked.

## Layout

```
src/server/  app.ts (wiring) · config.ts · core-client.ts · streams.ts (visitor→SSE map)
             canonical.ts · routes/{chat,stream,send,history}.ts · middleware/{origin,rateLimit,internalKey}.ts
src/widget/  index.ts (mount + Shadow DOM) · ui.tsx (Preact) · api.ts (fetch + EventSource) · visitor.ts · styles.ts
public/      demo.html (dev-only visual QA harness, served statically)
```

## Dev

```bash
npm install
npm run dev        # gateway on :8002 (tsx watch)
npm run build      # vite → dist/widget.js
npm test           # vitest (server + widget)
npm run typecheck
```

Local QA: run the core (with `CHANNEL_WEB_SEND_URL=http://localhost:8002/send`)
and this gateway, then open **http://localhost:8002/demo** — the bubble over a
real page (ADR-011 / PRP Validation Level 4).

## Scaling note (MVP)

The `visitor → SSE` map is **in-memory** ⇒ single replica or sticky sessions for
the MVP. Horizontal scale needs a shared pub/sub (Redis) or core-side fanout — a
documented follow-up, not assumed.

## Extending to streaming (the escape hatch)

Chunked / token-by-token streaming is **deliberately out of MVP** (homologation:
the core stays one-shot). The browser transport is already event-based, so
adding it is a **gateway-local** change that never touches the core contract:
emit additional `chunk` SSE events from `streams.ts` as partial text arrives and
have `ui.tsx` append them. The core keeps sending one-shot `/send`.

## Don't

- Put business logic here — it's a channel adapter (transport + UI only).
- Leak `INTERNAL_API_KEY` to the browser, or origin-check `/send`.
- Ship token streaming in the MVP (see above).
- **Render canonical text as a channel dialect.** `message.text` is standard
  Markdown (ARCHITECTURE §5, [ADR-007](https://github.com/itisrohit/trtalk/blob/main/docs/design/adr-007-canonical-markdown-rendering.md));
  the widget renders that — and only that — in `src/widget/markup.tsx`. Don't
  parse WhatsApp-flavored markup here, and don't push formatting into the core.
- Hardcode user-facing copy — the two literals are `.env` (`ERROR_REPLY`,
  `UNSUPPORTED_REPLY`), English default; everything else the agent localizes.
