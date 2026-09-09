import type { ComponentChildren } from 'preact'

/**
 * Canonical Markdown → Preact nodes. `message.text` is standard Markdown
 * (ARCHITECTURE §5, ADR-007); each gateway renders it to its platform — this
 * widget's platform is the DOM. Renders the canonical subset: **bold**,
 * *italic* / _italic_, ~~strike~~, `code`, ``` fences, "- " bullets, headings
 * (as bold — a chat bubble has no h1..h6), [label](url) and bare URLs.
 * XSS-safe by construction — everything is emitted as text nodes or our own
 * elements, never raw HTML.
 */

// Alternation order is precedence: code first (protects its contents), then
// bold before italic (`**` must not be read as two `*`).
const INLINE = new RegExp(
  [
    '(`[^`\\n]+`)', // 1: inline code
    '(\\*\\*[^\\n]+?\\*\\*|__[^\\n]+?__)', // 2: bold
    '(\\*[^\\s*](?:[^*\\n]*?[^\\s*])?\\*|_[^\\s_](?:[^_\\n]*?[^\\s_])?_)', // 3: italic
    '(~~[^~\\n]+?~~)', // 4: strikethrough
    '(\\[[^\\]\\n]+\\]\\(https?://[^)\\s]+\\))', // 5: [label](url)
    '(https?://[^\\s]+)', // 6: bare URL
  ].join('|'),
  'g',
)

const LINK = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/

/** Trailing punctuation that reads as prose, not as part of a URL. */
const URL_TRAIL = /[.,;:!?)\]}'"]+$/

function renderInline(text: string): ComponentChildren[] {
  const out: ComponentChildren[] = []
  let last = 0
  for (let m = INLINE.exec(text); m; m = INLINE.exec(text)) {
    const tok = m[0]
    // `_` never emphasizes intra-word (snake_case stays literal) — CommonMark.
    if (
      tok[0] === '_' &&
      (/\w/.test(text[m.index - 1] ?? '') || /\w/.test(text[m.index + tok.length] ?? ''))
    ) {
      INLINE.lastIndex = m.index + 1
      continue
    }
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1]) out.push(<code>{tok.slice(1, -1)}</code>)
    else if (m[2]) out.push(<strong>{tok.slice(2, -2)}</strong>)
    else if (m[3]) out.push(<em>{tok.slice(1, -1)}</em>)
    else if (m[4]) out.push(<s>{tok.slice(2, -2)}</s>)
    else if (m[5]) {
      const link = LINK.exec(tok)!
      out.push(
        <a href={link[2]} target="_blank" rel="noopener noreferrer">
          {link[1]}
        </a>,
      )
    } else {
      const trail = URL_TRAIL.exec(tok)
      const url = trail ? tok.slice(0, -trail[0].length) : tok
      out.push(
        <a href={url} target="_blank" rel="noopener noreferrer">
          {url}
        </a>,
      )
      if (trail) out.push(trail[0])
    }
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** A bullet is "- item" / "* item" (delimiter + space); *bold* has no space. */
const BULLET = /^(\s*)[-*+]\s+(.*)$/
const HEADING = /^#{1,6}\s+(.*)$/

function renderLines(text: string): ComponentChildren[] {
  const out: ComponentChildren[] = []
  text.split('\n').forEach((line, i) => {
    if (i > 0) out.push('\n')
    const bullet = BULLET.exec(line)
    const heading = bullet ? null : HEADING.exec(line)
    if (bullet) {
      out.push(bullet[1], '• ', ...renderInline(bullet[2]))
    } else if (heading) {
      out.push(<strong>{renderInline(heading[1])}</strong>)
    } else {
      out.push(...renderInline(line))
    }
  })
  return out
}

const FENCE = /```[\w-]*\n?([\s\S]*?)```/g

export function renderMarkup(text: string): ComponentChildren[] {
  const out: ComponentChildren[] = []
  let last = 0
  for (let m = FENCE.exec(text); m; m = FENCE.exec(text)) {
    if (m.index > last) out.push(...renderLines(text.slice(last, m.index).replace(/\n$/, '')))
    out.push(
      <pre>
        <code>{m[1].replace(/\n$/, '')}</code>
      </pre>,
    )
    last = m.index + m[0].length
    if (text[last] === '\n') last += 1
  }
  out.push(...renderLines(text.slice(last)))
  return out
}
