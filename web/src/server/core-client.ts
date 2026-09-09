import { CHANNEL, type Config } from './config'
import type { CanonicalInbound } from './canonical'

/** The core's /ingest ack (ARCHITECTURE §5): empty messages = deferred reply. */
export interface IngestAck {
  messages: Array<{ type: string; text?: string | null; media_url?: string | null }>
  conversation_id?: string | null
}

export interface HistoryItem {
  id: string
  direction: 'in' | 'out'
  type: string
  text: string | null
  has_media: boolean
  created_at: string
}

export interface HistoryResponse {
  items: HistoryItem[]
  total: number
}

export interface CoreClient {
  ingest(payload: CanonicalInbound): Promise<IngestAck>
  history(externalId: string, limit: number): Promise<HistoryResponse>
}

/** HTTP client to the core, carrying the shared internal secret. */
export function createCoreClient(cfg: Config): CoreClient {
  function headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (cfg.internalApiKey) h['X-Internal-API-Key'] = cfg.internalApiKey
    return h
  }

  return {
    async ingest(payload) {
      const res = await fetch(`${cfg.coreUrl}/ingest`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`core /ingest ${res.status}`)
      return (await res.json()) as IngestAck
    },

    async history(externalId, limit) {
      const url = `${cfg.coreUrl}/conversations/${CHANNEL}/${encodeURIComponent(
        externalId,
      )}/messages?limit=${limit}`
      const res = await fetch(url, { headers: headers() })
      if (res.status === 404) return { items: [], total: 0 } // no thread yet
      if (!res.ok) throw new Error(`core history ${res.status}`)
      return (await res.json()) as HistoryResponse
    },
  }
}
