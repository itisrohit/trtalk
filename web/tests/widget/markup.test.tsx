// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from 'preact'
import { renderMarkup } from '../../src/widget/markup'

function html(text: string): string {
  const host = document.createElement('div')
  render(<div>{renderMarkup(text)}</div>, host)
  return host.innerHTML
}

describe('renderMarkup (canonical Markdown, ADR-007)', () => {
  it('renders **bold**, *italic*, _italic_, ~~strike~~ and `code`', () => {
    const out = html('a **b** c *d* e _f_ g ~~h~~ i `j`')
    expect(out).toContain('<strong>b</strong>')
    expect(out).toContain('<em>d</em>')
    expect(out).toContain('<em>f</em>')
    expect(out).toContain('<s>h</s>')
    expect(out).toContain('<code>j</code>')
  })

  it('reads __bold__ too and never leaves stray asterisks around **bold**', () => {
    expect(html('__b__')).toContain('<strong>b</strong>')
    expect(html('**b**')).not.toContain('*')
  })

  it('does not italicize snake_case identifiers', () => {
    expect(html('usa visitor_id_key aquí')).toContain('visitor_id_key')
  })

  it('turns "- item" / "* item" lines into bullets but keeps emphasis intact', () => {
    const out = html('* Aceptamos devoluciones de **30 días**.')
    expect(out).toContain('• ')
    expect(out).toContain('<strong>30 días</strong>')
    expect(html('- uno\n- dos')).toContain('• uno')
  })

  it('renders [label](url) links and bare URLs without trailing punctuation', () => {
    const out = html('mira [la guía](https://trtalk.dev/docs) o https://trtalk.dev/docs.')
    expect(out).toContain('<a href="https://trtalk.dev/docs" target="_blank" rel="noopener noreferrer">la guía</a>')
    expect(out).toContain('</a>.')
  })

  it('renders headings as bold lines (a bubble has no h1..h6)', () => {
    const out = html('## Horarios\nlun-vie')
    expect(out).toContain('<strong>Horarios</strong>')
    expect(out).not.toContain('#')
  })

  it('renders ``` fences as a code block', () => {
    const out = html('antes\n```js\nconst a = 1\n```\ndespués')
    expect(out).toContain('<pre><code>const a = 1</code></pre>')
    expect(out).toContain('antes')
    expect(out).toContain('después')
    expect(out).not.toContain('```')
  })

  it('never injects HTML from the message text', () => {
    const out = html('<img src=x onerror=alert(1)> **bold**')
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img')
    expect(out).toContain('<strong>bold</strong>')
  })

  it('preserves blank lines between paragraphs', () => {
    const out = html('hola\n\nadiós')
    expect(out).toContain('hola\n\nadiós')
  })
})
