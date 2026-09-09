import { h, render } from 'preact'
import { App } from './ui'
import { styles } from './styles'

// Capture the embedding <script> at module-eval time (not inside a later
// callback, where document.currentScript is null).
const currentScript = document.currentScript as HTMLScriptElement | null

function mount(): void {
  if (document.getElementById('trtalk-web-widget')) return
  const gateway =
    currentScript?.dataset.gateway ??
    (currentScript ? new URL(currentScript.src).origin : window.location.origin)

  const host = document.createElement('div')
  host.id = 'trtalk-web-widget'
  document.body.appendChild(host)

  // Shadow DOM: total style isolation from the host page (ADR-011 §1/§6).
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = styles
  shadow.appendChild(style)
  const mountPoint = document.createElement('div')
  shadow.appendChild(mountPoint)

  render(h(App, { gateway }), mountPoint)
}

// Mount after `load` (not DOMContentLoaded): the widget opens an SSE
// connection on mount, and a connection opened before `load` keeps the
// browser's loading spinner spinning forever on the host page.
if (document.readyState === 'complete') {
  mount()
} else {
  window.addEventListener('load', () => mount(), { once: true })
}
