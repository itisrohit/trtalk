import type { Request, Response } from 'express'
import type { Config } from '../config'
import type { CoreClient } from '../core-client'
import { toCanonicalInbound, type WidgetMessage } from '../canonical'

/**
 * POST /chat — the widget's inbound. Translate to the canonical contract and
 * relay to the core's /ingest. With deferred dispatch (ADR-008) the ack is
 * empty and the real reply arrives later over SSE; with debounce=0 the ack
 * carries the reply and the widget renders it directly.
 */
export function chatRoute(cfg: Config, core: CoreClient) {
  return async (req: Request, res: Response) => {
    const { visitor, type, text, media } = (req.body ?? {}) as {
      visitor?: string
      type?: WidgetMessage['type']
      text?: string
      media?: WidgetMessage['media']
    }

    if (!visitor || !type) {
      res.status(400).json({ error: 'visitor and type are required' })
      return
    }

    const payload = toCanonicalInbound(visitor, { type, text, media })
    try {
      const ack = await core.ingest(payload)
      res.json(ack)
    } catch {
      // Core unreachable → a gateway-local, user-facing apology (EN default).
      res.status(502).json({ messages: [{ type: 'text', text: cfg.errorReply }] })
    }
  }
}
