# TrTalk Web — embeddable chat widget + gateway

The **web channel** for the [TrTalk](https://github.com/itisrohit/trtalk)
stack: a floating chat **bubble** you embed on any page, and the **gateway** that
bridges anonymous visitors to the channel-agnostic core.

Unlike the WhatsApp/Telegram gateways, the web channel ships its own client, so
it is a **Node monolith** (Express + Vite + Preact) rather than a FastAPI
gateway — see [ADR-011](https://github.com/itisrohit/trtalk/blob/main/docs/design/adr-011-web-channel.md).

## Embed

```html
<script src="https://chat.your-domain.com/widget.js"
        data-gateway="https://chat.your-domain.com"></script>
```

`data-gateway` is optional (defaults to the script's origin). The bubble opens a
chatbox; a visitor is identified by an anonymous UUID in `localStorage`.

What the visitor gets: **live agent replies over SSE**, image attachments with
caption (attach-first: thumbnail staged in the composer, sent together), voice
notes, conversation **rehydration** on reopen, and the agent's
WhatsApp-flavored formatting rendered properly (`*bold*`, bullets, links).
Shadow-DOM isolated, ~11 kB gzip, zero dependencies on the host page.

## How it fits

```
browser (widget.js)  ──POST /chat──▶  gateway  ──POST /ingest (key)──▶  core
        ▲                                │                                 │
        └────────── SSE /stream ─────────┘  ◀──── POST /send (key) ────────┘  (deferred, ADR-008)
```

The gateway holds the `INTERNAL_API_KEY` and the visitor→SSE map; the core never
learns the browser exists (one config var + one generic history read).

## Develop

```bash
npm install
npm run dev      # gateway on :8002
npm run build    # bundle the widget → dist/widget.js
npm test         # server + widget tests
```

Then open **http://localhost:8002/demo** to try the widget over a real page.

See [`AGENTS.md`](./AGENTS.md) for the design, routes, trust boundary, and the
streaming escape hatch.
