# AGENTS.md — TrTalk Admin

The **operator panel** for TrTalk: edit prompts, manage the FAQ knowledge base, toggle/configure tools, and inspect conversations. Part of the [`itisrohit`](https://github.com/itisrohit/trtalk) stack — read the parent's [`docs/ARCHITECTURE.md`](https://github.com/itisrohit/trtalk/blob/main/docs/ARCHITECTURE.md) first.

## ⚠️ Design

**Read [`DESIGN.md`](./DESIGN.md) (repo root) BEFORE writing any UI.** It is the design sheet (TrTalk brand tokens: warm neutrals + single amber accent `#EA9B27`, terracotta `#C94B22` = destructive, charcoal `#1C1917` chrome; Rubik / Monaco). Match its colors, typography, and component style — colors ONLY via the CSS tokens in `src/index.css`.

## Stack

React 19 · TypeScript · Vite · TanStack Query · Tailwind CSS · shadcn/ui · react-i18next · `npm`.

## Key rules (see ARCHITECTURE)

- It's a **SPA** that talks **directly to the core REST API** (JWT). No BFF, no SSR, no server functions.
- **Admin-only login (§4).** End users never access the admin and never authenticate.
- Scope: editable prompts (`/prompt`) · FAQ/RAG manager (`/faq`) · tool enable/config (`/tools`) · conversation inspection + human-handoff inbox (`/conversations`) · captured leads (`/leads`).
- **i18n HARD RULE: no hardcoded UI strings** — everything through `t()` (`react-i18next`, locales in `src/locales/{en,es}.json`). Adding a string = adding the key to BOTH locales (a vitest guard fails on key drift). Default locale via `VITE_DEFAULT_LOCALE`; the header switcher persists to `localStorage`.
- **Module settings render themselves**: `/tools` builds forms from each module's `config_schema()` JSON Schema via `src/components/tools/SchemaForm.tsx` (flat schemas: str/int/float/bool). A new core module needs ZERO admin changes.
- Data layer: TanStack Query hooks in `src/hooks/` (`useAgentConfig`, `useFaq`, `useContacts`, `useMediaUrl`, `useLeads`); axios client with JWT refresh in `src/lib/api-client.ts`.
- **Media in the timeline (ADR-003):** `<img>`/`<audio>` can't send the JWT header, so `MessageMedia` fetches `GET /admin/media/{id}` (presigned URL as JSON, short-lived — keep `staleTime` below the expiry) and feeds the URL to the tag. Fallback when `has_media` is false or the fetch fails: the type badge.
- **Handoff inbox (ADR-004):** conversations carry `mode` (`agent`/`human`); the open thread **polls** (`refetchInterval` ~5s in `useContacts` — no websockets, omakase). "Take over"/"Resume bot" → `PUT .../mode`; the human-mode composer → `POST .../messages` (gateway error `detail.code`, e.g. `WINDOW_EXPIRED`, gets a specific i18n message). The **WhatsApp 24h window** is computed client-side from `last_inbound_at` (countdown, disabled composer when closed) — advisory only, Meta is the authority.

## Dev

Requires **Node ≥ 20.19** (Vite 8 / Vitest 4 / ESLint 10). An `.nvmrc` pins Node 22 LTS.

```bash
nvm use                       # picks Node 22 from .nvmrc
npm install && npm run dev    # http://localhost:5191
npm run build && npm run lint && npm test
```

## Planning

PRPs and the sprint plan live in the **parent repo** (`../PRPs`, `../docs`).

## Don't

- Add SSR / server functions (keep it a Vite SPA).
- Add end-user authentication.
- Write UI that ignores `DESIGN.md`.
