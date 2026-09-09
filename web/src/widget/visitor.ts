const KEY = 'trtalk_web_visitor'

function uuid(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  // Fallback for older engines: RFC-4122-ish from Math.random.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    const v = ch === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * The anonymous visitor identity (ADR-011 §2): a UUID in localStorage, minted
 * once and reused. Cleared storage = a new visitor (accepted trade-off).
 */
export function getVisitorId(store: Storage = localStorage): string {
  let id = store.getItem(KEY)
  if (!id) {
    id = uuid()
    store.setItem(KEY, id)
  }
  return id
}
