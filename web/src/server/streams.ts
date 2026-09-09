/**
 * The visitor → live SSE connection(s) registry (ADR-011 §3).
 *
 * In-memory ⇒ single replica (or sticky sessions) for the MVP. Horizontal
 * scale needs a shared pub/sub (Redis) or core-side fanout — a documented
 * follow-up, not assumed here.
 */

/** The subset of an Express Response the registry needs (keeps it testable). */
export interface SseSink {
  write(chunk: string): void
}

export interface StreamRegistry {
  /** Register a live connection; returns a disposer to call on close. */
  add(visitorId: string, sink: SseSink): () => void
  /** Push an SSE event to every open connection for a visitor; returns the count reached. */
  push(visitorId: string, event: string, data: unknown): number
  /** Open connection count for a visitor. */
  count(visitorId: string): number
}

function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export function createStreamRegistry(): StreamRegistry {
  const byVisitor = new Map<string, Set<SseSink>>()

  return {
    add(visitorId, sink) {
      let set = byVisitor.get(visitorId)
      if (!set) {
        set = new Set()
        byVisitor.set(visitorId, set)
      }
      set.add(sink)
      return () => {
        const s = byVisitor.get(visitorId)
        if (!s) return
        s.delete(sink)
        if (s.size === 0) byVisitor.delete(visitorId)
      }
    },

    push(visitorId, event, data) {
      const set = byVisitor.get(visitorId)
      if (!set || set.size === 0) return 0
      const payload = frame(event, data)
      let reached = 0
      for (const sink of set) {
        try {
          sink.write(payload)
          reached++
        } catch {
          // A dead sink; the connection's own 'close' handler will evict it.
        }
      }
      return reached
    },

    count(visitorId) {
      return byVisitor.get(visitorId)?.size ?? 0
    },
  }
}
