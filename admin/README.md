# TrTalk Admin

React + Vite admin panel for [TrTalk](https://github.com/itisrohit/trtalk), the open-source stack for building custom AI chat agents (WhatsApp first; more channels on the roadmap).

The operator panel: edit agent prompts, manage the FAQ knowledge base (RAG), enable/configure tools, and inspect conversations. A SPA that talks directly to the [core](https://github.com/itisrohit/core) REST API. Admins only — end users never access it.

## Stack

React 19 · TypeScript · Vite · TanStack Query · Tailwind CSS · shadcn/ui · react-i18next.

## Pages

| Route | What it does |
|---|---|
| `/` | Dashboard — section overview + "waiting for a human" counter |
| `/prompt` | Edit the agent's system prompt (`agent_config`) — takes effect next turn, no redeploy |
| `/faq` | FAQ knowledge base: CRUD, re-embed all, retrieval preview with similarity scores |
| `/tools` | Tool registry: per-tool enable switches + module settings **auto-rendered from each module's `config_schema()`** JSON Schema (`SchemaForm`) |
| `/conversations` | Contacts → chat timeline (inline images / playable audio via presigned URLs when the core has storage configured) + per-contact memories. **Human-handoff inbox** (ADR-004): 🚨 badge + "needs human" filter, "Take over"/"Resume bot", a composer that sends through the channel (polling ~5s) and surfaces WhatsApp's 24h window (countdown / disabled when closed) |
| `/leads` | Leads the agent captured (name, contact, email/phone, interest, configurable extra fields) |

## Local dev

```bash
cp .env.example .env     # set API URL (default http://localhost:8090)
npm install
npm run dev              # http://localhost:5191 (port via VITE_PORT in .env)
```

## i18n

The UI is fully bilingual (es/en) via `react-i18next` with JSON locales
(`src/locales/{en,es}.json`).

- **HARD RULE: no hardcoded UI strings** — every user-visible literal goes
  through `t()`. A vitest guard enforces key parity between locales.
- Default locale: `VITE_DEFAULT_LOCALE` (.env); the header switcher persists
  the user's choice in `localStorage`.
- The backend stays English-only (see the parent's AGENTS.md i18n posture);
  the frontend translates.

## Design

UI follows [`DESIGN.md`](./DESIGN.md) (Sentry-inspired design sheet). Point your coding agent at it before building UI.

## Architecture

See the parent's [`docs/ARCHITECTURE.md`](https://github.com/itisrohit/trtalk/blob/main/docs/ARCHITECTURE.md).

## License

[Apache-2.0](./LICENSE).
