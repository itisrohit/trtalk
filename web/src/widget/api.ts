/** A chat message as the widget models it. `role` in = visitor, out = agent. */
export interface ChatMessage {
  role: 'in' | 'out'
  type: string
  text: string | null
  hasMedia?: boolean
  /** Local-only data URI for media the visitor just sent (image thumbnails). */
  src?: string
}

export interface OutboundWidgetMessage {
  type: 'text' | 'image' | 'audio'
  text?: string | null
  media?: { mime: string; dataUri: string } | null
}

export interface WidgetApi {
  /** Rehydrate the thread on open (oldest → newest). */
  history(visitor: string): Promise<ChatMessage[]>
  /** Send a message; returns any messages the core replied inline (sync mode). */
  send(visitor: string, msg: OutboundWidgetMessage): Promise<ChatMessage[]>
  /** Open the live SSE; `onMessage` fires per agent reply. Returns a closer. */
  openStream(visitor: string, onMessage: (m: ChatMessage) => void): () => void
}

interface RawMessage {
  type: string
  text?: string | null
  media_url?: string | null
}

export function createApi(gateway: string): WidgetApi {
  const base = gateway.replace(/\/$/, '')

  return {
    async history(visitor) {
      const res = await fetch(`${base}/history?visitor=${encodeURIComponent(visitor)}`)
      if (!res.ok) return []
      const body = (await res.json()) as {
        items: Array<{ direction: 'in' | 'out'; type: string; text: string | null; has_media: boolean }>
      }
      // The core returns newest-first; render oldest-first.
      return [...body.items].reverse().map((m) => ({
        role: m.direction,
        type: m.type,
        text: m.text,
        hasMedia: m.has_media,
      }))
    },

    async send(visitor, msg) {
      const res = await fetch(`${base}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitor, ...msg }),
      })
      const body = (await res.json().catch(() => ({ messages: [] }))) as { messages?: RawMessage[] }
      return (body.messages ?? []).map((m) => ({ role: 'out' as const, type: m.type, text: m.text ?? null }))
    },

    openStream(visitor, onMessage) {
      if (typeof EventSource === 'undefined') return () => {}
      const es = new EventSource(`${base}/stream?visitor=${encodeURIComponent(visitor)}`)
      es.onmessage = (ev: MessageEvent) => {
        try {
          const m = JSON.parse(ev.data) as RawMessage
          onMessage({ role: 'out', type: m.type, text: m.text ?? null })
        } catch {
          /* ignore malformed frames */
        }
      }
      return () => es.close()
    },
  }
}
