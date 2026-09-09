# DESIGN.md — TrTalk Admin design sheet

> **Read this before writing any UI.** Every color goes through the CSS
> tokens in `src/index.css`; never hardcode a hex in a component.
> Brand assets + rationale: parent repo `docs/assets/brand/`.

## Identity

The mark is a **trtalk** — the Inca relay messenger — running with a
letter, hair streaming into a chat bubble. Flat, geometric, warm. The UI
follows the same posture: **~90% warm neutrals, amber as the single
accent**, charcoal as ink. Calm chrome, vivid signal.

## Brand palette (canonical)

| Name | Hex | Role |
|---|---|---|
| Amber | `#EA9B27` | THE accent: primary actions (dark mode), active nav, focus rings, brand moments |
| Terracotta | `#C94B22` | Destructive / urgent-attention (it IS `--destructive`) |
| Cream | `#EFDEC4` | Light-surface family root; wordmark on dark |
| Charcoal | `#1C1917` | Ink, dark canvas, sidebar chrome |

## UI tokens (derived — see `src/index.css` for the full set)

**Light mode**: warm paper canvas `#F8F5EE`, white cards, charcoal ink
`#221C16`, warm-gray muted `#786A58`, cream-tinted secondary/accent
surfaces, **primary buttons are charcoal** (with warm-white text) — amber
is reserved for focus rings, active states and brand moments.

**Dark mode**: charcoal canvas `#1C1917` (the mark's own canvas), warm
dark cards `#262019`, **primary buttons are amber** with charcoal text.

**Sidebar (both modes)**: charcoal chrome with amber active state — the
lockup SVG blends seamlessly (same canvas color).

### Hard rules

- **Amber is never body/text color on light surfaces** — it fails WCAG
  contrast. Use it as a fill with dark text on top; darken it if a link
  color is ever needed.
- **Terracotta = destructive.** Don't use it as a decorative accent; the
  panel's danger semantics depend on it staying meaningful.
- **One accent.** Don't introduce new accent hues; reach for neutrals
  first, amber second, nothing third.
- **Chat bubbles are conventions, not brand**: the conversation timeline
  keeps messaging-app visual language (outgoing vs incoming neutrals) so
  operators feel at home.
- Status colors (`--success/--warning/--info`) are semantic oklch values —
  leave them alone.

## Typography

| Use | Font |
|---|---|
| UI copy, headings | **Rubik** (Google Fonts, loaded in `index.html`) |
| Code, IDs, payloads | **Monaco** / ui-monospace |
| Brand compositions (wordmark lockups, marketing) | **Space Grotesk** (OFL) — never redraw the wordmark by hand |

Scale: Tailwind defaults; headings `font-semibold`, body `text-sm`/`text-base`.

## Components

- shadcn/ui primitives, themed exclusively through the tokens — a restyle
  is a token swap, never a component edit (proven: the Sentry-violet →
  TrTalk-amber migration was one `index.css` diff).
- Radius: `--radius: 0.625rem` (cards `rounded-lg`, pills `rounded-full`).
- Depth: borders over shadows on dark; subtle shadows allowed on light
  (`shadow-xl` for floating panels like the emoji picker).
- Buttons: default = `primary` (charcoal light / amber dark); destructive
  variant for irreversible actions; ghost for toolbars.
- Focus: amber ring (`--ring`) — keyboard navigation must always be
  visible.

## Assets in this repo

| File | Use |
|---|---|
| `public/favicon.svg` | The icon (charcoal square + runner) |
| `public/trtalk-icon.svg` | Login card mark (64px, `rounded-2xl`) |
| `public/trtalk-logo.svg` | Sidebar lockup (36px tall, blends with the sidebar) |

## Don't

- Hardcode hex values in components (tokens only).
- Use amber for long text or icons-on-light without a fill behind it.
- Add a second accent color, gradients, or glassmorphism.
- Restyle shadcn components inline — extend via tokens or a variant.
